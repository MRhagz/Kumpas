import { requireUser, unauthorizedResponse, notFoundResponse } from "@/lib/auth/api-auth";
import { pdfFileStore } from "@/lib/report/file-store";
import { readCurrentReport } from "@/lib/report/access";
import { sessionCompletionService } from "@/lib/report/session-completion";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const user = await requireUser();
  if (!user) return unauthorizedResponse();
  const { sessionId } = await params;
  const query = new URL(request.url).searchParams;
  const requestedVersion = query.get("version") ?? "";
  const version = Number(requestedVersion);
  if (!/^[1-9]\d*$/.test(requestedVersion) || !Number.isSafeInteger(version)) return notFoundResponse();

  try {
    const report = await readCurrentReport(sessionId, user.id, version);
    if (!report) return notFoundResponse();
    const pdf = await pdfFileStore.downloadReportPdf(sessionId, version);
    // Atomically recheck after Storage I/O, before releasing any bytes.
    await sessionCompletionService.markReportDownloaded(sessionId, user.id, report);
    const disposition = query.get("download") === "1" ? "attachment" : "inline";
    return new Response(pdf, { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="kumpas-${encodeURIComponent(sessionId)}-v${version}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return notFoundResponse();
  }
}
