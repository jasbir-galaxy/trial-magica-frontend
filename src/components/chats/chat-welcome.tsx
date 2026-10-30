"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useStore } from "zustand";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowUp, LoaderCircle } from "lucide-react";
import { MAX_TEXT_LENGTH } from "@/generated/chats";
import { COMPOSER_USAGE_LABEL } from "@/generated/tools";
import { startConversation } from "@/services/start-conversation";
import { runKeys } from "@/services/runs";
import { ApiError } from "@/services/api-client";
import { createHomeDraft, type PendingConversation } from "./home-draft";
import { chatKeys } from "./query-keys";
import { PlanModeToggle } from "./plan-mode-toggle";
import { CreditBalance } from "./credit-balance";
import styles from "./chats.module.css";

export function ChatWelcome() {
  const { userId, sessionId, getToken } = useAuth(), client = useQueryClient(), router = useRouter();
  const [draft] = useState(() => createHomeDraft(userId!, sessionId!));
  const text = useStore(draft, state => state.text), pending = useStore(draft, state => state.pending), hydrated = useStore(draft, state => state.hydrated);
  const planMode = useStore(draft, state => state.planMode);
  const lifetime = useRef<AbortController | null>(null), submitting = useRef(false);
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    void Promise.resolve(draft.persist.rehydrate()).finally(() => draft.getState().setHydrated());
    return () => controller.abort();
  }, [draft]);
  const start = useMutation({ retry: false, networkMode: "always",
    mutationFn: (request: PendingConversation) => startConversation(request, () => getToken(), chat => {
      draft.getState().rememberChat(chat.id); client.setQueryData(chatKeys.detail(userId!, chat.id), chat);
      void client.invalidateQueries({ queryKey: chatKeys.list(userId!) });
    }, lifetime.current!.signal),
    onSuccess: result => {
      if (lifetime.current?.signal.aborted) return;
      client.setQueryData(runKeys.latest(userId!, result.chat.id), { run: result.run });
      if (result.realtime) client.setQueryData(runKeys.realtime(userId!, result.run.id), result.realtime);
      draft.getState().clear(); router.push(`/chats/${result.chat.id}`);
    },
    onSettled: () => { submitting.current = false; },
  });
  function submit() {
    if (submitting.current || !hydrated || (!pending && !text.trim())) return;
    const request = draft.getState().prepare(); submitting.current = true; start.mutate(request);
  }
  const locked = !!pending || start.isPending;
  return <><CreditBalance active={false} /><section className={styles.homeWelcome}>
    <Image src="/brand/mark.svg" width={32} height={32} alt="" />
    <h1>Your AI worker</h1><p>Work at the speed of thought.</p>
    <form className={`${styles.composer} ${styles.homeComposer}`} aria-label="Start a conversation" onSubmit={event => { event.preventDefault(); submit(); }}>
      <label className={styles.srOnly} htmlFor="first-message">Message</label>
      <textarea id="first-message" rows={2} value={pending?.turn.text ?? text} maxLength={MAX_TEXT_LENGTH} readOnly={locked || !hydrated} placeholder="Assign a task or ask anything…"
        onChange={event => draft.getState().setText(event.target.value)}
        onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} />
      <div className={styles.composerTools}><PlanModeToggle enabled={pending?.turn.planMode ?? planMode} disabled={locked || !hydrated} onChange={value => draft.getState().setPlanMode(value)} /><span className={styles.srOnly}>{COMPOSER_USAGE_LABEL}</span></div>
      <div className={styles.composerActions}><button type="submit" className={styles.sendButton} title={pending ? "Retry send" : "Send message"} aria-label={start.isPending ? "Sending…" : pending ? "Retry send" : "Send message"} disabled={!hydrated || start.isPending || (!pending && !text.trim())}>
        {start.isPending ? <LoaderCircle size={17} aria-hidden="true" /> : <ArrowUp size={18} aria-hidden="true" />}
      </button></div>
      {start.isError ? <div className={styles.error} role="alert"><p>{start.error instanceof ApiError ? start.error.message : "Your conversation could not be started. Try again."} Retrying uses the same saved request.</p>
        {pending?.chatId ? <Link href={`/chats/${pending.chatId}`}>Open saved conversation</Link> : null}</div> : pending && !start.isPending ? <p role="status" className={styles.hint}>A previous send needs confirmation. Retry to check the saved request.</p> : null}
    </form>
  </section></>;
}
