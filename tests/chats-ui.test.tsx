// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import "./helpers/virtual-layout";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { ChatCache, ChatSession } from "../src/components/chats/chat-session";
import { ChatDetail } from "../src/components/chats/chat-detail";

const { auth, push, params } = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: true, userId: "alice" as string | null, sessionId: "session-alice" as string | null },
  push: vi.fn(), params: { chatId: undefined as string | undefined },
}));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ ...auth, getToken: async () => auth.userId }),
  SignInButton: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../src/components/auth-controls", () => ({ AuthControls: () => <div>Account</div> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), useParams: () => params }));
vi.mock("next/link", () => ({ default: ({ children, prefetch, ...props }: { children: ReactNode; prefetch?: boolean; href: string }) => { void prefetch; return <a {...props}>{children}</a>; } }));
const id = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const chat = { id, title: "Project notes", createdAt: "2026-10-28T10:00:00.000Z", updatedAt: "2026-10-28T10:00:00.000Z" };
const page = (items: unknown[] = [], nextCursor: string | null = null) => ({ items, nextCursor, hasMore: nextCursor !== null });
const fetchMock = vi.fn();
const workspace = (detail = false) => <ChatCache><ChatSession>{detail ? <ChatDetail chatId={id} /> : <h1>Choose a conversation</h1>}</ChatSession></ChatCache>;
beforeEach(() => {
  auth.isLoaded = true; auth.isSignedIn = true; auth.userId = "alice"; auth.sessionId = "session-alice";
  params.chatId = undefined;
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  push.mockReset(); fetchMock.mockReset();
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost:3011");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async () => Response.json(page()));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("does not fetch or show history while signed out or loading authentication", () => {
  auth.isLoaded = false;
  const view = render(workspace());
  expect(screen.getByText("Loading your account…")).toBeVisible();
  auth.isLoaded = true; auth.isSignedIn = false; auth.userId = null; auth.sessionId = null;
  view.rerender(workspace());
  expect(screen.getByRole("button", { name: "Sign in to your chats" })).toBeVisible();
  expect(fetchMock).not.toHaveBeenCalled();
});
it("shows the empty history state and creates a named chat with a bearer token", async () => {
  let created = false;
  fetchMock.mockImplementation(async (_url, options) => {
    if (options.method === "POST") { created = true; return Response.json(chat, { status: 201 }); }
    return Response.json(page(created ? [chat] : []));
  });
  const user = userEvent.setup(); render(workspace());
  expect(await screen.findByText("No chats yet. Create one to get started.")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "New chat" }));
  await user.type(screen.getByLabelText(/Chat title/), chat.title);
  await user.click(screen.getByRole("button", { name: "Create chat" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith(`/chats/${id}`));
  expect(await screen.findByRole("link", { name: /Project notes/ })).toHaveAttribute("href", `/chats/${id}`);
  const [, options] = fetchMock.mock.calls.find(([, options]) => options.method === "POST")!;
  expect(options.headers.get("Authorization")).toBe("Bearer alice");
  expect(options.headers.get("Content-Type")).toBe("application/json");
  expect(JSON.parse(options.body)).toMatchObject({ title: chat.title, requestId: expect.any(String) });
});
it("reuses the exact creation request after an ambiguous network failure", async () => {
  let calls = 0;
  fetchMock.mockImplementation(async (_url, options) => {
    if (options.method === "POST") {
      if (++calls === 1) throw new TypeError("offline");
      return Response.json(chat);
    }
    return Response.json(page());
  });
  const user = userEvent.setup(); render(workspace());
  await user.click(screen.getByRole("button", { name: "New chat" }));
  await user.type(screen.getByLabelText(/Chat title/), chat.title);
  await user.click(screen.getByRole("button", { name: "Create chat" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to connect");
  expect(screen.getByLabelText(/Chat title/)).toHaveAttribute("readonly");
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(push).toHaveBeenCalled());
  const writes = fetchMock.mock.calls.filter(([, options]) => options.method === "POST");
  expect(writes).toHaveLength(2);
  expect(writes[0][1].body).toBe(writes[1][1].body);
});
it("loads more chat history using the backend cursor", async () => {
  fetchMock.mockImplementation(async url => Response.json(new URL(url).searchParams.has("cursor")
    ? page([{ ...chat, id: otherId, title: "Earlier chat" }]) : page([chat], "opaque-cursor")));
  const user = userEvent.setup(); render(workspace());
  await user.click(await screen.findByRole("button", { name: "Load more chats" }));
  expect(await screen.findByRole("link", { name: /Earlier chat/ })).toBeVisible();
  expect(fetchMock.mock.calls.some(([url]) => new URL(url).searchParams.get("cursor") === "opaque-cursor")).toBe(true);
  expect(screen.queryByRole("button", { name: "Load more chats" })).not.toBeInTheDocument();
});
it("loads chat details and stored messages on a fresh page, preserving plain text", async () => {
  fetchMock.mockImplementation(async url => {
    const path = new URL(url).pathname;
    if (path.endsWith("/messages")) return Response.json(page([{
      id: otherId, chatId: id, role: "user", status: "completed", content: [{ type: "text", text: "<script>hello</script>" }],
      createdAt: chat.createdAt, updatedAt: chat.updatedAt,
    }]));
    return Response.json(path.endsWith(id) ? chat : page([chat]));
  });
  params.chatId = id;
  let view = render(workspace(true));
  expect(await screen.findByRole("heading", { name: chat.title })).toBeVisible();
  expect(await screen.findByText("<script>hello</script>")).toBeVisible();
  expect(screen.getByRole("link", { name: /Project notes/ })).toHaveAttribute("aria-current", "page");
  view.unmount();
  view = render(workspace(true));
  expect(await screen.findByRole("heading", { name: chat.title })).toBeVisible();
  expect(await screen.findByText("<script>hello</script>")).toBeVisible();
  expect(view.container.querySelector("script")).toBeNull();
});
it("shows unavailable chats without displaying cached or foreign content", async () => {
  fetchMock.mockImplementation(async url => new URL(url).pathname.endsWith("/chats")
    ? Response.json(page()) : new Response("private details", { status: 404 }));
  render(workspace(true));
  expect(await screen.findByRole("heading", { name: "Chat not found" })).toBeVisible();
  expect(screen.queryByText("private details")).not.toBeInTheDocument();
});
it("clears the old account's history immediately on account switch and sign-out", async () => {
  fetchMock.mockImplementation(async (_url, options) => Response.json(page(options.headers.get("Authorization") === "Bearer alice" ? [chat] : [])));
  const view = render(workspace());
  expect(await screen.findByRole("link", { name: /Project notes/ })).toBeVisible();
  auth.userId = "bob"; auth.sessionId = "session-bob";
  view.rerender(workspace());
  expect(screen.queryByRole("link", { name: /Project notes/ })).not.toBeInTheDocument();
  expect(await screen.findByText("No chats yet. Create one to get started.")).toBeVisible();
  auth.isSignedIn = false; auth.userId = null; auth.sessionId = null;
  view.rerender(workspace());
  expect(screen.queryByRole("complementary", { name: "Chat history" })).not.toBeInTheDocument();
});
it("cancels a pending create on sign-out and does not navigate on a late response", async () => {
  let finish!: (response: Response) => void;
  let signal: AbortSignal | undefined;
  fetchMock.mockImplementation((_url, options) => options.method === "POST"
    ? new Promise(resolve => { finish = resolve; signal = options.signal; }) : Promise.resolve(Response.json(page())));
  const user = userEvent.setup(); const view = render(workspace());
  await user.click(screen.getByRole("button", { name: "New chat" }));
  await user.click(screen.getByRole("button", { name: "Create chat" }));
  await waitFor(() => expect(finish).toBeDefined());
  auth.isSignedIn = false; auth.userId = null; auth.sessionId = null;
  view.rerender(workspace());
  expect(signal?.aborted).toBe(true);
  await act(async () => { finish(Response.json(chat)); });
  expect(push).not.toHaveBeenCalled();
});
it("provides a retry for a failed history request without exposing the server body", async () => {
  fetchMock.mockResolvedValueOnce(new Response("private details", { status: 400 })).mockImplementation(async () => Response.json(page([chat])));
  const user = userEvent.setup(); render(workspace());
  expect(await screen.findByRole("alert")).not.toHaveTextContent("private details");
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("link", { name: /Project notes/ })).toBeVisible();
});

it("searches on submission, resets pagination for filters, and clears search", async () => {
  fetchMock.mockImplementation(async url => {
    const params = new URL(url).searchParams;
    return Response.json(params.get("q") === "orchid" ? page([{ ...chat, title: "Orchid plan" }]) : page([chat], params.get("view") ? null : "old-cursor"));
  });
  const user = userEvent.setup(); render(workspace());
  await screen.findByRole("link", { name: /Project notes/ });
  await user.type(screen.getByRole("searchbox", { name: "Search chats" }), "orchid");
  expect(fetchMock.mock.calls.some(([url]) => new URL(url).searchParams.has("q"))).toBe(false);
  await user.click(screen.getByRole("button", { name: "Search" }));
  expect(await screen.findByRole("link", { name: /Orchid plan/ })).toBeVisible();
  expect(screen.queryByRole("link", { name: /Project notes/ })).not.toBeInTheDocument();
  await user.selectOptions(screen.getByRole("combobox", { name: "Chat view" }), "favorites");
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => new URL(url).searchParams.get("view") === "favorites")).toBe(true));
  expect(fetchMock.mock.calls.filter(([url]) => new URL(url).searchParams.get("view") === "favorites").every(([url]) => !new URL(url).searchParams.has("cursor"))).toBe(true);
  await user.click(screen.getByRole("button", { name: "Clear search" }));
  expect(await screen.findByRole("link", { name: /Project notes/ })).toBeVisible();
});
it("sets a favorite explicitly and keeps the row visible in Favorites", async () => {
  let isFavorite = false;
  fetchMock.mockImplementation(async (_url, options) => {
    if (options.method === "PATCH") { isFavorite = JSON.parse(options.body).isFavorite; return Response.json({ ...chat, isFavorite }); }
    return Response.json(page([{ ...chat, isFavorite }]));
  });
  const user = userEvent.setup(); render(workspace());
  await user.click(await screen.findByRole("button", { name: "Add Project notes to favorites" }));
  expect(await screen.findByRole("button", { name: "Remove Project notes from favorites" })).toHaveAttribute("aria-pressed", "true");
  expect(fetchMock.mock.calls.find(([, options]) => options.method === "PATCH")?.[1].headers.get("Authorization")).toBe("Bearer alice");
});
it("requires confirmation, moves the current chat to Trash, and restores it", async () => {
  let deletedAt: string | null = null;
  params.chatId = id;
  fetchMock.mockImplementation(async (url, options) => {
    if (options.method === "DELETE") { deletedAt = chat.createdAt; return Response.json({ id, deletedAt }); }
    if (options.method === "POST" && new URL(url).pathname.endsWith("/restore")) { deletedAt = null; return Response.json({ ...chat, deletedAt }); }
    const trash = new URL(url).searchParams.get("view") === "trash";
    return Response.json(page(trash === !!deletedAt ? [{ ...chat, deletedAt }] : []));
  });
  const user = userEvent.setup(); render(workspace());
  const opener = await screen.findByRole("button", { name: "Delete Project notes" }); await user.click(opener);
  expect(fetchMock.mock.calls.some(([, options]) => options.method === "DELETE")).toBe(false);
  await user.click(screen.getByRole("button", { name: "Cancel" })); expect(opener).toHaveFocus();
  await user.click(opener); await user.click(screen.getByRole("button", { name: "Move to Trash" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/chats"));
  expect(await screen.findByText("No chats yet. Create one to get started.")).toBeVisible();
  await user.selectOptions(screen.getByRole("combobox", { name: "Chat view" }), "trash");
  await user.click(await screen.findByRole("button", { name: "Restore Project notes" }));
  expect(await screen.findByText("Trash is empty.")).toBeVisible();
  await user.selectOptions(screen.getByRole("combobox", { name: "Chat view" }), "all");
  expect(await screen.findByRole("link", { name: /Project notes/ })).toBeVisible();
});
it("keeps a busy chat and explains why it cannot be deleted", async () => {
  fetchMock.mockImplementation(async (_url, options) => options.method === "DELETE"
    ? Response.json({ code: "CHAT_BUSY", message: "This chat still has unfinished work. Stop or finish its replies and uploads before deleting it." }, { status: 409 }) : Response.json(page([chat])));
  const user = userEvent.setup(); render(workspace());
  await user.click(await screen.findByRole("button", { name: "Delete Project notes" })); await user.click(screen.getByRole("button", { name: "Move to Trash" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("unfinished work");
  expect(screen.getByRole("dialog", { name: "Delete chat?" })).toBeVisible(); expect(push).not.toHaveBeenCalled();
});
it("aborts deletion on sign-out and ignores its late success", async () => {
  let finish!: (response: Response) => void, signal: AbortSignal | undefined;
  fetchMock.mockImplementation((_url, options) => options.method === "DELETE" ? new Promise(resolve => { finish = resolve; signal = options.signal; }) : Promise.resolve(Response.json(page([chat]))));
  params.chatId = id;
  const user = userEvent.setup(), view = render(workspace());
  await user.click(await screen.findByRole("button", { name: "Delete Project notes" })); await user.click(screen.getByRole("button", { name: "Move to Trash" }));
  await waitFor(() => expect(finish).toBeDefined());
  auth.isSignedIn = false; auth.userId = null; auth.sessionId = null; view.rerender(workspace());
  expect(signal?.aborted).toBe(true);
  await act(async () => finish(Response.json({ id, deletedAt: chat.createdAt })));
  expect(push).not.toHaveBeenCalled();
});

it("restores a directly opened trashed chat without retaining cached 404 messages", async () => {
  let deleted = true;
  params.chatId = id;
  fetchMock.mockImplementation(async (url, options) => {
    const parsed = new URL(url);
    if (options.method === "POST" && parsed.pathname.endsWith("/restore")) { deleted = false; return Response.json({ ...chat, deletedAt: null }); }
    if (parsed.pathname.endsWith("/messages")) return deleted ? new Response(null, { status: 404 }) : Response.json(page());
    if (parsed.pathname.endsWith(id)) return deleted ? new Response(null, { status: 404 }) : Response.json(chat);
    if (parsed.pathname.endsWith("/turns")) return Response.json({ run: null });
    return Response.json(page(parsed.searchParams.get("view") === "trash" && deleted ? [{ ...chat, deletedAt: chat.createdAt }] : []));
  });
  const user = userEvent.setup(); render(workspace(true));
  await screen.findByRole("heading", { name: "Chat not found" });
  await user.selectOptions(screen.getByRole("combobox", { name: "Chat view" }), "trash");
  await user.click(await screen.findByRole("button", { name: "Restore Project notes" }));
  expect(await screen.findByRole("heading", { name: "Project notes" })).toBeVisible();
});

it("collapses and reopens navigation without discarding the conversation", async () => {
  fetchMock.mockImplementation(async () => Response.json(page([chat])));
  const user = userEvent.setup(); render(workspace());
  await screen.findByRole("link", { name: /Project notes/ });
  await user.click(screen.getByRole("button", { name: "Close sidebar" }));
  expect(screen.queryByRole("complementary", { name: "Chat history" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Choose a conversation" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Open sidebar" }));
  expect(screen.getByRole("link", { name: /Project notes/ })).toBeVisible();
});

it("closes the navigation drawer on Escape or navigation and restores focus", async () => {
  fetchMock.mockImplementation(async () => Response.json(page([chat])));
  const user = userEvent.setup(); render(workspace());
  const opener = screen.getByRole("button", { name: "Open navigation" });
  await user.click(opener);
  const drawer = screen.getByRole("dialog", { name: "Navigation" });
  expect(opener).toHaveAttribute("aria-expanded", "true");
  fireEvent(drawer, new Event("cancel", { bubbles: true, cancelable: true }));
  expect(screen.queryByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
  await user.click(opener);
  await user.click(await within(screen.getByRole("dialog", { name: "Navigation" })).findByRole("link", { name: /Project notes/ }));
  expect(opener).toHaveAttribute("aria-expanded", "false");
});


it("keeps loaded messages available when an older page fails and retries its cursor", async () => {
  const recent = { id: otherId, chatId: id, role: "assistant", status: "completed", content: [{ type: "text", text: "Most recent saved reply" }], createdAt: chat.createdAt, updatedAt: chat.updatedAt };
  let attempts = 0;
  fetchMock.mockImplementation(async url => {
    const parsed = new URL(url), path = parsed.pathname;
    if (path.endsWith("/turns")) return Response.json({ run: null });
    if (path.endsWith("/messages")) {
      if (!parsed.searchParams.has("cursor")) return Response.json(page([recent], "older-page"));
      if (++attempts === 1) return Response.json({ message: "Try again" }, { status: 400 });
      return Response.json(page([{ ...recent, id: "00000000-0000-4000-8000-000000000003", content: [{ type: "text", text: "Earlier saved reply" }], createdAt: "2026-10-27T10:00:00.000Z" }]));
    }
    return Response.json(path.endsWith(id) ? chat : page([chat]));
  });
  const user = userEvent.setup(); render(workspace(true));
  await screen.findByText("Most recent saved reply");
  const history = screen.getByRole("region", { name: "Conversation history" });
  await user.click(screen.getByRole("button", { name: "Load older messages" }));
  expect(await screen.findByText("More messages could not be loaded.")).toBeVisible();
  expect(screen.getByRole("region", { name: "Conversation history" })).toBe(history);
  expect(screen.getByText("Most recent saved reply")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Earlier saved reply")).toBeVisible();
  expect(screen.getAllByText("Most recent saved reply")).toHaveLength(1);
  expect(fetchMock.mock.calls.filter(([url]) => new URL(url).searchParams.get("cursor") === "older-page")).toHaveLength(2);
});
