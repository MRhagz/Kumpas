import "server-only";

import { GoogleGenAI, type GenerateContentResponse } from "@google/genai";
import { ProcessingBudget, ProviderError } from "@/lib/processing-budget";
import { assertEmbeddingConfiguration } from "./embedding-contract";

const GENERATION_MODEL = "gemini-3.8-flash";
const GEMINI_ORIGIN = "https://generativelanguage.googleapis.com";

export function getGeminiApiVersion(): string {
  const version = process.env.GEMINI_API_VERSION?.trim() ?? "v1beta";
  if (version !== "v1beta") {
    throw new AgentConfigurationError("GEMINI_API_VERSION must be v1beta.");
  }
  return version;
}

export function getGeminiGenerationModel(): string {
  const model = process.env.GEMINI_GENERATION_MODEL?.trim() ?? GENERATION_MODEL;
  if (model !== GENERATION_MODEL) {
    throw new AgentConfigurationError("GEMINI_GENERATION_MODEL must be gemini-3.8-flash.");
  }
  return model;
}

export function createGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: requireApiKey("Gemini", apiKey),
    vertexai: false,
    // In SDK 2.6, omitting retryOptions makes a single fetch and preserves ApiError
    // metadata. Enabling its retry wrapper strips status/body even at one attempt.
    httpOptions: { baseUrl: GEMINI_ORIGIN, apiVersion: getGeminiApiVersion() },
  });
}

export function getGeminiResponseText(response: GenerateContentResponse): string {
  return (response.candidates?.[0]?.content?.parts ?? [])
    .filter((part) => !part.thought)
    .map((part) => part.text ?? "")
    .join("");
}

export function validateProviderConfiguration(): void {
  getGeminiGenerationModel();
  getGeminiApiVersion();
  assertEmbeddingConfiguration();
  for (const name of [
    "DOCUMENT_INTAKE_API_KEY", "ACADEMIC_AUDITOR_API_KEY",
    "INDUSTRY_ANALYST_API_KEY", "FEASIBILITY_STRATEGIST_API_KEY", "SYNTHESIS_API_KEY",
  ]) {
    requireApiKey(name, process.env[name]);
  }
  for (const name of Object.keys(process.env)) {
    if (/^NEXT_PUBLIC_.*(?:GEMINI|API_KEY|SERVICE_ROLE|SECRET)/.test(name)) {
      throw new AgentConfigurationError("Provider and privileged credentials must not use NEXT_PUBLIC_ names.");
    }
  }
  // Reflect prevents Next's optimizer from replacing this runtime check with the build value.
  const raw = (Reflect.get(process.env, "NEXT_PUBLIC_SUPABASE_URL") as string | undefined)?.trim();
  let url: URL;
  try {
    url = new URL(raw ?? "");
  } catch {
    throw new AgentConfigurationError("NEXT_PUBLIC_SUPABASE_URL must be a valid service URL.");
  }
  const local = process.env.NODE_ENV === "development" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username || url.password || url.search || url.hash) {
    throw new AgentConfigurationError("Supabase requires HTTPS; HTTP is allowed only on loopback in development.");
  }
  if (raw !== process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
    throw new AgentConfigurationError("NEXT_PUBLIC_SUPABASE_URL changed since the build; rebuild before starting.");
  }
  requireApiKey("Supabase service", process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// All image operations share the approved model, endpoint and header authentication.
export async function requestGeminiImage(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
  const apiKey = requireApiKey("Document intake", process.env.DOCUMENT_INTAKE_API_KEY);
  const url = `${GEMINI_ORIGIN}/${getGeminiApiVersion()}/models/${getGeminiGenerationModel()}:generateContent`;
  try {
    return await fetch(url, {
      method: "POST",
      redirect: "error",
      signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Gemini image request failed.");
  }
}

export async function requestGeminiImageJson(
  body: Record<string, unknown>,
  budget = new ProcessingBudget(),
  stage = "extraction",
): Promise<GenerateContentResponse> {
  return budget.run(stage, async (signal) => {
    const response = await requestGeminiImage(body, signal);
    if (!response.ok) {
      throw new ProviderError(response.status, response.headers.get("retry-after"), await response.json().catch(() => null));
    }
    return response.json();
  });
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
