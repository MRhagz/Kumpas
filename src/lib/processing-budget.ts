import { operationalEvent } from "@/lib/operational-log";
import { randomUUID } from "node:crypto";
import { ANALYSIS_BUDGET_MS } from "@/lib/module5/versioned-contracts";

export class ProcessingError extends Error {
  readonly retryable = false;
  constructor(readonly stage: string, readonly code: "deadline" | "retry_delay" | "stale") {
    super(`${stage} stopped (${code}). Your approved inputs are saved. Retry analysis or return to Confirm Information.`);
    this.name = "ProcessingError";
  }
}

/** Preserve provider metadata, never expose a raw response body to the counselor. */
export class ProviderError extends Error {
  constructor(readonly status: number, readonly retryAfter: string | null, readonly details: unknown) {
    super(`External service returned HTTP ${status}.`);
  }
}

function metadata(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== "object") return {};
  const record = error as Record<string, unknown>;
  if (record.cause) return metadata(record.cause);
  return record;
}

function providerDetails(error: Record<string, unknown>): string {
  return JSON.stringify(error.details ?? error.message ?? "");
}

export function isTransientFailure(error: unknown): boolean {
  if (error instanceof ProcessingError) return false;
  const detail = metadata(error);
  if (detail.retryable === false) return false;
  // RESOURCE_EXHAUSTED alone also describes temporary rate limits. Daily/zero
  // quota, billing and explicit exhausted-quota signals must never be retried.
  if (/quota.{0,30}exhaust|exhaust.{0,30}quota|per.?day|daily|billing|(?:quota[_a-z]*limit[_a-z]*|quotaValue|limit)["\\: =]+0\b/i.test(providerDetails(detail))) return false;
  const status = Number(detail.status ?? detail.statusCode);
  if (Number.isFinite(status)) return status === 408 || status === 429 || (status >= 500 && status <= 599);
  return detail.name === "TimeoutError" ||
    /^(ECONNRESET|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED)$/.test(String(detail.code)) ||
    (error instanceof TypeError && /fetch failed|network/i.test(error.message));
}

export function retryDelayMs(error: unknown, now: number): number {
  const detail = metadata(error);
  const headers = detail.headers as Headers | Record<string, string> | undefined;
  const value = detail.retryAfter ?? (headers instanceof Headers ? headers.get("retry-after") : headers?.["retry-after"]);
  if (value !== undefined && value !== null) {
    const seconds = Number(value);
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(String(value)) - now;
    if (Number.isFinite(delay)) return Math.max(2000, delay);
  }
  // Gemini SDK ApiError messages retain google.rpc.RetryInfo in JSON.
  const retryInfo = /"retryDelay"\s*:\s*"([\d.]+)s"/.exec(providerDetails(detail).replaceAll('\\"', '"'));
  return Math.max(2000, retryInfo ? Number(retryInfo[1]) * 1000 : 0);
}

/** One absolute wall-clock deadline; construct from the persisted run, never per stage. */
export class ProcessingBudget {
  constructor(readonly deadlineAt = Date.now() + ANALYSIS_BUDGET_MS, readonly runId: string = randomUUID()) {}

  assert(stage: string): void {
    if (!Number.isFinite(this.deadlineAt) || Date.now() >= this.deadlineAt) {
      throw new ProcessingError(stage, "deadline");
    }
  }

  async run<T>(stage: string, operation: (signal: AbortSignal) => Promise<T>, retry = true, attemptTimeoutMs = Infinity): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      this.assert(stage);
      const startedAt = Date.now();
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const expired = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(Date.now() >= this.deadlineAt ? new ProcessingError(stage, "deadline") : new ProviderError(408, null, null));
          }, Math.min(this.deadlineAt - Date.now(), attemptTimeoutMs));
        });
        const result = await Promise.race([operation(controller.signal), expired]);
        this.assert(stage); // Includes synchronous work and providers ignoring abort.
        if (Date.now() - startedAt >= attemptTimeoutMs) {
          controller.abort();
          throw new ProviderError(408, null, null);
        }
        operationalEvent("processing", "success", startedAt, { id: this.runId, attempt: attempt + 1 });
        return result;
      } catch (error) {
        operationalEvent("processing", "failure", startedAt, { id: this.runId, attempt: attempt + 1, code: error instanceof ProcessingError ? error.code : "operation_failed" });
        this.assert(stage);
        if (!retry || attempt === 1 || !isTransientFailure(error)) throw error;
        const delay = retryDelayMs(error, Date.now());
        if (delay >= this.deadlineAt - Date.now()) throw new ProcessingError(stage, "retry_delay");
        operationalEvent("processing", "retry", startedAt, { id: this.runId, attempt: attempt + 1, code: "retry_scheduled" });
        if (timer) clearTimeout(timer);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
  }
}

/** Consume error/body under the same timer, including Retry-After headers. */
export async function requestProviderJson(url: string, init: RequestInit, budget = new ProcessingBudget(), stage = "extraction") {
  return budget.run(stage, async (signal) => {
    const response = await fetch(url, { ...init, signal });
    if (!response.ok) {
      throw new ProviderError(response.status, response.headers.get("retry-after"), await response.json().catch(() => null));
    }
    return response.json();
  });
}
