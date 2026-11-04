import { requireUser, unauthorizedResponse, userOwnsSession, notFoundResponse } from "@/lib/auth/api-auth";
import { documentStorageService } from "@/lib/module2/document-storage-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string; documentId: string }> },
) {
  const user = await requireUser();
  if (!user) return unauthorizedResponse();
  const { sessionId, documentId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(documentId) || !(await userOwnsSession(sessionId, user.id))) {
    return notFoundResponse();
  }
  try {
    const image = await documentStorageService.retrieveRedacted(`${sessionId}/${documentId}.jpg`);
    return new Response(image, { headers: {
      "Content-Type": "image/jpeg", "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return notFoundResponse();
  }
}
