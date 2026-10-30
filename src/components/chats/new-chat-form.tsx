"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CreateChatSchema, MAX_CHAT_TITLE_LENGTH, type CreateChat } from "@/generated/chats";
import { createChat } from "@/services/chats";
import { ApiError } from "@/services/api-client";
import { chatKeys } from "./query-keys";
import styles from "./chats.module.css";

export function NewChatForm({ onClose, onCreated }: { onClose: () => void; onCreated?: () => void }) {
  const { userId, getToken } = useAuth();
  const router = useRouter();
  const cache = useQueryClient();
  const [title, setTitle] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const request = useRef<CreateChat | null>(null);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);
  const mutation = useMutation({
    networkMode: "always",
    mutationFn: async (input: CreateChat) => {
      if (!mounted.current) throw new DOMException("Cancelled", "AbortError");
      controller.current = new AbortController();
      return createChat(input, () => getToken(), controller.current.signal);
    },
    onSuccess: chat => {
      if (!mounted.current || controller.current?.signal.aborted) return;
      cache.setQueryData(chatKeys.detail(userId!, chat.id), chat);
      void cache.invalidateQueries({ queryKey: chatKeys.list(userId!) });
      router.push(`/chats/${chat.id}`);
      onClose(); onCreated?.();
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    if (!request.current) {
      const parsed = CreateChatSchema.safeParse({ title: title.trim() || undefined, requestId: crypto.randomUUID() });
      if (!parsed.success) { setInputError("Enter a shorter chat title."); return; }
      request.current = parsed.data;
    }
    setInputError(null);
    mutation.mutate(request.current);
  }
  return <form className={styles.createForm} onSubmit={submit} aria-label="Create a chat">
    <label htmlFor="chat-title">Chat title <span className={styles.optional}>(optional)</span></label>
    <input id="chat-title" value={title} maxLength={MAX_CHAT_TITLE_LENGTH} autoFocus
      readOnly={mutation.isPending || mutation.isError} onChange={event => setTitle(event.target.value)}
      placeholder="What’s this chat about?" aria-describedby={inputError ? "title-error" : undefined} />
    {inputError ? <p id="title-error" role="alert">{inputError}</p> : null}
    {mutation.isError ? <p role="alert" className={styles.error}>
      {mutation.error instanceof ApiError ? mutation.error.message : "Your chat could not be created. Try again."}
    </p> : null}
    <div className={styles.formActions}>
      <button className={styles.primary} type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Creating…" : mutation.isError ? "Try again" : "Create chat"}
      </button>
      <button className={styles.secondary} type="button" disabled={mutation.isPending} onClick={onClose}>Cancel</button>
    </div>
  </form>;
}
