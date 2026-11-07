import { requireUser, unauthorizedResponse, notFoundResponse, userOwnsSession } from "@/lib/auth/api-auth";

export async function POST(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const user = await requireUser();
  if (!user) return unauthorizedResponse();
  const { sessionId } = await params;
  if (!(await userOwnsSession(sessionId, user.id))) return notFoundResponse();
  // Completion is recorded only by the authorized PDF delivery route.
  return Response.json({ error: "Open the approved report to complete delivery." }, {
    status: 410, headers: { "Cache-Control": "private, no-store" },
  });
}
