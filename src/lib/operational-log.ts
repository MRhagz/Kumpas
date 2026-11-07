import "server-only";
import { createHash, randomUUID } from "node:crypto";

export type OperationalStage = "processing" | "academic_audit" | "industry_analysis" | "feasibility_analysis" | "report_cleanup" | "session_cleanup";
export type OperationalCode = "operation_failed" | "retry_scheduled" | "cleanup_pending" | "deadline" | "stale" | "retry_delay";

/** Only fixed enums, generated/pseudonymous IDs and numeric measurements cross this boundary. */
export function operationalEvent(stage: OperationalStage, outcome: "success" | "failure" | "retry", startedAt: number,
  options: { id?: string; code?: OperationalCode; attempt?: number; pending?: number; log?: Pick<Console, "info" | "warn"> } = {}) {
  const event = {
    runId: options.id ? createHash("sha256").update(options.id).digest("hex").slice(0, 24) : randomUUID(),
    stage, outcome, durationMs: Math.max(0, Date.now() - startedAt),
    ...(options.code ? { errorCode: options.code } : {}),
    ...(options.attempt !== undefined ? { attempt: options.attempt } : {}),
    ...(options.pending !== undefined ? { pending: options.pending } : {}),
  };
  const log = options.log ?? console;
  if (outcome === "success") log.info("operational_event", event);
  else log.warn("operational_event", event);
}
