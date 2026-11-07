import { authorizeMaintenance } from "@/lib/auth/maintenance";
import { operationalEvent } from "@/lib/operational-log";
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

  const startedAt = Date.now();
  try {
    const result = await runReportRetentionCleanup({ retentionHours });

    return retentionJsonResponse(result);
  } catch {
    operationalEvent("report_cleanup", "failure", startedAt, { code: "operation_failed" });
    return retentionJsonResponse({ error: "Maintenance cleanup failed. Retry the operation." }, 500);
  }
}

function parseRetentionHours(value: unknown): number | undefined | Error {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const retentionHours =
    typeof value === "number" ? value : Number(value);

  if (retentionHours !== 24) {
    return new Error("PDF retention is fixed at 24 hours.");
  }

  return retentionHours;
}

function isAuthorizedRetentionRequest(request: Request): boolean {
  return authorizeMaintenance(request, process.env.REPORT_RETENTION_SECRET, "x-report-retention-secret");
}

function retentionJsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: RETENTION_RESPONSE_HEADERS,
  });
}
