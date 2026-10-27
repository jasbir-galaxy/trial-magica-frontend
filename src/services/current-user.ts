import { CURRENT_USER_PATH, CurrentUserSchema } from "@/generated/current-user";
import { apiGet } from "./api-client";

export function getCurrentUser(getToken: () => Promise<string | null>, signal?: AbortSignal) {
  return apiGet(CURRENT_USER_PATH, CurrentUserSchema, signal, getToken);
}
