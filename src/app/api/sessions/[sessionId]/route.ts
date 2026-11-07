import { type NextRequest } from "next/server";

import { sessionStateManager } from "@/lib/module5/session-state-manager";
import { normalizeReportSessionId } from "@/lib/report/file-store";
import { sessionTerminationHandler } from "@/lib/report/session-termination";
import { supabaseAdmin } from "@/lib/supabase";
import {
  notFoundResponse,
  requireUser,
  unauthorizedResponse,
  userOwnsSession,
} from "@/lib/auth/api-auth";

export const runtime = "nodejs";

const SESSION_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  const user = await requireUser();
  if (!user) return unauthorizedResponse();

  let normalizedSessionId: string;

  try {
    normalizedSessionId = normalizeReportSessionId(sessionId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid session id.";

    return createSessionJsonResponse({ error: message }, 400);
  }

  if (!(await userOwnsSession(normalizedSessionId, user.id))) {
    return notFoundResponse();
  }

  try {
    const sessionState =
      await sessionStateManager.getSessionState(normalizedSessionId, user.id);

    if (!sessionState) {
      return notFoundResponse();
    }

    return createSessionJsonResponse(sessionState);
  } catch {
    console.error("[session-recovery] Failed to load saved session versions.");
    return createSessionJsonResponse({ error: "Could not load your saved draft. Try again." }, 500);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  const user = await requireUser();
  if (!user) return unauthorizedResponse();

  let normalizedSessionId: string;

  try {
    normalizedSessionId = normalizeReportSessionId(sessionId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid session id.";

    return createSessionJsonResponse({ error: message }, 400);
  }

  const { data: revoked, error } = await supabaseAdmin.rpc("begin_session_termination", {
    p_session_id: normalizedSessionId, p_counselor_id: user.id,
  });
  if (error) return createSessionJsonResponse({ error: "Termination could not be confirmed. Retry ending this session." }, 503);
  if (!revoked) return notFoundResponse();

  let result;
  try {
    result = await sessionTerminationHandler.terminateSession(normalizedSessionId);
  } catch {
    // Revocation already committed; never report this as an active session.
    return createSessionJsonResponse({ sessionId: normalizedSessionId, status: "terminated",
      cleanupPending: true, warnings: ["Session ended. Cleanup is pending retry."] }, 202);
  }

  return createSessionJsonResponse({
    sessionId: result.sessionId,
    status: "terminated",
    reportPdfPurged: result.reportPdfPurged,
    redactedImagesPurged: result.redactedImagesPurged,
    sessionRowsPurged: result.sessionRowsPurged,
    sessionScrubbed: result.sessionScrubbed,
    cleanupPending: result.cleanupPending,
    warnings: result.warnings,
  }, result.cleanupPending ? 202 : 200);
}

function createSessionJsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: SESSION_RESPONSE_HEADERS,
  });
}
