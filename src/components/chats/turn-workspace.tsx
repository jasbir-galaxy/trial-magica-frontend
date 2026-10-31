"use client";

import dynamic from "next/dynamic";
import { PlanModeToggle } from "./plan-mode-toggle";
import { PLAN_MODE } from "@/generated/plans";
import { MessageTimeline } from "./message-timeline";
import { MessageBody } from "./message-body";
import Image from "next/image";
import { ArrowUp, Square, LoaderCircle } from "lucide-react";
import { useStore } from "zustand";
import { createUploadDraft } from "@/uploads/draft";
import { resolveAttachments, uploadKeys } from "@/services/uploads";
import { CreditBalance } from "./credit-balance";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRealtimeRun, useRealtimeStream } from "@trigger.dev/react-hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAX_TEXT_LENGTH, type Message } from "@/generated/chats";
import { FREE_CHAT_MODEL, isActiveRun, RunMetadataSchema, TEXT_STREAM_ID, TEXT_STREAM_TIMEOUT_SECONDS, TextFrameSchema, type Run, type Realtime, type SendTurn } from "@/generated/runs";
import { latestTurn, realtimeToken, runKeys, sendTurn, stopTurn } from "@/services/runs";
import { ApiError } from "@/services/api-client";
import { chatKeys } from "./query-keys";
import { COMPOSER_USAGE_LABEL, formatCredits } from "@/generated/tools";
import styles from "./chats.module.css";

const AttachmentComposer = dynamic(() => import("./attachment-composer"), { ssr: false });

function LiveReply({ run, access, refresh, complete }: { run: Run; access: Realtime; refresh: () => Promise<string>; complete: () => void }) {
  const stream = useRealtimeStream<unknown>(access.runId, TEXT_STREAM_ID, {
    accessToken: access.accessToken, refreshAccessToken: refresh, from: "latest", maxParts: 1, throttleInMs: 80, timeoutInSeconds: TEXT_STREAM_TIMEOUT_SECONDS,
  });
  const realtime = useRealtimeRun(access.runId, { accessToken: access.accessToken, refreshAccessToken: refresh,
    skipColumns: ["payload", "output"], onComplete: complete });
  const frame = TextFrameSchema.safeParse(stream.parts?.at(-1));
  const progress = RunMetadataSchema.safeParse(realtime.run?.metadata);
  const current = frame.success && frame.data.sequence >= run.sequence ? frame.data : undefined;
  return <>
    <MessageBody message={run.assistantMessage} frame={current} />
    <p className={styles.hint} role="status">{run.status === "stopping" ? "Stopping…" :
      run.assistantMessage.tools?.some(tool => tool.approval?.status === "pending" && tool.status === "awaiting_approval") ? (run.assistantMessage.tools.some(tool => tool.approval?.kind === "plan" && tool.approval.status === "pending") ? PLAN_MODE.pending : "Waiting for your approval…") :
      stream.error || realtime.error ? "Live connection interrupted. Checking your saved reply…" :
      progress.success && ["writing", "working"].includes(progress.data.step) ? "Working…" : "Thinking…"}</p>
  </>;
}

export function TurnWorkspace({ chatId, messages, hasOlder = false }: { chatId: string; messages: Message[]; hasOlder?: boolean }) {
  const { userId, getToken } = useAuth();
  const client = useQueryClient();
  const [text, setText] = useState("");
  const [planMode, setPlanMode] = useState(false);
  const [attachmentDraft] = useState(() => createUploadDraft(userId!, chatId));
  const selected = useStore(attachmentDraft, state => state.selected);
  const hydrated = useStore(attachmentDraft, state => state.hydrated);
  useEffect(() => { void Promise.resolve(attachmentDraft.persist.rehydrate()).finally(() => attachmentDraft.getState().setHydrated()); }, [attachmentDraft]);
  const selectedIds = selected.map(file => file.id);
  const attachments = useQuery({ queryKey: uploadKeys.selected(userId!, selectedIds), queryFn: ({ signal }) => resolveAttachments(selectedIds, () => getToken(), signal), enabled: hydrated && selected.length > 0,
    retry: 2, refetchInterval: query => query.state.fetchFailureCount >= 3 ? false : query.state.data?.items.length === selected.length && query.state.data.items.every(file => ["ready", "failed", "cancelled"].includes(file.status)) ? 60_000 : 2000 });
  const filesReady = !selected.length || selected.every(file => attachments.data?.items.some(item => item.id === file.id && item.status === "ready" && !!item.url));
  const [pendingRequest, setPendingRequest] = useState<SendTurn | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [followKey, setFollowKey] = useState<string | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort(); }, []);
  const key = runKeys.latest(userId!, chatId);
  const state = useQuery({
    queryKey: key, queryFn: ({ signal }) => latestTurn(chatId, () => getToken(), signal),
    refetchInterval: query => query.state.fetchFailureCount >= 3 ? false : query.state.data?.run && (isActiveRun(query.state.data.run.status) || query.state.data.run.assistantMessage.tools?.some(t => ["pending", "awaiting_approval", "submitting", "running"].includes(t.status))) ? 1500 : false,
    retry: (count, error) => count < 2 && error instanceof ApiError && error.retryable,
  });
  const run = state.data?.run;
  const active = !!run && isActiveRun(run.status);
  const access = useQuery({ queryKey: runKeys.realtime(userId!, run?.id ?? "none"),
    queryFn: ({ signal }) => realtimeToken(run!.id, () => getToken(), signal),
    enabled: active && !!run?.triggerRunId, staleTime: 10 * 60_000, retry: 2 });
  const refetchState = state.refetch;
  const complete = useCallback(() => { void refetchState(); }, [refetchState]);
  const refresh = useCallback(async () => {
    const token = await realtimeToken(run!.id, () => getToken());
    if (!token) throw new Error("Live updates are temporarily unavailable.");
    return token.accessToken;
  }, [run, getToken]);
  const runId = run?.id, runStatus = run?.status;
  useEffect(() => {
    if (runId && runStatus && !isActiveRun(runStatus)) void client.invalidateQueries({ queryKey: chatKeys.messages(userId!, chatId) });
    void client.invalidateQueries({ queryKey: ["credits", userId] });
  }, [runId, runStatus, client, userId, chatId]);
  const send = useMutation({
    networkMode: "always", retry: false,
    mutationFn: (request: SendTurn) => sendTurn(chatId, request, () => getToken(), lifetime.current?.signal),
    onSuccess: result => {
      if (lifetime.current?.signal.aborted) return;
      client.setQueryData(key, { run: result.run });
      if (result.realtime) client.setQueryData(runKeys.realtime(userId!, result.run.id), result.realtime);
      setFollowKey(result.run.requestId);
      setText(""); setPendingRequest(null); attachmentDraft.getState().clear();
      void client.invalidateQueries({ queryKey: chatKeys.messages(userId!, chatId) });
      input.current?.focus();
    },
    onError: error => {
      if (lifetime.current?.signal.aborted) return;
      if (error instanceof ApiError && error.status && error.status < 500 && error.status !== 429) setPendingRequest(null);
      void state.refetch();
    },
  });
  const stop = useMutation({ mutationFn: () => stopTurn(run!.id, () => getToken(), lifetime.current?.signal), retry: false, networkMode: "always",
    onSuccess: result => { if (!lifetime.current?.signal.aborted) client.setQueryData(key, { run: result }); } });
  function submit(value = text, retryIds?: string[], mode = planMode) {
    if (send.isPending || active || (!value.trim() && !(retryIds ?? selectedIds).length) || state.isPending || state.isError || (!retryIds && (!hydrated || !filesReady))) return;
    const request = pendingRequest ?? { requestId: crypto.randomUUID(), text: value.trim(), model: FREE_CHAT_MODEL, planMode: mode, ...((retryIds ?? selectedIds).length ? { attachmentIds: retryIds ?? selectedIds } : {}) };
    setPendingRequest(request); send.mutate(request);
  }
  const userMessage = run?.userMessage, assistantMessage = run?.assistantMessage;
  const ordered = useMemo(() => {
    const merged = new Map(messages.map(message => [message.id, message]));
    if (userMessage && assistantMessage) { merged.set(userMessage.id, userMessage); merged.set(assistantMessage.id, assistantMessage); }
    return [...merged.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }, [messages, userMessage, assistantMessage]);
  const denied = state.error instanceof ApiError && [401, 404].includes(state.error.status ?? 0);
  if (denied) return <p role="alert">This conversation is unavailable. Please sign in again.</p>;
  return <>
    <CreditBalance active={active} />
    <div className={styles.turnWorkspace}>
    {ordered.length ? <MessageTimeline messages={ordered} activeMessageId={active ? run.assistantMessage.id : undefined} followKey={followKey} hasOlder={hasOlder}
      renderMessage={message => <div className={styles.message} data-role={message.role}>
        <div className={styles.messageMeta}><span>{message.role === "user" ? "You" : message.role === "assistant" ? "Magica" : "Note"}</span>
          <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC</time></div>
        {active && message.id === run.assistantMessage.id && access.data ?
          <LiveReply key={run.id} run={run} access={access.data} refresh={refresh} complete={complete} /> : <MessageBody message={message} />}
        {active && message.id === run.assistantMessage.id && !access.data ? <p role="status" className={styles.hint}>{run.status === "queued" ? "Waiting to start…" : run.status === "stopping" ? "Stopping…" : "Working…"}</p> : null}
      </div>}
      footer={<>
    {run && !active && ["failed", "cancelled"].includes(run.status) && !run.assistantMessage.tools?.length ? <button type="button" className={styles.secondary}
      disabled={send.isPending || !!pendingRequest} onClick={() => { const retryText = run.userMessage.content.map(b => b.type === "text" ? b.text : "").join("\n"); setText(retryText); submit(retryText, run.userMessage.attachments?.map(file => file.id) ?? [], run.planMode ?? false); }}>Retry reply</button> : null}
    {run?.assistantMessage.tools?.length ? <p className={styles.hint}>Tool usage: {formatCredits(run.applicationCredits)}. {run.assistantMessage.tools.some(tool => tool.status === "awaiting_approval" && tool.approval?.status === "pending") ? "Review the pending approval to continue." : active || run.assistantMessage.tools.some(tool => ["pending", "awaiting_approval", "submitting", "running"].includes(tool.status)) ? "Work is in progress." : "Available results are saved; send a follow-up to continue."}</p> : null}
      </>} /> : <div className={styles.turnHistory}><div className={styles.emptyConversation}><Image src="/brand/mark.svg" width={32} height={32} alt="" /><h2>What can I help you with?</h2><p>Assign a task or ask anything.</p></div></div>}
    <form className={styles.composer} onSubmit={event => { event.preventDefault(); submit(); }}>
      <label className={styles.srOnly} htmlFor={`message-${chatId}`}>Message</label>
      <textarea ref={input} id={`message-${chatId}`} value={text} maxLength={MAX_TEXT_LENGTH} rows={2}
        placeholder="Assign a task or ask anything…" readOnly={send.isPending || !!pendingRequest}
        onChange={event => setText(event.target.value)}
        onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} />
      <div className={styles.composerTools}><AttachmentComposer chatId={chatId} draft={attachmentDraft} resolved={attachments.data?.items ?? []} locked={send.isPending || !!pendingRequest} /><PlanModeToggle enabled={planMode} disabled={send.isPending || !!pendingRequest} onChange={setPlanMode} /></div>
      <div className={styles.composerActions}><span className={styles.srOnly}>{COMPOSER_USAGE_LABEL}</span>
        {active ? <button type="button" className={styles.sendButton} aria-label={run.status === "stopping" || stop.isPending ? "Stopping…" : "Stop reply"} title="Stop reply" disabled={stop.isPending || run.status === "stopping"} onClick={() => stop.mutate()}><Square size={15} fill="currentColor" aria-hidden="true" /></button> :
          <button className={styles.sendButton} aria-label={send.isPending ? "Sending…" : pendingRequest ? "Retry send" : "Send message"} title={pendingRequest ? "Retry send" : "Send message"} disabled={send.isPending || (!text.trim() && !selected.length) || !hydrated || !filesReady || state.isPending || state.isError}>{send.isPending ? <LoaderCircle size={17} aria-hidden="true" /> : <ArrowUp size={18} aria-hidden="true" />}</button>}
      </div>
      {attachments.isError ? <p className={styles.error} role="alert">Unable to check selected files. <button type="button" onClick={() => void attachments.refetch()}>Retry file check</button></p> : null}
      <p className={styles.srOnly}>Enter to send · Shift+Enter for a new line</p>
      {send.error || stop.error ? <p className={styles.error} role="alert">{(send.error ?? stop.error) instanceof ApiError ? (send.error ?? stop.error)?.message : "Unable to complete this action. Please try again."}</p> : null}
      {state.isError ? <p className={styles.error} role="alert">Unable to check this conversation. <button type="button" onClick={() => void state.refetch()}>Reconnect</button></p> : null}
    </form>
    </div>
  </>;
}
