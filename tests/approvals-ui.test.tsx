// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToolApproval } from "../src/components/chats/tool-approval";
import { CreditBalance } from "../src/components/chats/credit-balance";
import type { ToolInvocation } from "../src/generated/tools";
const { fetcher } = vi.hoisted(() => ({ fetcher: vi.fn() }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ userId: "alice", getToken: async () => "alice-token" }) }));
const id = "00000000-0000-4000-8000-000000000001";
const tool: ToolInvocation = { id, runId: id, callId: "image", name: "gpt_image_2", label: "GPT Image 2", position: 0, status: "awaiting_approval", input: { prompt: "A circle", quality: "High", n: 1 }, providerRunId: null, output: null, credits: 0, error: null, durationMs: null, createdAt: "2026-10-28T00:00:00.000Z", startedAt: null, finishedAt: null, approval: { id, status: "pending", inputHash: "a".repeat(64), estimate: 650, expiresAt: new Date(Date.now() + 600000).toISOString() } };
function mount(children: React.ReactNode) { const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>); }
beforeEach(() => { fetcher.mockReset(); vi.stubGlobal("fetch", fetcher); vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost:3001"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("shows actual media settings and sends a signed-in decision tied to their fingerprint", async () => {
  fetcher.mockResolvedValue(Response.json({ ...tool.approval, status: "approved" }));
  mount(<ToolApproval tool={tool} />);
  expect(screen.getByText("High")).toBeVisible(); expect(screen.getByText(/0.00065M credits/)).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Approve and run" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ inputHash: tool.approval!.inputHash, decision: "approved", requestId: expect.any(String) });
  expect(fetcher.mock.calls[0][1].headers.get("Authorization")).toBe("Bearer alice-token");
});
it("reuses the decision ID after a disconnected request and never auto-submits", async () => {
  fetcher.mockRejectedValueOnce(new TypeError("Offline")).mockResolvedValue(Response.json({ ...tool.approval, status: "rejected" }));
  mount(<ToolApproval tool={tool} />);
  await userEvent.click(screen.getByRole("button", { name: "Decline" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Your saved decision is being checked");
  expect(fetcher).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole("button", { name: "Decline" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
});
it("closes expired approval controls and renders available/reserved credits and ledger readback", async () => {
  const approval = { ...tool.approval!, expiresAt: "2020-01-01T00:00:00.000Z" };
  fetcher.mockImplementation(async url => Response.json(new URL(url).pathname.endsWith("ledger") ? { items: [{ id, kind: "settle", balanceDelta: -650, reservedDelta: -1000, createdAt: "2026-10-28T00:00:00.000Z" }], hasMore: false, nextCursor: null } : { balance: 10000, reserved: 1000, available: 9000, admissionAmount: 1000 }));
  mount(<><ToolApproval tool={{ ...tool, approval }} /><CreditBalance active={false} /></>);
  expect(screen.queryByRole("button", { name: "Approve and run" })).not.toBeInTheDocument();
  expect(await screen.findByText("0.009M credits")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Credit history" }));
  expect(await screen.findByText("Usage settled")).toBeVisible();
  expect(screen.getByText(/-0.00065M credits/)).toBeVisible();
});

it("shows ordered plan steps and submits the immutable plan decision without a media estimate", async () => {
  const approval = { ...tool.approval!, kind: "plan" as const, estimate: 0 };
  fetcher.mockResolvedValue(Response.json({ ...approval, status: "approved" }));
  mount(<ToolApproval tool={{ ...tool, name: "propose_plan", label: "Plan", input: { title: "Prepare a draft", steps: ["Write a short outline", "Present the final draft"] }, approval }} />);
  expect(screen.getByRole("heading", { name: "Review plan" })).toBeVisible();
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(screen.queryByText(/Estimated usage/)).not.toBeInTheDocument();
  expect(fetcher).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Approve plan" }));
  expect(await screen.findByText("Approval recorded. Resuming your task…")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Approve plan" })).not.toBeInTheDocument();
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ decision: "approved", inputHash: approval.inputHash });
});
it("keeps an ambiguous plan decision immutable while allowing its exact retry", async () => {
  fetcher.mockRejectedValue(new TypeError("offline"));
  mount(<ToolApproval tool={{ ...tool, name: "propose_plan", label: "Plan", input: { title: "Draft", steps: ["Write"] }, approval: { ...tool.approval!, kind: "plan", estimate: 0 } }} />);
  await userEvent.click(screen.getByRole("button", { name: "Decline plan" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "Approve plan" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Decline plan" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
});
