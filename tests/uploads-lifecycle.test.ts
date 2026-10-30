// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createUploadDraft } from "../src/uploads/draft";
import { createUploader } from "../src/uploads/uppy-controller";
import type { Body, Meta, PluginOpts, Uppy } from "@uppy/core";
// IndexedDB persistence is covered by provider acceptance; this test exercises
// the real Uppy and Transloadit lifecycle without a browser database fixture.
vi.mock("@uppy/golden-retriever", async () => {
  const { BasePlugin } = await import("@uppy/core");
  return { default: class extends BasePlugin<PluginOpts, Meta, Body> {
    constructor(uppy: Uppy<Meta, Body>, opts: PluginOpts) { super(uppy, opts); this.id = "GoldenRetriever"; this.type = "orchestrator"; }
    install() {} uninstall() {}
  } };
});
afterEach(() => localStorage.clear());
it("pauses navigation and removes cancellation/persistence handlers before Uppy destruction", () => {
  const draft = createUploadDraft("alice", crypto.randomUUID());
  const controller = createUploader({ userId: "alice", chatId: crypto.randomUUID(), draft, policy: { maxFiles: 5, maxFileBytes: 1000, mimeTypes: ["image/png"] }, token: async () => "token", onError: vi.fn(), onReceipt: vi.fn() });
  controller.uppy.addFile({ name: "image.png", type: "image/png", data: new Blob(["image"], { type: "image/png" }), meta: { attachmentId: "" } });
  expect(draft.getState().selected).toHaveLength(1);
  const pause = vi.spyOn(controller.uppy, "pauseAll"), remove = vi.spyOn(controller.uppy, "removePlugin"), cancel = vi.spyOn(controller.uppy, "cancelAll");
  controller.dispose();
  expect(pause.mock.invocationCallOrder[0]).toBeLessThan(remove.mock.invocationCallOrder[0]);
  const removedBeforeCancel = remove.mock.calls.filter((_, i) => remove.mock.invocationCallOrder[i] < cancel.mock.invocationCallOrder[0]).map(([plugin]) => plugin.id);
  expect(removedBeforeCancel).toContain("GoldenRetriever"); expect(removedBeforeCancel).toContain("Transloadit");
  expect(draft.getState().selected).toHaveLength(1);
});
