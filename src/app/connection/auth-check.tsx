"use client";

import { useAuth } from "@clerk/nextjs";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getCurrentUser } from "@/services/current-user";
import { ApiError } from "@/services/api-client";

function AuthStatus({ userId }: { userId: string }) {
  const { getToken } = useAuth();
  const query = useQuery({
    queryKey: ["current-user", userId],
    queryFn: ({ signal }) => getCurrentUser(() => getToken(), signal),
    retry: (count, error) => count < 2 && error instanceof ApiError && error.retryable,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    refetchOnWindowFocus: false,
  });
  const message = query.isPaused ? "Reconnect to verify your account."
    : query.isFetching ? "Verifying your account…"
    : query.isError ? query.error.message
    : query.data?.userId === userId ? "Backend authentication verified."
    : "The verified account does not match. Please sign out and try again.";
  return (
    <section className="flex flex-col gap-4 rounded-lg border p-5" aria-label="Backend authentication">
      <h2 className="font-semibold">Account connection</h2>
      <p role="status">{message}</p>
      <button type="button" disabled={query.isFetching || query.isPaused} onClick={() => void query.refetch()}
        className="self-start rounded-md bg-primary px-4 py-2 text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">
        Verify again
      </button>
    </section>
  );
}

function SessionQueries({ userId }: { userId: string }) {
  const [client] = useState(() => new QueryClient());
  // A session change unmounts this provider, aborts in-flight work, and clears identity data.
  useEffect(() => () => { client.clear(); }, [client]);
  return <QueryClientProvider client={client}><AuthStatus userId={userId} /></QueryClientProvider>;
}

export function AuthCheck() {
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();
  if (!isLoaded) return <p role="status">Loading account…</p>;
  if (!isSignedIn || !userId) return <p role="status">Sign in to verify backend authentication.</p>;
  return <SessionQueries key={sessionId} userId={userId} />;
}
