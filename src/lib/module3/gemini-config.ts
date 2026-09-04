const DEFAULT_GENERATION_MODEL = "gemini-3.6-flash";

export function getGeminiGenerationModel(): string {
  return (
    process.env.GEMINI_GENERATION_MODEL?.trim() || DEFAULT_GENERATION_MODEL
  );
}

export function requireApiKey(
  agentName: string,
  apiKey: string | undefined,
): string {
  const normalizedApiKey = apiKey?.trim();

  if (!normalizedApiKey) {
    throw new AgentConfigurationError(
      `${agentName} is not configured: API key is missing.`,
    );
  }

  return normalizedApiKey;
}

export class AgentConfigurationError extends Error {
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = "AgentConfigurationError";
  }
}
