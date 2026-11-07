import { requireUser, unauthorizedResponse, notFoundResponse } from "@/lib/auth/api-auth";
import { readDraftPdf } from "@/lib/report/access";

export async function GET(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const user = await requireUser();
  if (!user) return unauthorizedResponse();
  const { sessionId } = await params;
  const value = new URL(request.url).searchParams.get("version") ?? "";
  const version = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(version)) return notFoundResponse();
  try {
    const pdf = await readDraftPdf(sessionId, user.id, version);
    if (!pdf) return notFoundResponse();
    return new Response(pdf, { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="kumpas-${encodeURIComponent(sessionId)}-v${version}-Draft.pdf"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return notFoundResponse();
  }
}
