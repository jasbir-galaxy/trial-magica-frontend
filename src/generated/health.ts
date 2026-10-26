// Generated from backend src/contracts/health.ts. Do not edit manually.
import { z } from "zod";

export const HealthResponseSchema = z.object({ status: z.literal("ok") });
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
