"use client";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { creditKeys, getCredits, getCreditHistory } from "@/services/credits";
import { formatCredits } from "@/generated/tools";
import styles from "./chats.module.css";
const entryLabels = { grant: "Trial allocation", reserve: "Credits reserved", settle: "Usage settled" } as const;
export function CreditBalance({ active }: { active: boolean }) {
  const { userId, getToken } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const balance = useQuery({ queryKey: creditKeys.balance(userId!), queryFn: ({ signal }) => getCredits(() => getToken(), signal), enabled: !!userId, retry: 2, refetchInterval: active ? 3000 : false });
  const ledger = useInfiniteQuery({ queryKey: creditKeys.ledger(userId!), queryFn: ({ pageParam, signal }) => getCreditHistory(() => getToken(), pageParam, signal), initialPageParam: undefined as string | undefined, getNextPageParam: page => page.nextCursor ?? undefined, enabled: expanded && !!userId, retry: 2 });
  return <aside className={styles.creditBalance} aria-label="Credit balance">
    <button className={styles.creditPill} type="button" aria-label="Credit history" aria-expanded={expanded} title={balance.data ? `${formatCredits(balance.data.available)} available — view credit history` : "Credit history"} onClick={() => setExpanded(value => !value)}>
      <Sparkles size={14} aria-hidden="true" /><strong>{balance.data ? formatCredits(balance.data.available) : "Credits"}</strong>
    </button>
    {balance.data && balance.data.available < balance.data.admissionAmount && !expanded ? <p className={styles.creditWarning} role="status">There are not enough available credits to start another reply. Contact support to add credits.</p> : null}
    {balance.isError && !expanded ? <button className={styles.secondary} onClick={() => void balance.refetch()}>Retry balance</button> : null}
    {expanded ? <div className={styles.creditDetails}>
      <h2>Credit history</h2>
      {balance.data ? <p>{formatCredits(balance.data.available)} available · {formatCredits(balance.data.reserved)} reserved</p> : <p>{balance.isError ? "Credit balance unavailable." : "Loading credits…"}</p>}
      {balance.isError ? <button className={styles.secondary} onClick={() => void balance.refetch()}>Retry balance</button> : null}
      {ledger.isPending ? <p role="status">Loading credit history…</p> : null}
      {ledger.isError ? <button className={styles.secondary} onClick={() => void ledger.refetch()}>Retry credit history</button> : null}
      <ul>{ledger.data?.pages.flatMap(page => page.items).map(entry => <li key={entry.id}>
        <strong>{entryLabels[entry.kind]}</strong>: {entry.balanceDelta ? formatCredits(entry.balanceDelta) : `${formatCredits(Math.abs(entry.reservedDelta))} ${entry.reservedDelta > 0 ? "reserved" : "released"}`}
        {entry.kind === "settle" && entry.balanceDelta !== 0 ? ` · ${formatCredits(Math.abs(entry.reservedDelta))} released` : ""}
        <time dateTime={entry.createdAt}> · {new Date(entry.createdAt).toLocaleString()}</time>
      </li>)}</ul>
      {ledger.hasNextPage ? <button className={styles.secondary} disabled={ledger.isFetchingNextPage} onClick={() => void ledger.fetchNextPage()}>Older credit entries</button> : null}
    </div> : null}
  </aside>;
}
