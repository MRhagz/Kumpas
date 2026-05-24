import { runExpiredSessionCleanup } from "@/lib/module5/expired-session-cleanup";

export const runtime = "nodejs";

interface ExpiredSessionCleanupBody {
  inactivityHours?: unknown;
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
    inactivityHours: searchParams.get("inactivityHours"),
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
  const inactivityHours = parsePositiveNumber(
    body.inactivityHours,
    "inactivityHours",
  );
  const limit = parsePositiveInteger(body.limit, "limit");

  if (inactivityHours instanceof Error) {
    return sessionCleanupJsonResponse({ error: inactivityHours.message }, 400);
  }

  if (limit instanceof Error) {
    return sessionCleanupJsonResponse({ error: limit.message }, 400);
  }

  try {
    const result = await runExpiredSessionCleanup({
      inactivityHours,
      limit,
    });

    return sessionCleanupJsonResponse(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Expired session cleanup failed.";

    return sessionCleanupJsonResponse({ error: message }, 500);
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
    typeof value === "number" ? value : Number.parseFloat(String(value));

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

  if (!Number.isInteger(parsedValue)) {
    return new Error(`${fieldName} must be a positive integer.`);
  }

  return parsedValue;
}

function isAuthorizedSessionCleanupRequest(request: Request): boolean {
  const cleanupSecret =
    process.env.SESSION_CLEANUP_SECRET ?? process.env.REPORT_RETENTION_SECRET;

  if (!cleanupSecret) {
    return false;
  }

  const providedSecret =
    request.headers.get("x-session-cleanup-secret") ??
    request.headers.get("x-report-retention-secret") ??
    getBearerToken(request);

  return providedSecret === cleanupSecret;
}

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

function sessionCleanupJsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: SESSION_CLEANUP_RESPONSE_HEADERS,
  });
}
