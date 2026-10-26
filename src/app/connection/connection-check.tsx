"use client";

import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getHealth } from "@/services/health";
import { ApiError } from "@/services/api-client";

function ConnectionStatus() {
  const query = useQuery({
    queryKey: ["health"],
    queryFn: ({ signal }) => getHealth(signal),
    retry: (count, error) => count < 2 && error instanceof ApiError && error.retryable,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const message = query.isPaused ? "You appear to be offline. Reconnect to continue."
    : query.isFetching ? "Checking connection…"
    : query.isError ? query.error.message
    : query.isSuccess ? "Connected successfully."
    : "Waiting to check connection…";

  return (
    <section className="flex flex-col gap-4 rounded-lg border p-5" aria-label="Service connection">
      <p role="status" aria-live="polite">{message}</p>
      <button type="button" disabled={query.isFetching || query.isPaused}
        onClick={() => void query.refetch()}
        className="self-start rounded-md bg-primary px-4 py-2 text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">
        {query.isError ? "Try again" : "Check again"}
      </button>
    </section>
  );
}

export function ConnectionCheck() {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}><ConnectionStatus /></QueryClientProvider>;
}
