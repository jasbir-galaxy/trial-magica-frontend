import { CHATS_PATH, ChatIdSchema, ChatPageSchema, ChatSchema, CreateChatSchema, MessagePageSchema, FavoriteChatSchema, DeleteChatResultSchema, ChatSearchSchema, ChatViewSchema, type ChatView, type CreateChat } from "@/generated/chats";
import { apiGet, apiPost, apiPatch, apiDelete } from "./api-client";

type GetToken = () => Promise<string | null>;
const chatPath = (id: string) => `${CHATS_PATH}/${ChatIdSchema.parse(id)}`;

export function listChats(getToken: GetToken, cursor?: string, signal?: AbortSignal, filters?: { q: string; view: ChatView }) {
  const q = filters ? ChatSearchSchema.parse(filters.q) : "", view = filters ? ChatViewSchema.parse(filters.view) : "all";
  const query = new URLSearchParams({ ...(cursor ? { cursor } : {}), ...(q ? { q } : {}), ...(view !== "all" ? { view } : {}) });
  return apiGet(`${CHATS_PATH}${query.size ? `?${query}` : ""}`, ChatPageSchema, signal, getToken);
}
export function favoriteChat(id: string, isFavorite: boolean, getToken: GetToken, signal?: AbortSignal) {
  return apiPatch(chatPath(id), ChatSchema, FavoriteChatSchema.parse({ isFavorite }), getToken, signal);
}
export function deleteChat(id: string, getToken: GetToken, signal?: AbortSignal) {
  return apiDelete(chatPath(id), DeleteChatResultSchema, getToken, signal);
}
export function restoreChat(id: string, getToken: GetToken, signal?: AbortSignal) {
  return apiPost(`${chatPath(id)}/restore`, ChatSchema, {}, getToken, signal);
}
export function createChat(input: CreateChat, getToken: GetToken, signal?: AbortSignal) {
  return apiPost(CHATS_PATH, ChatSchema, CreateChatSchema.parse(input), getToken, signal);
}
export function getChat(id: string, getToken: GetToken, signal?: AbortSignal) {
  return apiGet(chatPath(id), ChatSchema, signal, getToken);
}
export function listMessages(id: string, getToken: GetToken, cursor?: string, signal?: AbortSignal) {
  return apiGet(`${chatPath(id)}/messages?${new URLSearchParams({ order: "desc", ...(cursor ? { cursor } : {}) })}`, MessagePageSchema, signal, getToken);
}
