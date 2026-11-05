import { supabaseAdmin } from "@/lib/supabase";
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
    const { data: session, error: sessionError } = await supabaseAdmin.from("sessions").select("current_run_id, current_report_version").eq("id", sessionId).single();
    if (sessionError || !session) return notFoundResponse();
    let version: number | undefined;
    if (session?.current_run_id) {
      const { data: report } = await supabaseAdmin.from("report_versions").select("report_version")
        .eq("session_id", sessionId).eq("run_id", session.current_run_id).eq("report_version", session.current_report_version)
        .neq("status", "out_of_date").gt("expires_at", new Date().toISOString()).maybeSingle();
      if (!report) return notFoundResponse();
      version = report.report_version;
    }
    const pdf = await pdfFileStore.downloadReportPdf(sessionId, version);
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
