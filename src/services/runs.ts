import { z } from "zod";
import { CHATS_PATH, ChatIdSchema } from "@/generated/chats";
import { RealtimeSchema, RunSchema, RunStateSchema, SendTurnSchema, SendTurnResultSchema, type SendTurn } from "@/generated/runs";
import { apiGet, apiPost } from "./api-client";
type GetToken = () => Promise<string | null>;
const path = (chatId: string) => `${CHATS_PATH}/${ChatIdSchema.parse(chatId)}/turns`;
export const runKeys = {
  latest: (userId: string, chatId: string) => ["run", userId, chatId] as const,
  realtime: (userId: string, runId: string) => ["realtime", userId, runId] as const,
};
export function latestTurn(chatId: string, getToken: GetToken, signal?: AbortSignal) {
  return apiGet(path(chatId), RunStateSchema, signal, getToken);
}
export function sendTurn(chatId: string, input: SendTurn, getToken: GetToken, signal?: AbortSignal) {
  return apiPost(path(chatId), SendTurnResultSchema, SendTurnSchema.parse(input), getToken, signal);
}
export function stopTurn(runId: string, getToken: GetToken, signal?: AbortSignal) {
  return apiPost(`/api/app/v1/runs/${z.uuid().parse(runId)}/stop`, RunSchema, {}, getToken, signal);
}
export function realtimeToken(runId: string, getToken: GetToken, signal?: AbortSignal) {
  return apiPost(`/api/app/v1/runs/${z.uuid().parse(runId)}/realtime`, RealtimeSchema.nullable(), {}, getToken, signal);
}
