import { authorizeMaintenance } from "@/lib/auth/maintenance";
import { operationalEvent } from "@/lib/operational-log";
import { runExpiredSessionCleanup } from "@/lib/module5/expired-session-cleanup";

export const runtime = "nodejs";
export const maxDuration = 300;

interface ExpiredSessionCleanupBody {
  limit?: unknown;
}

const SESSION_CLEANUP_RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
};

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedSessionCleanupRequest(request)) {
    return sessionCleanupJsonResponse({ error: "Unauthorized" }, 401);
  }

  const searchParams = new URL(request.url).searchParams;

  return runCleanup({
    limit: searchParams.get("limit"),
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!isAuthorizedSessionCleanupRequest(request)) {
    return sessionCleanupJsonResponse({ error: "Unauthorized" }, 401);
  }

  let body: ExpiredSessionCleanupBody = {};

  try {
    const text = await request.text();
    body = text ? (JSON.parse(text) as ExpiredSessionCleanupBody) : {};
  } catch {
    return sessionCleanupJsonResponse(
      { error: "Request body must be valid JSON when provided." },
      400,
    );
  }

  return runCleanup(body);
}

async function runCleanup(
  body: ExpiredSessionCleanupBody,
): Promise<Response> {
  const limit = parsePositiveInteger(body.limit, "limit");

  if (limit instanceof Error) {
    return sessionCleanupJsonResponse({ error: limit.message }, 400);
  }

  const startedAt = Date.now();
  try {
    const result = await runExpiredSessionCleanup({
      limit,
    });

    return sessionCleanupJsonResponse(result);
  } catch {
    operationalEvent("session_cleanup", "failure", startedAt, { code: "operation_failed" });
    return sessionCleanupJsonResponse({ error: "Maintenance cleanup failed. Retry the operation." }, 500);
  }
}

function parsePositiveNumber(
  value: unknown,
  fieldName: string,
): number | undefined | Error {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsedValue =
    typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return new Error(`${fieldName} must be a number greater than zero.`);
  }

  return parsedValue;
}

function parsePositiveInteger(
  value: unknown,
  fieldName: string,
): number | undefined | Error {
  const parsedValue = parsePositiveNumber(value, fieldName);

  if (parsedValue === undefined || parsedValue instanceof Error) {
    return parsedValue;
  }

  if (!Number.isInteger(parsedValue) || parsedValue > 100) {
    return new Error(`${fieldName} must be an integer between 1 and 100.`);
  }

  return parsedValue;
}

function isAuthorizedSessionCleanupRequest(request: Request): boolean {
  return authorizeMaintenance(request, process.env.SESSION_CLEANUP_SECRET, "x-session-cleanup-secret");
}

function sessionCleanupJsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: SESSION_CLEANUP_RESPONSE_HEADERS,
  });
}
