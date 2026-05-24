import { type NextRequest } from "next/server";
import { sessionInitializationService } from "@/lib/module2/session-initialization-service";
import { requireUser, unauthorizedResponse } from "@/lib/auth/api-auth";

export async function POST(_request: NextRequest) {
  const user = await requireUser();
  if (!user) return unauthorizedResponse();

  try {
    const session = await sessionInitializationService.createSession(user.id);
    await sessionInitializationService.createSessionNotes(session.id, user.id);
    return Response.json({ sessionId: session.id, expiresAt: session.expires_at });
  } catch (err) {
    console.error("[POST /api/sessions]", err);
    return Response.json({ error: "Failed to initialize session" }, { status: 500 });
  }
}
