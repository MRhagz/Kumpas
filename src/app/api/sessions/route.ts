import { type NextRequest } from "next/server";
import { sessionInitializationService } from "@/lib/module2/session-initialization-service";

export async function POST(_request: NextRequest) {
  try {
    const session = await sessionInitializationService.createSession();
    await sessionInitializationService.createSessionNotes(session.id);
    return Response.json({ sessionId: session.id, expiresAt: session.expires_at });
  } catch (err) {
    console.error("[POST /api/sessions]", err);
    return Response.json({ error: "Failed to initialize session" }, { status: 500 });
  }
}
