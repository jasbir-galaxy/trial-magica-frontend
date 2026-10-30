import Uppy, { type Body, type Meta } from "@uppy/core";
import Transloadit, { type AssemblyResponse } from "@uppy/transloadit";
import GoldenRetriever from "@uppy/golden-retriever";
import { z } from "zod";
import { UploadPolicySchema, UploadFileSchema, AssemblyIdSchema } from "@/generated/uploads";
import { createUpload, bindUpload } from "@/services/uploads";
import { signedBatch, type UploadDraft } from "./draft";
import { ApiError } from "@/services/api-client";
type FileMeta = Meta & { attachmentId: string };
export function createUploader(options: { userId: string; chatId: string; draft: UploadDraft; policy: Pick<z.infer<typeof UploadPolicySchema>, "maxFiles" | "maxFileBytes" | "mimeTypes">; token: () => Promise<string | null>; onError: (message: string) => void; onReceipt: () => void }) {
  const { draft, policy } = options;
  let disposed = false, binding = false;
  const report = (error: unknown) => options.onError(error instanceof ApiError ? error.message : "The upload was interrupted. Retry to reconnect, or cancel and select the files again.");
  const uppy = new Uppy<FileMeta, Body>({ id: `magica-${options.userId}-${options.chatId}`, autoProceed: false,
    restrictions: { maxNumberOfFiles: policy.maxFiles, maxFileSize: policy.maxFileBytes, minFileSize: 1, allowedFileTypes: policy.mimeTypes },
    logger: { debug() {}, warn() {}, error() {} },
    onBeforeFileAdded: file => {
      if (draft.getState().batch || draft.getState().selected.length >= policy.maxFiles) { options.onError("Finish the current upload or remove a selected file before adding more."); return false; }
      const parsed = UploadFileSchema.safeParse({ id: crypto.randomUUID(), name: file.name, mimeType: file.type, size: file.size });
      if (!parsed.success) { options.onError("Choose a supported image, video or audio file with a valid name and size."); return false; }
      return { ...file, meta: { ...file.meta, attachmentId: parsed.data.id } };
    },
  });
  const syncReceipt = async () => {
    const batch = draft.getState().batch;
    if (disposed || binding || !batch?.uploadId || !batch.assemblyId) return;
    binding = true;
    try { await bindUpload(batch.uploadId, batch.assemblyId, options.token); if (!disposed) options.onReceipt(); }
    catch (error) { if (!disposed) report(error); }
    finally { binding = false; }
  };
  const receipt = (assembly: AssemblyResponse) => {
    const id = AssemblyIdSchema.safeParse(assembly.assembly_id), batch = draft.getState().batch;
    if (!disposed && batch && id.success) { draft.getState().setBatch({ ...batch, assemblyId: id.data }); void syncReceipt(); }
  };
  uppy.use(Transloadit, { waitForEncoding: true, errorReporting: false, retryDelays: [0, 1000, 3000, 5000], limit: 2,
    assemblyOptions: async () => {
      const batch = draft.getState().batch;
      // Restored Assemblies reuse their original parameters even after the
      // creation signature expires; this does not create another Assembly.
      if (batch?.params && batch.signature) {
        if (!uppy.getPlugin("Transloadit")?.getAssembly()) throw new ApiError("The upload start could not be confirmed. Cancel this upload and select the files again.", false);
        return { params: batch.params, signature: batch.signature };
      }
      const requestId = batch?.requestId ?? crypto.randomUUID();
      draft.getState().setBatch({ requestId });
      const result = await createUpload({ chatId: options.chatId, requestId, files: uppy.getFiles().map(file => UploadFileSchema.parse({ id: file.meta.attachmentId, name: file.name, size: file.size, mimeType: file.type })) }, options.token);
      draft.getState().setBatch(signedBatch(result, requestId));
      return { params: result.params, signature: result.signature };
    },
  });
  uppy.on("file-added", file => { if (!disposed) draft.getState().add(UploadFileSchema.parse({ id: file.meta.attachmentId, name: file.name, size: file.size, mimeType: file.type })); });
  uppy.on("file-removed", file => { if (!disposed && !draft.getState().batch) draft.getState().remove(file.meta.attachmentId); });
  uppy.on("transloadit:assembly-created", receipt);
  uppy.on("transloadit:assembly-executing", receipt);
  uppy.on("transloadit:complete", receipt);
  uppy.on("restored", () => {
    if (disposed) return;
    if (uppy.getFiles().some(file => file.isGhost)) options.onError("Some files could not be restored from this browser. Cancel this upload and select them again.");
    const assembly = uppy.getPlugin("Transloadit")?.getAssembly();
    if (assembly) receipt(assembly);
    else void syncReceipt();
  });
  uppy.on("error", report);
  uppy.on("upload-error", (_file, error) => report(error));
  uppy.on("restriction-failed", () => options.onError("This file exceeds the allowed size, count or media type. Check the upload limits and try again."));
  uppy.use(GoldenRetriever, { expires: 6 * 60 * 60_000, serviceWorker: false, indexedDB: { name: `magica-files-${options.userId}-${options.chatId}` } });
  return { uppy, syncReceipt, dispose() {
    disposed = true;
    // Uppy.destroy cancels Assemblies and clears Golden Retriever by default.
    // Navigation must pause and preserve recovery state instead.
    uppy.pauseAll();
    const recovery = uppy.getPlugin("GoldenRetriever"); if (recovery) uppy.removePlugin(recovery);
    const provider = uppy.getPlugin("Transloadit"); provider?.assembly?.close(); if (provider) uppy.removePlugin(provider);
    uppy.destroy();
  } };
}
export type UploadController = ReturnType<typeof createUploader>;
