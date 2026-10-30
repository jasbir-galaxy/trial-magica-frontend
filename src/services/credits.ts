import { CreditsSchema, CreditHistorySchema } from "@/generated/credits";
import { apiGet } from "./api-client";
type GetToken = () => Promise<string | null>;
export const creditKeys = { balance: (userId: string) => ["credits", userId, "balance"] as const, ledger: (userId: string) => ["credits", userId, "ledger"] as const };
export function getCredits(getToken: GetToken, signal?: AbortSignal) { return apiGet("/api/app/v1/credits", CreditsSchema, signal, getToken); }
export function getCreditHistory(getToken: GetToken, cursor?: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ limit: "20", ...(cursor ? { cursor } : {}) });
  return apiGet(`/api/app/v1/credits/ledger?${query}`, CreditHistorySchema, signal, getToken);
}
