// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChatWelcome } from "../src/components/chats/chat-welcome";
const { fetcher, push, account } = vi.hoisted(() => ({ fetcher: vi.fn(), push: vi.fn(), account: { userId: "alice", sessionId: "session-alice" } }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ ...account, getToken: async () => `${account.userId}-token` }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const ids = [1,2,3,4].map(n => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`), date = "2026-10-30T00:00:00.000Z";
const chat = { id: ids[0], title: "Hello", createdAt: date, updatedAt: date };
const message = (id: string, role: "user" | "assistant") => ({ id, chatId: ids[0], role, status: "pending", content: [], createdAt: date, updatedAt: date });
const result = { run: { id: ids[1], chatId: ids[0], requestId: ids[1], status: "queued", triggerRunId: null, requestedModel: "openrouter/free", actualModel: null, promptTokens: null, completionTokens: null, applicationCredits: 0, sequence: 0, error: null, createdAt: date, startedAt: null, finishedAt: null, userMessage: message(ids[2], "user"), assistantMessage: message(ids[3], "assistant") }, realtime: null };
function mount() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><ChatWelcome /></QueryClientProvider>); }
beforeEach(() => { sessionStorage.clear(); account.userId = "alice"; account.sessionId = "session-alice"; fetcher.mockReset(); push.mockReset(); vi.stubGlobal("fetch", fetcher); vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost:3001"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function response(url: URL, method: string) {
  if (method === "GET") return Response.json({ balance: 10000, reserved: 0, available: 10000, admissionAmount: 1000 });
  return Response.json(url.pathname.endsWith("/turns") ? result : chat);
}
it("creates a chat and sends the first multiline message using the authenticated services", async () => {
  fetcher.mockImplementation(async (url, options) => response(new URL(url), options.method));
  const user = userEvent.setup(); mount();
  await waitFor(() => expect(screen.getByLabelText("Message")).not.toHaveAttribute("readonly"));
  await user.click(screen.getByRole("button", { name: "Plan mode" }));
  expect(screen.getByRole("button", { name: "Plan mode" })).toHaveAttribute("aria-pressed", "true");
  await user.type(screen.getByLabelText("Message"), "Hello{Shift>}{Enter}{/Shift}there");
  await user.click(screen.getByRole("button", { name: "Send message" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith(`/chats/${chat.id}`));
  const writes = fetcher.mock.calls.filter(([,options]) => options.method === "POST");
  expect(writes).toHaveLength(2);
  expect(JSON.parse(writes[0][1].body)).toMatchObject({ title: "Hello there", requestId: expect.any(String) });
  expect(JSON.parse(writes[1][1].body)).toMatchObject({ text: "Hello\nthere", model: "openrouter/free", planMode: true, requestId: expect.any(String) });
  expect(writes.every(([,options]) => options.headers.get("Authorization") === "Bearer alice-token")).toBe(true);
  expect(JSON.parse(sessionStorage.getItem("magica-new-conversation:alice:session-alice")!).state.pending).toBeNull();
});
it("reuses both request IDs after lost create/send responses and a page remount", async () => {
  let creates = 0, sends = 0;
  fetcher.mockImplementation(async (url, options) => {
    const parsed = new URL(url);
    if (options.method === "POST") {
      if (parsed.pathname.endsWith("/turns")) { if (++sends === 1) throw new TypeError("lost send response"); }
      else if (++creates === 1) throw new TypeError("lost create response");
    }
    return response(parsed, options.method);
  });
  const user = userEvent.setup(); const view = mount();
  await waitFor(() => expect(screen.getByLabelText("Message")).not.toHaveAttribute("readonly"));
  await user.type(screen.getByLabelText("Message"), "Hello"); await user.click(screen.getByRole("button", { name: "Send message" }));
  await screen.findByRole("alert"); expect(screen.getByLabelText("Message")).toHaveAttribute("readonly");
  await user.click(screen.getByRole("button", { name: "Retry send" }));
  await screen.findByRole("link", { name: "Open saved conversation" });
  view.unmount(); mount();
  await screen.findByText(/A previous send needs confirmation/);
  await user.click(screen.getByRole("button", { name: "Retry send" }));
  await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
  const writes = fetcher.mock.calls.filter(([,options]) => options.method === "POST");
  const createBodies = writes.filter(([url]) => !new URL(url).pathname.endsWith("/turns")).map(([,o]) => o.body);
  const turnBodies = writes.filter(([url]) => new URL(url).pathname.endsWith("/turns")).map(([,o]) => o.body);
  expect(new Set(createBodies).size).toBe(1); expect(turnBodies).toHaveLength(2); expect(new Set(turnBodies).size).toBe(1);
});
it("does not send or navigate from a late response after account teardown", async () => {
  let resolveCreate: (response: Response) => void = () => {};
  fetcher.mockImplementation((url, options) => options.method === "POST" ? new Promise<Response>(resolve => { resolveCreate = resolve; }) : Promise.resolve(response(new URL(url), options.method)));
  const user = userEvent.setup(); const view = mount();
  await waitFor(() => expect(screen.getByLabelText("Message")).not.toHaveAttribute("readonly"));
  await user.type(screen.getByLabelText("Message"), "Private draft"); await user.click(screen.getByRole("button", { name: "Send message" }));
  await waitFor(() => expect(fetcher.mock.calls.some(([,o]) => o.method === "POST")).toBe(true));
  view.unmount(); account.userId = "bob"; account.sessionId = "session-bob"; mount();
  await act(async () => resolveCreate(Response.json(chat)));
  expect(screen.getByLabelText("Message")).toHaveValue(""); expect(push).not.toHaveBeenCalled();
  expect(fetcher.mock.calls.filter(([,o]) => o.method === "POST")).toHaveLength(1);
});
