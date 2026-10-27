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

it("sends a fresh bearer token through the centralized client", async () => {
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com");
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ status: "ok" })));
  vi.stubGlobal("fetch", fetch);
  const token = vi.fn().mockResolvedValueOnce("first-token").mockResolvedValueOnce("second-token");
  await apiGet("/api/health", HealthResponseSchema, undefined, token);
  await apiGet("/api/health", HealthResponseSchema, undefined, token);
  expect(fetch.mock.calls[0][1].headers.get("Authorization")).toBe("Bearer first-token");
  expect(fetch.mock.calls[1][1].headers.get("Authorization")).toBe("Bearer second-token");
  expect(fetch.mock.calls[0][1].credentials).toBe("omit");
});
it("does not send a protected request while signed out", async () => {
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com");
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await expect(apiGet("/api/health", HealthResponseSchema, undefined, async () => null)).rejects.toMatchObject({ status: 401, retryable: false });
  expect(fetch).not.toHaveBeenCalled();
});
it("does not retry a rejected session or expose its response body", async () => {
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private auth details", { status: 401 })));
  await expect(request()).rejects.toMatchObject({ status: 401, retryable: false, message: "Your session could not be verified. Please sign in again." });
});
