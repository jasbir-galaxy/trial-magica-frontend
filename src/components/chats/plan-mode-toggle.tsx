import { ListChecks } from "lucide-react";
import { PLAN_MODE } from "@/generated/plans";
import styles from "./chats.module.css";

export function PlanModeToggle({ enabled, disabled, onChange }: { enabled: boolean; disabled?: boolean; onChange(enabled: boolean): void }) {
  return <button type="button" className={styles.planToggle} aria-pressed={enabled} disabled={disabled} title={PLAN_MODE.description} onClick={() => onChange(!enabled)}>
    <ListChecks size={16} aria-hidden="true" />{PLAN_MODE.label}
  </button>;
}
