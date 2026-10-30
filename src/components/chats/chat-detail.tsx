"use client";

import { useAuth } from "@clerk/nextjs";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { ChatIdSchema } from "@/generated/chats";
import { ApiError } from "@/services/api-client";
import { getChat, listMessages } from "@/services/chats";
import { chatKeys } from "./query-keys";
import { TurnWorkspace } from "./turn-workspace";
import styles from "./chats.module.css";

export function ChatDetail({ chatId }: { chatId: string }) {
  const { userId, getToken } = useAuth();
  const heading = useRef<HTMLHeadingElement>(null);
  const valid = ChatIdSchema.safeParse(chatId).success;
  const chat = useQuery({
    queryKey: chatKeys.detail(userId!, chatId),
    queryFn: ({ signal }) => getChat(chatId, () => getToken(), signal), enabled: valid,
  });
  const history = useInfiniteQuery({
    queryKey: chatKeys.messages(userId!, chatId),
    queryFn: ({ signal, pageParam }) => listMessages(chatId, () => getToken(), pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: page => page.nextCursor ?? undefined, enabled: valid,
  });
  useEffect(() => { if (chat.isSuccess) heading.current?.focus(); }, [chatId, chat.isSuccess]);
  const messages = useMemo(() => history.data?.pages.flatMap(page => page.items).reverse() ?? [], [history.data]);
  const error = chat.error ?? history.error;
  if (!valid || (error instanceof ApiError && error.status === 404)) return <section className={styles.welcome}>
    <h1>Chat not found</h1><p>This chat is unavailable or doesn’t belong to your account.</p>
    <Link className={styles.secondary} href="/chats">Back to your chats</Link>
  </section>;
  if (error && !(history.isFetchNextPageError && !chat.isError)) return <section className={styles.welcome}>
    <h1>Unable to open this chat</h1>
    <p role="alert">{error instanceof ApiError ? error.message : "Please try again."}</p>
    <button className={styles.secondary} disabled={chat.isFetching || history.isFetching || chat.isPaused || history.isPaused}
      onClick={() => { void chat.refetch(); void history.refetch(); }}>Try again</button>
  </section>;
  if (chat.isPaused || history.isPaused) return <section className={styles.welcome}><p role="status">You’re offline. Reconnect to open this chat.</p></section>;
  if (!chat.data || history.isPending) return <section className={styles.welcome}><p role="status">Loading conversation…</p></section>;
  return <section className={styles.conversation} aria-label="Conversation">
    <header className={styles.conversationHeader}>
      <h1 ref={heading} tabIndex={-1}>{chat.data.title}</h1>
    </header>
    {history.isFetchNextPageError ? <p role="alert" className={styles.error}>More messages could not be loaded.</p> : null}
    {history.hasNextPage ? <button className={styles.secondary} disabled={history.isFetching}
      onClick={() => void history.fetchNextPage({ cancelRefetch: false })}>{history.isFetchingNextPage ? "Loading…" : history.isFetchNextPageError ? "Try again" : "Load older messages"}</button> : null}
    <TurnWorkspace key={chatId} chatId={chatId} messages={messages} hasOlder={history.hasNextPage} />
  </section>;
}
