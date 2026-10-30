import type { PendingConversation } from "@/components/chats/home-draft";
import type { Chat } from "@/generated/chats";
import { createChat } from "./chats";
import { sendTurn } from "./runs";

export async function startConversation(request: PendingConversation, getToken: () => Promise<string | null>, onCreated: (chat: Chat) => void, signal: AbortSignal) {
  // Both routes are idempotent. A retry after either response is lost reuses
  // the same chat and turn; it never guesses whether the server accepted a write.
  const chat = await createChat(request.chat, getToken, signal);
  signal.throwIfAborted(); onCreated(chat);
  const result = await sendTurn(chat.id, request.turn, getToken, signal);
  signal.throwIfAborted(); return { chat, ...result };
}
