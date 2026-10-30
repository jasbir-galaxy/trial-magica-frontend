"use client";

import { memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./chats.module.css";

// Message text is untrusted. Keep raw HTML inert and only allow explicit web links.
// Images belong to the validated attachment/tool asset contracts, not Markdown.
function safeLink(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}
const plugins = [remarkGfm];
export const MessageMarkdown = memo(function MessageMarkdown({ text }: { text: string }) {
  return <div className={styles.markdown}><Markdown remarkPlugins={plugins} urlTransform={safeLink} components={{
    a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>,
    img: ({ alt }) => <span>{alt ? `[Image: ${alt}]` : "[Image]"}</span>,
    table: ({ children }) => <div className={styles.markdownTable} tabIndex={0} role="region" aria-label="Table"><table>{children}</table></div>,
    h1: ({ children }) => <h3>{children}</h3>,
    h2: ({ children }) => <h3>{children}</h3>,
  }}>{text}</Markdown></div>;
});
