import { Suspense } from "react";
import { ChatCache } from "@/components/chats/chat-session";

export default function ChatsLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<main className="p-8" role="status">Loading your chats…</main>}>
    <ChatCache>{children}</ChatCache>
  </Suspense>;
}
