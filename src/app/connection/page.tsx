import { Suspense } from "react";
import { AuthCheck } from "./auth-check";
import { ConnectionCheck } from "./connection-check";

export default function ConnectionPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Connection check</h1>
      <p className="text-muted-foreground">Check whether this app can reach the service.</p>
      <ConnectionCheck />
      <Suspense fallback={<p role="status">Loading account…</p>}><AuthCheck /></Suspense>
    </main>
  );
}
