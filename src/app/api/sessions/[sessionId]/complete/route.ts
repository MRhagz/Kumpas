import { type NextRequest } from "next/server";

import { sessionCompletionService } from "@/lib/report/session-completion";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const normalizedSessionId = sessionId.trim();

  if (!normalizedSessionId) {
    return Response.json({ error: "sessionId is required." }, { status: 400 });
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
