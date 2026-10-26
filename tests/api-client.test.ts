import { afterEach, expect, it, vi } from "vitest";
import { apiGet } from "../src/services/api-client";
import { HealthResponseSchema } from "../src/generated/health";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const request = () => apiGet("/api/health", HealthResponseSchema);
it("validates the response and permits additive fields", async () => {
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ status: "ok", extra: true })));
  await expect(request()).resolves.toEqual({ status: "ok" });
});
it("rejects malformed responses without retrying", async () => {
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ status: "broken" })));
  await expect(request()).rejects.toMatchObject({ retryable: false });
});
it("does not expose upstream error bodies", async () => {
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private details", { status: 503 })));
  await expect(request()).rejects.toMatchObject({ retryable: true, message: "The service is unavailable. Please try again." });
});
it("fails before fetching when configuration is absent", async () => {
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await expect(request()).rejects.toMatchObject({ retryable: false });
  expect(fetch).not.toHaveBeenCalled();
});
