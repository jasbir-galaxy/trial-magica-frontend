"use client";
import { memo } from "react";
import type { Message } from "@/generated/chats";
import type { TextFrame } from "@/generated/runs";
import { MessageMarkdown } from "./message-markdown";
import { AttachmentPreview } from "./attachment-preview";
import { ToolCard } from "./tool-card";
import { RichMessageBlock } from "./rich-message-block";
import styles from "./chats.module.css";
type Frame = TextFrame;
export const MessageBody = memo(function MessageBody({ message, frame }: { message: Message; frame?: Frame }) {
  const content: Message["content"] = frame?.content ?? (frame ? (frame.text ? [{ type: "text", text: frame.text }] : []) : message.content);
  const tools = new Map(message.tools?.map(tool => [tool.id, tool]));
  const attachments = new Map(message.attachments?.map(file => [file.id, file]));
  return <>
    {content.map((block, index) => block.type === "text" ? (message.role === "assistant" ? <MessageMarkdown key={index} text={block.text} /> : <p key={index} className={styles.messageText}>{block.text}</p>) :
      block.type === "attachment" ? (attachments.has(block.attachmentId) ? <AttachmentPreview key={block.attachmentId} file={attachments.get(block.attachmentId)!} /> : <p key={block.attachmentId}>Attachment unavailable. Reload to try again.</p>) :
      block.type !== "tool" ? <RichMessageBlock key={index} block={block} active={message.status === "pending" || message.status === "streaming"} /> :
      tools.has(block.invocationId) ? <ToolCard key={block.invocationId} tool={tools.get(block.invocationId)!} /> : <p key={block.invocationId} role="status" className={styles.hint}>Loading tool…</p>)}
    {message.error ? <p className={styles.error}>{message.error}</p> : message.status === "failed" ? <p className={styles.error}>This reply could not finish. Please try again.</p> :
      message.status === "cancelled" ? <p className={styles.hint}>This reply was stopped.</p> : null}
  </>;
});

