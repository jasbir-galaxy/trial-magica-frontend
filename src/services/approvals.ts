import { z } from "zod";
import { ApprovalDecisionSchema, ApprovalSchema, type ApprovalDecision } from "@/generated/credits";
import { apiPost } from "./api-client";
export function decideApproval(id: string, input: ApprovalDecision, getToken: () => Promise<string | null>, signal?: AbortSignal) {
  return apiPost(`/api/app/v1/approvals/${z.uuid().parse(id)}`, ApprovalSchema, ApprovalDecisionSchema.parse(input), getToken, signal);
}
