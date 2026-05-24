import { runReportRetentionCleanup } from "@/lib/report/retention-cleanup";

export const runtime = "nodejs";

interface RetentionRequestBody {
  retentionHours?: unknown;
}

const RETENTION_RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
};

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedRetentionRequest(request)) {
    return retentionJsonResponse({ error: "Unauthorized" }, 401);
  }

  const retentionHoursParam = new URL(request.url).searchParams.get("retentionHours");

  return runCleanup(retentionHoursParam);
}

export async function POST(request: Request): Promise<Response> {
  if (!isAuthorizedRetentionRequest(request)) {
    return retentionJsonResponse({ error: "Unauthorized" }, 401);
  }

  let body: RetentionRequestBody = {};

  try {
    const text = await request.text();
    body = text ? (JSON.parse(text) as RetentionRequestBody) : {};
  } catch {
    return retentionJsonResponse(
      { error: "Request body must be valid JSON when provided." },
      400,
    );
  }

  return runCleanup(body.retentionHours);
}

async function runCleanup(retentionHoursValue: unknown): Promise<Response> {
  const retentionHours = parseRetentionHours(retentionHoursValue);

  if (retentionHours instanceof Error) {
    return retentionJsonResponse({ error: retentionHours.message }, 400);
  }

  try {
    const result = await runReportRetentionCleanup({ retentionHours });

    return retentionJsonResponse(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Report retention cleanup failed.";

    return retentionJsonResponse({ error: message }, 500);
  }
}

function parseRetentionHours(value: unknown): number | undefined | Error {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const retentionHours =
    typeof value === "number" ? value : Number.parseFloat(String(value));

  if (!Number.isFinite(retentionHours) || retentionHours <= 0) {
    return new Error("retentionHours must be a number greater than zero.");
  }

  return retentionHours;
}

function isAuthorizedRetentionRequest(request: Request): boolean {
  const retentionSecret = process.env.REPORT_RETENTION_SECRET;

  if (!retentionSecret) {
    return false;
  }

  const providedSecret =
    request.headers.get("x-report-retention-secret") ??
    getBearerToken(request);

  return providedSecret === retentionSecret;
}

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

function retentionJsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: RETENTION_RESPONSE_HEADERS,
  });
}
