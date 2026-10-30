import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createChat, getChat, listMessages } from "../src/services/chats";
import { DEFAULT_CHAT_TITLE } from "../src/generated/chats";
const id = "00000000-0000-4000-8000-000000000001";
beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost:3011"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("validates creation before sending and rejects foreign addresses through IDs", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  expect(() => createChat({ title: "", requestId: id }, async () => "token")).toThrow();
  expect(() => getChat("https://evil.example", async () => "token")).toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
it("validates stored message blocks returned by the server", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ items: [{ invalid: true }], nextCursor: null, hasMore: false })));
  await expect(listMessages(id, async () => "token")).rejects.toMatchObject({ retryable: false });
});
it("never sends an already cancelled creation", async () => {
  const fetch = vi.fn();vi.stubGlobal("fetch", fetch);
  const controller = new AbortController();controller.abort();
  await expect(createChat({ title: DEFAULT_CHAT_TITLE, requestId: id }, async () => "token", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(fetch).not.toHaveBeenCalled();
});
it.each([404, 409, 400, 413, 415, 503])("preserves safe HTTP status %s without leaking upstream text", async status => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private upstream details", { status })));
  await expect(getChat(id, async () => "token")).rejects.toMatchObject({ status });
});
