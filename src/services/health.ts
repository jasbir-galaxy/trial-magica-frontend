import { HealthResponseSchema } from "@/generated/health";
import { apiGet } from "./api-client";

export function getHealth(signal?: AbortSignal) {
  return apiGet("/api/health", HealthResponseSchema, signal);
}
