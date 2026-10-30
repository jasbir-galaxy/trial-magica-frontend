import { ChatSession } from "@/components/chats/chat-session";
import { Suspense } from "react";
import { ChatDetail } from "@/components/chats/chat-detail";

async function Conversation({ params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await params;
  return <ChatSession><ChatDetail key={chatId} chatId={chatId} /></ChatSession>;
}
export default function ChatPage({ params }: { params: Promise<{ chatId: string }> }) {
  return <Suspense fallback={<p className="p-8" role="status">Loading conversation…</p>}>
    <Conversation params={params} />
  </Suspense>;
}
