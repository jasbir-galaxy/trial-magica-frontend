"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { APPROVAL_COPY_BY_KIND, type ApprovalDecision } from "@/generated/credits";
import { formatCredits, type ToolInvocation } from "@/generated/tools";
import { decideApproval } from "@/services/approvals";
import styles from "./chats.module.css";
const label = (key: string) => key.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/^./, c => c.toUpperCase());
export function ToolApproval({ tool }: { tool: ToolInvocation }) {
  const approval = tool.approval!;
  const copy = APPROVAL_COPY_BY_KIND[approval.kind ?? "media"];
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort(); }, []);
  const [chosen, setChosen] = useState<ApprovalDecision["decision"] | null>(null);
  const [resolved, setResolved] = useState<typeof approval.status | null>(null);
  const { getToken, userId } = useAuth();
  const client = useQueryClient();
  const [requestId] = useState(() => crypto.randomUUID());
  const [expired, setExpired] = useState(() => Date.parse(approval.expiresAt) <= Date.now());
  useEffect(() => {
    const timer = setTimeout(() => setExpired(true), Math.max(0, Date.parse(approval.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [approval.expiresAt]);
  const refresh = () => {
    if (lifetime.current?.signal.aborted) return;
    void client.invalidateQueries({ queryKey: ["run", userId] });
    void client.invalidateQueries({ queryKey: ["messages", userId] });
    void client.invalidateQueries({ queryKey: ["credits", userId] });
  };
  const decision = useMutation({ retry: false, networkMode: "always",
    mutationFn: (value: ApprovalDecision["decision"]) => decideApproval(approval.id, { requestId, inputHash: approval.inputHash, decision: value }, () => getToken(), lifetime.current?.signal),
    onSuccess: result => { if (!lifetime.current?.signal.aborted) setResolved(result.status); },
    onSettled: refresh,
  });
  const status = resolved ?? approval.status;
  if (status !== "pending") return <p role="status" className={styles.hint}>{status === "approved" ? "Approval recorded. Resuming your task…" : status === "expired" ? copy.expired : "This approval is closed."}</p>;
  return <section className={styles.approval} aria-label={`${copy.title}: ${tool.label}`}>
    <h3>{copy.title}</h3>
    {copy.showEstimate ? <p><strong>{copy.estimate}: {formatCredits(approval.estimate)}</strong></p> : null}
    <p className={styles.hint}>{copy.notice}</p>
    <dl className={styles.approvalSettings}>{Object.entries(tool.input).map(([key, value]) => <div key={key}><dt>{label(key)}</dt><dd>{typeof value === "string" || typeof value === "number" ? String(value) : Array.isArray(value) && value.every(item => typeof item === "string") ? <ol>{value.map((step, index) => <li key={index}>{step}</li>)}</ol> : JSON.stringify(value)}</dd></div>)}</dl>
    {expired ? <p role="status">{copy.expired}</p> : <div className={styles.assetActions}>
      <button type="button" className={styles.primary} disabled={decision.isPending || (chosen !== null && chosen !== "approved")} onClick={() => { setChosen("approved"); decision.mutate("approved"); }}>{decision.isPending ? "Saving decision…" : copy.approve}</button>
      <button type="button" className={styles.secondary} disabled={decision.isPending || (chosen !== null && chosen !== "rejected")} onClick={() => { setChosen("rejected"); decision.mutate("rejected"); }}>{copy.reject}</button>
    </div>}
    {decision.error ? <p role="alert" className={styles.error}>{decision.error.message} Your saved decision is being checked; reload if the status does not update.</p> : null}
  </section>;
}
