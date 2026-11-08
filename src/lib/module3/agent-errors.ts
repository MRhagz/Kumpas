import { ProcessingBudget, ProcessingError, isTransientFailure } from "@/lib/processing-budget";
import type { AgentName } from "./types";

export type AgentStage =
  | "embedding"
  | "knowledge retrieval"
  | "analysis generation";

interface ErrorWithStatus {
  status?: unknown;
}

function getHttpStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const status = (error as ErrorWithStatus).status;
  return typeof status === "number" ? status : undefined;
}

function getSafeMessage(
  agentName: AgentName,
  stage: AgentStage,
  status: number | undefined,
): string {
  if (stage === "knowledge retrieval") return `${agentName} knowledge retrieval failed. Supabase evidence is unavailable; retry analysis when service is restored.`;
  switch (status) {
    case 401:
      return `${agentName} authentication failed. Check its Gemini API key.`;
    case 403:
      return `${agentName} does not have permission to use the requested Gemini resource.`;
    case 404:
      return `${agentName} could not access the configured Gemini model.`;
    case 408:
      return `${agentName} ${stage} timed out. Please try again.`;
    case 429:
      return `${agentName} exceeded the Gemini rate limit. Please try again later.`;
    default:
      if (status !== undefined && status >= 500) {
        return `${agentName} ${stage} failed because the external service is unavailable.`;
      }

      return `${agentName} ${stage} failed. Please try again.`;
  }
}

export class AgentOperationError extends Error {
  readonly status: number | undefined;
  readonly retryable: boolean;

  constructor(
    agentName: AgentName,
    stage: AgentStage,
    cause: unknown,
  ) {
    const status = getHttpStatus(cause);
    super(getSafeMessage(agentName, stage, status));

    this.name = "AgentOperationError";
    this.status = status;
    this.retryable = isTransientFailure(cause);
  }
}

export async function runAgentStage<T>(
  agentName: AgentName,
  stage: AgentStage,
  operation: (signal: AbortSignal) => Promise<T>,
  budget = new ProcessingBudget(),
): Promise<T> {
  try {
    // A hung generation gets one bounded retry, leaving room for downstream work.
    return await budget.run(`${agentName} ${stage}`, operation, stage !== "embedding",
      stage === "analysis generation" ? 75000 : undefined);
  } catch (error) {
    if (error instanceof ProcessingError) throw error;
    throw new AgentOperationError(agentName, stage, error);
  }
}

export const isRetryableError = isTransientFailure;

export function getPublicErrorMessage(error: unknown): string {
  return error instanceof AgentOperationError ? error.message : "Agent execution failed. Check server configuration.";
}
