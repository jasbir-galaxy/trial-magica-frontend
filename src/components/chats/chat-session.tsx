"use client";

import { SignInButton, useAuth } from "@clerk/nextjs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { ApiError } from "@/services/api-client";
import { ChatShell } from "./chat-shell";
import styles from "./chats.module.css";

function SessionQueries({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: {
    retry: (attempt, error) => attempt < 1 && error instanceof ApiError && error.retryable,
    refetchOnWindowFocus: false,
  }, mutations: { retry: false } } }));
  useEffect(() => () => { client.clear(); }, [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export function ChatCache({ children }: { children: ReactNode }) {
  const { userId, sessionId } = useAuth();
  // Layouts always render their route children so Next.js can validate navigation.
  // The page-level ChatSession gates UI; this boundary owns per-session caches.
  return <SessionQueries key={`${userId ?? "guest"}:${sessionId ?? "none"}`}>{children}</SessionQueries>;
}

export function ChatSession({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();
  if (!isLoaded) return <main className={styles.welcome}><p role="status">Loading your account…</p></main>;
  if (!isSignedIn || !userId || !sessionId) return <main className={styles.welcome}>
    <p className={styles.eyebrow}>Your workspace</p>
    <h1>Keep your conversations together.</h1>
    <p>Sign in to create a chat and return to your conversation history.</p>
    <SignInButton mode="modal" forceRedirectUrl="/chats"><button className={styles.primary}>Sign in to your chats</button></SignInButton>
  </main>;
  return <>
    <a className={styles.skipLink} href="#chat-content">Skip to conversation</a>
    <ChatShell>{children}</ChatShell>
  </>;
}
