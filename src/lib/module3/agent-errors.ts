import type { AgentName } from "./types";

export type AgentStage =
  | "embedding"
  | "knowledge retrieval"
  | "analysis generation";

interface ErrorWithStatus {
  status?: unknown;
}

interface ErrorWithRetryable {
  retryable?: unknown;
}

function getHttpStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const status = (error as ErrorWithStatus).status;
  return typeof status === "number" ? status : undefined;
}

function isTemporaryStatus(status: number | undefined): boolean {
  if (status === undefined) {
    return true;
  }

  return status === 408 || status === 429 || status >= 500;
}

function getSafeMessage(
  agentName: AgentName,
  stage: AgentStage,
  status: number | undefined,
): string {
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
    this.retryable = isTemporaryStatus(status);
    this.cause = cause;
  }
}

export async function runAgentStage<T>(
  agentName: AgentName,
  stage: AgentStage,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw new AgentOperationError(agentName, stage, error);
  }
}

export function isRetryableError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return true;
  }

  const retryable = (error as ErrorWithRetryable).retryable;
  return typeof retryable === "boolean" ? retryable : true;
}

export function getPublicErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Agent execution failed.";
}
