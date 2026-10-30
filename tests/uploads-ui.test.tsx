// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createUploadDraft } from "../src/uploads/draft";
import AttachmentComposer from "../src/components/chats/attachment-composer";
import { AttachmentPreview } from "../src/components/chats/attachment-preview";
import type { Attachment } from "../src/generated/uploads";
const mocks = vi.hoisted(() => ({ policy: vi.fn(), library: vi.fn(), token: async () => "test-token" }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ userId: "alice", getToken: mocks.token }) }));
vi.mock("../src/services/uploads", async original => ({ ...await original<typeof import("../src/services/uploads")>(), getUploadPolicy: mocks.policy, listAttachments: mocks.library }));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const file: Attachment = { id: id(1), uploadId: id(2), name: "Photo.png", mimeType: "image/png", size: 100, kind: "image", status: "ready", url: "https://storage.example.test/photo.png", urlExpiresAt: "2026-10-29T10:00:00.000Z", error: null, createdAt: "2026-10-29T08:00:00.000Z" };
const policy = { enabled: false, message: "File uploads are not configured yet. You can still send a message.", maxFiles: 5, maxFileBytes: 536870912, mimeTypes: ["image/png"], monthlyLimitBytes: 5368709120, remainingBytes: 5368709120 };
function mount(draft = createUploadDraft("alice", id(3))) {
  draft.getState().setHydrated();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><AttachmentComposer chatId={id(3)} draft={draft} resolved={[]} locked={false} /></QueryClientProvider>);
  return { ...view, draft };
}
beforeEach(() => {
  localStorage.clear(); mocks.policy.mockResolvedValue(policy); mocks.library.mockResolvedValue({ items: [file], hasMore: false, nextCursor: null });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("shows a useful disabled upload state while keeping the media library accessible", async () => {
  mount(); expect(await screen.findByText(policy.message)).toBeVisible();
  expect(screen.getByRole("button", { name: "Attach files" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Media library" })).toBeEnabled();
});
it("appends library media after direct selection and rejects duplicate picks", async () => {
  const draft = createUploadDraft("alice", id(3)); draft.getState().add({ id: id(4), name: "New.png", mimeType: "image/png", size: 100 });
  mount(draft); const user = userEvent.setup(); await user.click(screen.getByRole("button", { name: "Media library" }));
  const add = await screen.findByRole("button", { name: "Add Photo.png to message" }); await user.click(add);
  expect(draft.getState().selected.map(file => file.id)).toEqual([id(4), id(1)]);
  expect(screen.getByRole("button", { name: "Photo.png selected" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Close" })); expect(screen.getByRole("button", { name: "Media library" })).toHaveFocus();
});
it("restores selection in order only for the same user and chat", async () => {
  const first = createUploadDraft("alice", id(3)); first.getState().add({ id: id(4), name: "One.png", mimeType: "image/png", size: 100 }); first.getState().add({ id: id(1), name: "Two.png", mimeType: "image/png", size: 100 });
  const restored = createUploadDraft("alice", id(3)); await restored.persist.rehydrate(); expect(restored.getState().selected.map(f => f.id)).toEqual([id(4), id(1)]);
  const other = createUploadDraft("bob", id(3)); await other.persist.rehydrate(); expect(other.getState().selected).toEqual([]);
  const anotherChat = createUploadDraft("alice", id(5)); await anotherChat.persist.rehydrate(); expect(anotherChat.getState().selected).toEqual([]);
});
it("rejects malformed browser draft state instead of sending arbitrary IDs", async () => {
  localStorage.setItem(`magica-attachments:alice:${id(3)}`, JSON.stringify({ state: { selected: [{ id: "invalid" }], batch: null }, version: 0 }));
  const draft = createUploadDraft("alice", id(3)); await draft.persist.rehydrate(); expect(draft.getState().selected).toEqual([]);
});
it("renders saved media and an actionable missing-preview state", () => {
  const view = render(<AttachmentPreview file={file} />); expect(screen.getByRole("img", { name: "Photo.png" })).toHaveAttribute("src", file.url);
  expect(screen.getByRole("link", { name: "Open file" })).toHaveAttribute("rel", "noreferrer");
  view.rerender(<AttachmentPreview file={{ ...file, url: null }} />); expect(screen.getByRole("status")).toHaveTextContent("Reload");
});
it("keeps empty and failed library states distinguishable", async () => {
  mocks.library.mockResolvedValue({ items: [], hasMore: false, nextCursor: null }); mount();
  await userEvent.setup().click(screen.getByRole("button", { name: "Media library" }));
  await waitFor(() => expect(screen.getByText(/No saved files yet/)).toBeVisible());
});
