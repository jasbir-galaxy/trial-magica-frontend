"use client";

import { Paperclip, FolderOpen } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "zustand";
import { getUploadPolicy, getUpload, cancelUpload, listAttachments, uploadKeys } from "@/services/uploads";
import { ApiError } from "@/services/api-client";
import { type Attachment } from "@/generated/uploads";
import type { UploadDraft } from "@/uploads/draft";
import type { UploadController } from "@/uploads/uppy-controller";
import styles from "./chats.module.css";
import { AttachmentPreview } from "./attachment-preview";
type LocalFile = { id: string; attachmentId: string; percentage: number; paused: boolean; ghost: boolean; preview?: string };
const activeUpload = (status: string) => ["created", "uploading", "processing"].includes(status);
export default function AttachmentComposer({ chatId, draft, resolved, locked }: { chatId: string; draft: UploadDraft; resolved: Attachment[]; locked: boolean }) {
  const { userId, getToken } = useAuth(), client = useQueryClient();
  const selected = useStore(draft, state => state.selected), batch = useStore(draft, state => state.batch), hydrated = useStore(draft, state => state.hydrated);
  const [controller, setController] = useState<UploadController | null>(null);
  const [files, setFiles] = useState<LocalFile[]>([]), [error, setError] = useState<string | null>(null), [libraryOpen, setLibraryOpen] = useState(false);
  const picker = useRef<HTMLInputElement>(null), library = useRef<HTMLDialogElement>(null), opener = useRef<HTMLButtonElement>(null);
  const policy = useQuery({ queryKey: uploadKeys.config(userId!), queryFn: ({ signal }) => getUploadPolicy(() => getToken(), signal), retry: 2, staleTime: 60_000 });
  const upload = useQuery({ queryKey: uploadKeys.detail(userId!, batch?.uploadId ?? "none"), queryFn: ({ signal }) => getUpload(batch!.uploadId!, () => getToken(), signal), enabled: !!batch?.uploadId,
    refetchInterval: query => query.state.fetchFailureCount >= 3 ? false : query.state.data && !activeUpload(query.state.data.status) ? false : 2000, retry: 2 });
  const media = useInfiniteQuery({ queryKey: uploadKeys.library(userId!), queryFn: ({ pageParam, signal }) => listAttachments(() => getToken(), pageParam, signal), initialPageParam: undefined as string | undefined,
    getNextPageParam: page => page.nextCursor ?? undefined, enabled: libraryOpen, retry: 2 });
  const onReceipt = useCallback(() => { void client.invalidateQueries({ queryKey: ["uploads", userId] }); void client.invalidateQueries({ queryKey: ["attachments", userId] }); }, [client, userId]);
  const { enabled, maxFiles, maxFileBytes, mimeTypes } = policy.data ?? {};
  useEffect(() => {
    if (!hydrated || !enabled || !maxFiles || !maxFileBytes || !mimeTypes) return;
    let alive = true, instance: UploadController | undefined, timer: ReturnType<typeof setTimeout> | undefined;
    const previews = new Map<string, string>();
    void import("@/uploads/uppy-controller").then(({ createUploader }) => {
      if (!alive) return;
      instance = createUploader({ userId: userId!, chatId, draft, policy: { maxFiles, maxFileBytes, mimeTypes }, token: () => getToken(), onError: message => { if (alive) setError(message); }, onReceipt });
      const update = () => {
        if (!alive || timer) return;
        timer = setTimeout(() => {
          timer = undefined; if (!alive || !instance) return;
          const current = instance.uppy.getFiles();
          for (const [id, url] of previews) if (!current.some(file => file.id === id)) { URL.revokeObjectURL(url); previews.delete(id); }
          setFiles(current.map(file => {
            if (file.type?.startsWith("image/") && file.data instanceof Blob && !previews.has(file.id)) previews.set(file.id, URL.createObjectURL(file.data));
            return { id: file.id, attachmentId: file.meta.attachmentId, percentage: file.progress.percentage ?? 0, paused: !!file.isPaused, ghost: !!file.isGhost, preview: previews.get(file.id) };
          }));
        }, 100);
      };
      instance.uppy.on("state-update", update); update(); setController(instance);
    }).catch(() => { if (alive) setError("The file picker could not load. Reload this page to try again."); });
    return () => { alive = false; if (timer) clearTimeout(timer); instance?.dispose(); for (const url of previews.values()) URL.revokeObjectURL(url); };
  }, [hydrated, enabled, maxFiles, maxFileBytes, mimeTypes, userId, chatId, draft, getToken, onReceipt]);
  useEffect(() => {
    if (!controller || !batch?.assemblyId) return;
    let attempts = 0;
    const reconnect = () => { void controller.syncReceipt(); };
    const timer = setInterval(() => { if (++attempts <= 6) reconnect(); else clearInterval(timer); }, 10_000);
    window.addEventListener("online", reconnect);
    return () => { clearInterval(timer); window.removeEventListener("online", reconnect); };
  }, [controller, batch?.assemblyId]);
  useEffect(() => {
    if (upload.data?.status !== "completed" || !controller) return;
    // Keep selected IDs; only the finished transfer's local blobs are released.
    controller.uppy.cancelAll(); draft.getState().setBatch(null);
    void client.invalidateQueries({ queryKey: ["attachments", userId] }); void client.invalidateQueries({ queryKey: uploadKeys.library(userId!) });
  }, [upload.data?.status, controller, draft, client, userId]);
  const cancel = useMutation({ onMutate: () => { controller?.uppy.pauseAll(); }, mutationFn: async () => { if (batch?.uploadId) return cancelUpload(batch.uploadId, () => getToken()); }, retry: false,
    onSuccess: result => {
      const keep = new Set(result?.attachments.filter(file => file.status === "ready").map(file => file.id) ?? []);
      const localIds = controller?.uppy.getFiles().map(file => file.meta.attachmentId) ?? [];
      const batchIds = result?.attachments.map(file => file.id) ?? localIds;
      controller?.uppy.cancelAll();
      for (const id of batchIds) if (!keep.has(id)) draft.getState().remove(id);
      draft.getState().setBatch(null); setError(null); onReceipt();
    } });
  function remove(id: string) {
    const local = controller?.uppy.getFiles().find(file => file.meta.attachmentId === id);
    if (local && !batch) controller?.uppy.removeFile(local.id);
    draft.getState().remove(id);
  }
  function start() {
    if (!controller || locked) return;
    setError(null);
    if (controller.uppy.getFiles().some(file => file.isGhost)) { setError("Some files are missing from browser storage. Cancel and select them again."); return; }
    if (controller.uppy.getState().recoveredState) controller.uppy.emit("restore-confirmed");
    else if (controller.uppy.getFiles().some(file => file.error)) void controller.uppy.retryAll().catch(() => setError("The upload could not resume. Cancel and select the files again."));
    else { controller.uppy.resumeAll(); void controller.uppy.upload().catch(() => setError("The upload could not start. Reconnect, or cancel and select the files again.")); }
  }
  function closeLibrary() { library.current?.close(); setLibraryOpen(false); opener.current?.focus(); }
  const saved = new Map(resolved.map(file => [file.id, file]));
  return <section className={styles.attachments} aria-label="Attachments">
    <div className={styles.formActions}>
      <input ref={picker} type="file" multiple hidden accept={policy.data?.mimeTypes.join(",")} onChange={event => {
        for (const file of Array.from(event.target.files ?? [])) { try { controller?.uppy.addFile({ name: file.name, type: file.type, data: file, source: "file-picker", meta: { attachmentId: "" } }); } catch { setError("This file could not be added. Check the file size, type and attachment limit."); } }
        event.target.value = "";
      }} />
      <button className={styles.attachmentButton} type="button" aria-label="Attach files" title="Attach files" disabled={locked || !controller || !policy.data?.enabled || !!batch || selected.length >= (policy.data?.maxFiles ?? 0)} onClick={() => picker.current?.click()}><Paperclip size={17} aria-hidden="true" /></button>
      <button ref={opener} className={styles.attachmentButton} aria-label="Media library" title="Media library" type="button" disabled={locked} onClick={() => { setLibraryOpen(true); library.current?.showModal(); }}><FolderOpen size={17} aria-hidden="true" /><span>Media library</span></button>
      {files.length || batch ? <>
        <button className={styles.secondary} type="button" disabled={locked || cancel.isPending || files.some(file => file.ghost) || upload.data?.status === "processing"} onClick={start}>{batch ? "Resume / retry upload" : "Upload files"}</button>
        {batch ? <button className={styles.secondary} type="button" disabled={locked} onClick={() => controller?.uppy.pauseAll()}>Pause uploads</button> : null}
        <button className={styles.secondary} type="button" disabled={locked || cancel.isPending} onClick={() => cancel.mutate()}>Cancel uploads</button>
      </> : null}
    </div>
    {policy.data && !policy.data.enabled ? <p className={styles.hint} role="status">{policy.data.message}</p> : policy.data ? <p className={styles.srOnly}>Up to {policy.data.maxFiles} files · {Math.round(policy.data.maxFileBytes / 1024 / 1024)} MB each · Images, video and audio</p> : null}
    {policy.isError ? <p className={styles.error}>Upload settings unavailable. <button type="button" onClick={() => void policy.refetch()}>Retry</button></p> : null}
    {selected.length ? <ol className={styles.attachmentList} aria-label="Selected files">
      {selected.map((file, index) => {
        const stored = saved.get(file.id), local = files.find(item => item.attachmentId === file.id);
        return <li key={file.id} className={styles.attachmentItem}>
          {local?.preview || stored?.kind === "image" && stored.url ?
            // eslint-disable-next-line @next/next/no-img-element
            <img src={local?.preview ?? stored!.url!} alt="" referrerPolicy="no-referrer" /> : null}
          <div><span>{index + 1}. {file.name}</span><span className={styles.hint}>{stored?.status === "ready" ? "Ready" : stored?.error ?? (local?.ghost ? "Select this file again" : local?.paused ? "Paused" : upload.data?.status === "processing" || (local?.percentage === 100 && batch) ? "Saving file…" : batch ? `Uploading ${local?.percentage ?? 0}%` : "Ready to upload")}</span>
            {batch && stored?.status !== "ready" ? <progress max={100} value={local?.percentage ?? 0} aria-label={`Upload progress for ${file.name}`} /> : null}
            {stored?.status === "ready" && stored.kind !== "image" ? <AttachmentPreview file={stored} /> : null}</div>
          <button type="button" className={styles.secondary} aria-label={`Remove ${file.name}`} disabled={locked || (!!batch && !!local && stored?.status !== "ready")} onClick={() => remove(file.id)}>Remove</button>
        </li>;
      })}
    </ol> : null}
    {error || cancel.error || upload.data?.error ? <p className={styles.error} role="alert">{error ?? (cancel.error instanceof ApiError ? cancel.error.message : upload.data?.error ?? "The upload could not be cancelled. Try again.")}</p> : null}
    {upload.isError || batch?.assemblyId ? <button type="button" className={styles.secondary} onClick={() => { void controller?.syncReceipt(); void upload.refetch(); }}>Check upload status</button> : null}
    <dialog ref={library} className={styles.artifactDialog} aria-labelledby={`library-title-${chatId}`} onCancel={closeLibrary}>
      <div className={styles.artifactHeading}><h2 id={`library-title-${chatId}`}>Media library</h2><button className={styles.secondary} type="button" onClick={closeLibrary}>Close</button></div>
      {media.isPending ? <p role="status">Loading your files…</p> : null}
      {media.isError ? <p role="alert">Your files could not load. <button type="button" onClick={() => void media.refetch()}>Retry</button></p> : null}
      {media.data?.pages.every(page => !page.items.length) ? <p>No saved files yet. Upload files from the composer to add them here.</p> : null}
      <ul className={styles.libraryGrid}>{media.data?.pages.flatMap(page => page.items).map(file => <li key={file.id}>
        <button type="button" className={styles.libraryFile} aria-label={selected.some(item => item.id === file.id) ? `${file.name} selected` : `Add ${file.name} to message`} disabled={selected.some(item => item.id === file.id) || selected.length >= (policy.data?.maxFiles ?? 5)} onClick={() => { draft.getState().add({ id: file.id, name: file.name, mimeType: file.mimeType, size: file.size }); void client.invalidateQueries({ queryKey: ["attachments", userId] }); }}>
          {file.kind === "image" && file.url ?
            // eslint-disable-next-line @next/next/no-img-element
            <img src={file.url} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span>{file.kind}</span>}
          <span>{file.name}</span><span>{selected.some(item => item.id === file.id) ? "Selected" : "Add to message"}</span>
        </button>
      </li>)}</ul>
      {media.hasNextPage ? <button className={styles.secondary} type="button" disabled={media.isFetchingNextPage} onClick={() => void media.fetchNextPage()}>Load more files</button> : null}
    </dialog>
  </section>;
}
