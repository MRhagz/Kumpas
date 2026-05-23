import { type NextRequest } from "next/server";

import { normalizeReportSessionId } from "@/lib/report/file-store";
import { sessionTerminationHandler } from "@/lib/report/session-termination";

export const runtime = "nodejs";

const SESSION_RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
};

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  let normalizedSessionId: string;

  try {
    normalizedSessionId = normalizeReportSessionId(sessionId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid session id.";

    return createSessionJsonResponse({ error: message }, 400);
  }

  const result =
    await sessionTerminationHandler.terminateSession(normalizedSessionId);

  return createSessionJsonResponse({
    sessionId: result.sessionId,
    status: "terminated",
    reportPdfPurged: result.reportPdfPurged,
    warnings: result.warnings,
  });
}

function createSessionJsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: SESSION_RESPONSE_HEADERS,
  });
}
