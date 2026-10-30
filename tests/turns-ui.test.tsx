// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import "./helpers/virtual-layout";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TurnWorkspace } from "../src/components/chats/turn-workspace";
import { runKeys } from "../src/services/runs";
import type { Run } from "../src/generated/runs";
const { fetcher, live } = vi.hoisted(() => ({ fetcher: vi.fn(), live: { parts: [] as unknown[] } }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ userId: "alice", getToken: async () => "alice-token" }) }));
vi.mock("@trigger.dev/react-hooks", () => ({ useRealtimeRun: () => ({ run: undefined }), useRealtimeStream: () => ({ parts: live.parts }) }));
const ids = [1, 2, 3, 4].map(n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
const date = "2026-10-28T00:00:00.000Z";
const message = (id: string, role: "user" | "assistant", text: string) => ({ id, chatId: ids[0], role, status: "completed" as const, content: text ? [{ type: "text" as const, text }] : [], createdAt: date, updatedAt: date });
const run: Run = { id: ids[1], chatId: ids[0], requestId: ids[1], status: "running", triggerRunId: "run_fixture",
  userMessage: message(ids[2], "user", "Hello"), assistantMessage: { ...message(ids[3], "assistant", "Saved partial"), status: "streaming" },
  requestedModel: "openrouter/free", actualModel: null, promptTokens: null, completionTokens: null, applicationCredits: 0, sequence: 1, error: null,
  createdAt: date, startedAt: date, finishedAt: null };
function mount(initial: Run | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  client.setQueryData(runKeys.latest("alice", ids[0]), { run: initial });
  const view = render(<QueryClientProvider client={client}><TurnWorkspace chatId={ids[0]} messages={initial ? [initial.userMessage, initial.assistantMessage] : []} /></QueryClientProvider>);
  return { ...view, client };
}
beforeEach(() => {
  live.parts = []; fetcher.mockReset(); vi.stubGlobal("fetch", fetcher); vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost:3001");
  fetcher.mockImplementation(async url => Response.json(new URL(url).pathname.endsWith("realtime") ? { runId: "run_fixture", accessToken: "fixture-token" } : { run: null }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("sends a multiline message through the authenticated API, then shows one saved pair", async () => {
  fetcher.mockImplementation(async (_url, options) => Response.json(options.method === "POST" ? { run, realtime: null } : { run: null }));
  const user = userEvent.setup(); mount();
  await user.type(screen.getByLabelText("Message"), "Hello{Shift>}{Enter}{/Shift}again");
  await user.click(screen.getByRole("button", { name: "Send message" }));
  expect(await screen.findByRole("button", { name: "Stop reply" })).toBeVisible();
  const call = fetcher.mock.calls.find(([, options]) => options.method === "POST")!;
  expect(JSON.parse(call[1].body)).toMatchObject({ text: "Hello\nagain", model: "openrouter/free", requestId: expect.any(String) });
  expect(call[1].headers.get("Authorization")).toBe("Bearer alice-token");
  expect(screen.getAllByText("Hello")).toHaveLength(1);
});
it("retries an ambiguous send with the same request ID and text", async () => {
  let writes = 0;
  fetcher.mockImplementation(async (_url, options) => {
    if (options.method === "POST" && ++writes === 1) throw new TypeError("Disconnected");
    return Response.json(options.method === "POST" ? { run: { ...run, status: "completed" }, realtime: null } : { run: null });
  });
  const user = userEvent.setup(); mount();
  await user.type(screen.getByLabelText("Message"), "Hello"); await user.click(screen.getByRole("button", { name: "Send message" }));
  expect(await screen.findByRole("button", { name: "Retry send" })).toBeEnabled();
  expect(screen.getByLabelText("Message")).toHaveAttribute("readonly");
  await user.click(screen.getByRole("button", { name: "Retry send" }));
  await waitFor(() => expect(screen.getByLabelText("Message")).toHaveValue(""));
  const calls = fetcher.mock.calls.filter(([, options]) => options.method === "POST");
  expect(calls[0][1].body).toBe(calls[1][1].body);
});
it("recovers a running turn and displays the newer realtime snapshot without duplicating saved messages", async () => {
  live.parts = [{ sequence: 2, text: "Live continuation" }];
  fetcher.mockImplementation(async url => Response.json(new URL(url).pathname.endsWith("realtime") ? { runId: "run_fixture", accessToken: "fixture-token" } : { run }));
  mount(run);
  expect(await screen.findByText("Live continuation")).toBeVisible();
  expect(screen.getAllByText("Hello")).toHaveLength(1);
  expect(screen.queryByText("Saved partial")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Stop reply" })).toBeEnabled();
});
it("ignores invalid realtime data and preserves the durable reply", async () => {
  live.parts = [{ sequence: -1, text: "Invalid" }];
  fetcher.mockImplementation(async url => Response.json(new URL(url).pathname.endsWith("realtime") ? { runId: "run_fixture", accessToken: "fixture-token" } : { run }));
  mount(run);
  expect(await screen.findByText("Saved partial")).toBeVisible();
  expect(screen.queryByText("Invalid")).not.toBeInTheDocument();
});
it("stops the owned run and keeps partial output visible with a retry path", async () => {
  fetcher.mockImplementation(async url => {
    const path = new URL(url).pathname;
    return Response.json(path.endsWith("stop") ? { ...run, status: "cancelled", assistantMessage: { ...run.assistantMessage, status: "cancelled" } } : path.endsWith("realtime") ? null : { run });
  });
  const user = userEvent.setup(); mount(run);
  await user.click(screen.getByRole("button", { name: "Stop reply" }));
  expect(await screen.findByText("This reply was stopped.")).toBeVisible();
  expect(screen.getByText("Saved partial")).toBeVisible();
  expect(screen.getByRole("button", { name: "Retry reply" })).toBeEnabled();
});
it("aborts an in-flight send when navigating away", async () => {
  let signal: AbortSignal | undefined;
  fetcher.mockImplementation((_url, options) => options.method === "POST" ? new Promise(() => { signal = options.signal; }) : Promise.resolve(Response.json({ run: null })));
  const user = userEvent.setup(); const view = mount();
  await user.type(screen.getByLabelText("Message"), "Hello"); await user.click(screen.getByRole("button", { name: "Send message" }));
  await waitFor(() => expect(signal).toBeDefined()); view.unmount(); expect(signal?.aborted).toBe(true);
});

vi.mock("../src/components/chats/credit-balance", () => ({ CreditBalance: () => null }));

it("submits plan mode from an existing chat", async () => {
  fetcher.mockImplementation(async (_url, options) => Response.json(options.method === "POST" ? { run: { ...run, planMode: true }, realtime: null } : { run: null }));
  const user = userEvent.setup(); mount();
  await user.click(screen.getByRole("button", { name: "Plan mode" }));
  await user.type(screen.getByLabelText("Message"), "Prepare a plan");
  await user.click(screen.getByRole("button", { name: "Send message" }));
  await screen.findByRole("button", { name: "Stop reply" });
  const write = fetcher.mock.calls.find(([,options]) => options.method === "POST")!;
  expect(JSON.parse(write[1].body)).toMatchObject({ text: "Prepare a plan", planMode: true });
});
