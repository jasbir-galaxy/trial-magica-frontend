"use client";
import { useEffect, useState } from "react";
import type { ContentBlock } from "@/generated/content";
import { formatCredits } from "@/generated/tools";
import { MessageMarkdown } from "./message-markdown";
import styles from "./chats.module.css";

type RichBlock = Exclude<ContentBlock, { type: "text" | "tool" | "attachment" }>;
function ThinkingActivity({ block, active }: { block: Extract<RichBlock, { type: "thinking" }>; active: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  const running = active && block.durationMs === null;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setElapsed(Math.max(0, Date.now() - Date.parse(block.startedAt))), 1000);
    return () => clearInterval(timer);
  }, [running, block.startedAt]);
  const seconds = ((block.durationMs ?? elapsed) / 1000).toFixed(1);
  return <p className={styles.hint}>{running ? `Thinking · ${seconds}s` : block.durationMs === null ? "Thinking stopped" : `Thought for ${seconds}s`}</p>;
}
export function RichMessageBlock({ block, active }: { block: RichBlock; active: boolean }) {
  switch (block.type) {
    case "thinking": return <ThinkingActivity block={block} active={active} />;
    case "reasoning": return <details className={styles.reasoning}><summary>{block.format === "summary" ? "Reasoning summary" : "Reasoning"}</summary><MessageMarkdown text={block.text} /></details>;
    case "citation": return <aside className={styles.citation} aria-label="Source"><a href={block.url} target="_blank" rel="noopener noreferrer">{block.title}</a></aside>;
    case "usage": return <details className={styles.usageDetails}><summary>Usage · {formatCredits(block.applicationCredits)}</summary><dl>
      <div><dt>Model</dt><dd>{block.actualModel}</dd></div>
      <div><dt>Input tokens</dt><dd>{block.promptTokens ?? "Not reported"}</dd></div>
      <div><dt>Output tokens</dt><dd>{block.completionTokens ?? "Not reported"}</dd></div>
    </dl></details>;
  }
}
