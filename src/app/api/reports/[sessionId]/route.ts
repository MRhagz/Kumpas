import { supabaseAdmin } from "@/lib/supabase";
import { requireUser, unauthorizedResponse, notFoundResponse } from "@/lib/auth/api-auth";
import { getReportPdfObjectKey, pdfFileStore } from "@/lib/report/file-store";

async function canReadReport(sessionId: string, ownerId: string, version: number): Promise<boolean> {
  // The session row retains only the pointers needed to authorize an approved PDF
  // after draft cleanup. Its draft expiry is not the PDF's expiry.
  const { data: session, error } = await supabaseAdmin.from("sessions")
    .select("current_run_id,current_profile_version,current_report_version")
    .eq("id", sessionId).eq("counselor_id", ownerId)
    .in("status", ["active", "completed", "expired"]).maybeSingle();
  if (error || !session?.current_run_id || session.current_report_version !== version) return false;

  const { data: report, error: reportError } = await supabaseAdmin.from("report_versions")
    .select("object_key,expires_at")
    .eq("session_id", sessionId).eq("counselor_id", ownerId)
    .eq("report_version", version).eq("run_id", session.current_run_id)
    .eq("approved_profile_version", session.current_profile_version)
    .eq("status", "approved").not("approved_at", "is", null)
    .gt("expires_at", new Date().toISOString()).maybeSingle();
  return !reportError && !!report && Date.parse(report.expires_at) > Date.now() &&
    report.object_key === getReportPdfObjectKey(sessionId, version);
}

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
    if (!(await canReadReport(sessionId, user.id, version))) return notFoundResponse();
    const pdf = await pdfFileStore.downloadReportPdf(sessionId, version);
    // Storage I/O can cross the expiry boundary or overlap a replacement.
    if (!(await canReadReport(sessionId, user.id, version))) return notFoundResponse();
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
