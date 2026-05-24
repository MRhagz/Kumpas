import { requireUser, unauthorizedResponse } from "@/lib/auth/api-auth";
import { getIngestionFreshness } from "@/lib/module5/ingestion-freshness";

export const runtime = "nodejs";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
};

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorizedResponse();

  try {
    const freshness = await getIngestionFreshness();
    return createFreshnessResponse(freshness);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load ingestion freshness.";

    return createFreshnessResponse({ error: message }, 500);
  }
}

function createFreshnessResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: RESPONSE_HEADERS,
  });
}
