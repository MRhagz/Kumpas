import { type NextRequest } from "next/server";
import { requireUser, unauthorizedResponse } from "@/lib/auth/api-auth";
import { POST as upload } from "@/app/api/sessions/[sessionId]/upload/route";

export const runtime = "nodejs";
export const maxDuration = 300;

// Compatibility entry point: academic extraction always belongs to an owned draft.
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return unauthorizedResponse();
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
    return Response.json({ error: "Open a session and upload the document from its intake form." }, { status: 400 });
  }
  return upload(request, { params: Promise.resolve({ sessionId }) });
}
