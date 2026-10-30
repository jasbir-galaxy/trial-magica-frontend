import type { Attachment } from "@/generated/uploads";
import styles from "./chats.module.css";
export function AttachmentPreview({ file }: { file: Attachment }) {
  return <figure className={styles.attachmentPreview}>
    {file.url ? file.kind === "image" ?
      // Signed private media URLs are intentionally not cached by an image proxy.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={file.url} alt={file.name} loading="lazy" referrerPolicy="no-referrer" /> :
      file.kind === "video" ? <video src={file.url} controls preload="metadata" aria-label={file.name} /> :
      <audio src={file.url} controls preload="metadata" aria-label={file.name} /> : <p role="status">{file.error ?? "Preview unavailable. Reload to refresh this file."}</p>}
    <figcaption>{file.name}{file.url ? <> · <a href={file.url} target="_blank" rel="noreferrer">Open file</a></> : null}</figcaption>
  </figure>;
}
