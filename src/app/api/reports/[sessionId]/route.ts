import { requireUser, unauthorizedResponse, userOwnsSession, notFoundResponse } from "@/lib/auth/api-auth";
import { pdfFileStore } from "@/lib/report/file-store";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const user = await requireUser();
  if (!user) return unauthorizedResponse();
  const { sessionId } = await params;
  if (!(await userOwnsSession(sessionId, user.id))) return notFoundResponse();
  try {
    const pdf = await pdfFileStore.downloadReportPdf(sessionId);
    const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
    return new Response(pdf, { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="kumpas-${encodeURIComponent(sessionId)}.pdf"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return notFoundResponse();
  }
}
