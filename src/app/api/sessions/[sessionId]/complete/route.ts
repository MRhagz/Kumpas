import { type NextRequest } from "next/server";

import { normalizeReportSessionId } from "@/lib/report/file-store";
import { sessionCompletionService } from "@/lib/report/session-completion";

export const runtime = "nodejs";

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

    return Response.json({ error: message }, { status: 400 });
  }

  try {
    await sessionCompletionService.markReportDownloaded(normalizedSessionId);

    return Response.json({
      sessionId: normalizedSessionId,
      status: "complete",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to mark session complete.";

    return Response.json({ error: message }, { status: 500 });
  }
}
