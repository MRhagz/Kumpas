import { type NextRequest } from "next/server";

import { sessionTerminationHandler } from "@/lib/report/session-termination";

export const runtime = "nodejs";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const normalizedSessionId = sessionId.trim();

  if (!normalizedSessionId) {
    return Response.json({ error: "sessionId is required." }, { status: 400 });
  }

  const result =
    await sessionTerminationHandler.terminateSession(normalizedSessionId);

  return Response.json({
    sessionId: result.sessionId,
    status: "terminated",
    reportPdfPurged: result.reportPdfPurged,
    warnings: result.warnings,
  });
}
