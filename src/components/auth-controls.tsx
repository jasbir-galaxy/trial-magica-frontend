import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { Suspense } from "react";

export function AuthControls() {
  return (
    <header className="flex items-center justify-between border-b px-6 py-4">
      <Link href="/" className="font-semibold">Magica Trial</Link>
      <nav aria-label="Account" className="flex items-center gap-4">
        <Suspense fallback={<span role="status">Loading account…</span>}>
          <Show when="signed-out">
            <SignInButton />
            <SignUpButton />
          </Show>
          <Show when="signed-in"><UserButton /></Show>
        </Suspense>
      </nav>
    </header>
  );
}
