import { type NextRequest } from "next/server";

import { normalizeReportSessionId } from "@/lib/report/file-store";
import { sessionCompletionService } from "@/lib/report/session-completion";

export const runtime = "nodejs";

const SESSION_RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
};

export async function POST(
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

  try {
    await sessionCompletionService.markReportDownloaded(normalizedSessionId);

    return createSessionJsonResponse({
      sessionId: normalizedSessionId,
      status: "complete",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to mark session complete.";

    return createSessionJsonResponse({ error: message }, 500);
  }
}

function createSessionJsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: SESSION_RESPONSE_HEADERS,
  });
}
