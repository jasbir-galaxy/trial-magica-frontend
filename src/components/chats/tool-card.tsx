"use client";

import { ToolApproval } from "./tool-approval";
import { useRef, useState } from "react";
import Image from "next/image";
import { formatCredits, type ToolInvocation } from "@/generated/tools";
import styles from "./chats.module.css";

const labels: Record<ToolInvocation["status"], string> = {
  awaiting_approval: "Awaiting approval", pending: "Pending", submitting: "Starting", running: "Working", completed: "Completed", failed: "Failed", cancelled: "Cancelled", unknown: "Needs attention",
};
type Asset = NonNullable<ToolInvocation["output"]>["assets"][number];
function MediaPreview({ asset, label }: { asset: Asset; label: string }) {
  return asset.kind === "image" ? <Image unoptimized src={asset.url} alt={label} width={asset.width ?? 768} height={asset.height ?? 768} className={styles.assetImage} /> :
    <video src={asset.url} aria-label={label} controls preload="metadata" className={styles.assetImage} />;
}
export function ToolCard({ tool }: { tool: ToolInvocation }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<Asset | null>(null);
  const active = ["pending", "awaiting_approval", "submitting", "running"].includes(tool.status);
  return <section className={styles.toolCard} data-status={tool.status} aria-label={`${tool.label}: ${labels[tool.status]}`}>
    <details>
      <summary className={styles.toolHeading}><strong>{tool.label}</strong><span role={active ? "status" : undefined}>{labels[tool.status]}</span></summary>
      <dl className={styles.toolFacts}>
        <div><dt>Usage</dt><dd>{formatCredits(tool.credits)}</dd></div>
        {tool.durationMs !== null ? <div><dt>Duration</dt><dd>{(tool.durationMs / 1000).toFixed(1)}s</dd></div> : null}
      </dl>
      <h4>Inputs</h4><pre>{JSON.stringify(tool.input, null, 2)}</pre>
      {tool.output ? <><h4>Result</h4><pre>{"text" in tool.output ? tool.output.text : JSON.stringify(tool.output.assets, null, 2)}</pre></> : null}
    </details>
    {tool.status === "awaiting_approval" && tool.approval ? <ToolApproval key={tool.approval.id} tool={tool} /> : null}
    {tool.error ? <p className={styles.error} role="status">{tool.error}</p> : null}
    {tool.output?.assets.map((asset, index) => <div className={styles.asset} key={`${asset.url}-${index}`}>
      <MediaPreview asset={asset} label={`${tool.label} result ${index + 1}`} />
      <div className={styles.assetActions}><button className={styles.secondary} type="button" onClick={() => { setSelected(asset); dialog.current?.showModal(); }}>View {asset.kind}</button>
        <a className={styles.secondary} href={asset.url} target="_blank" rel="noopener noreferrer">Open original</a></div>
    </div>)}
    <dialog ref={dialog} onClose={() => setSelected(null)} className={`${styles.artifactDialog} ${styles.artifactPanel}`} aria-label={`${tool.label} preview`}>
      <div className={styles.artifactHeading}><h2>{tool.label}</h2><button type="button" className={styles.secondary} onClick={() => dialog.current?.close()}>Close preview</button></div>
      {selected ? <MediaPreview asset={selected} label={`${tool.label} full preview`} /> : null}
    </dialog>
  </section>;
}
