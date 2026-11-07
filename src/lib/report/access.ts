import "server-only";

import { supabaseAdmin } from "@/lib/supabase";
import { getReportPdfObjectKey, pdfFileStore } from "@/lib/report/file-store";
import { reportContentMarker } from "@/lib/report/types";

export interface StoredReport {
  run_id: string;
  report_version: number;
  approved_profile_version: number;
  status: "draft" | "approved";
  object_key: string;
  expires_at: string;
}

export async function readCurrentReport(sessionId: string, ownerId: string, version: number, preview = false): Promise<StoredReport | null> {
  // Final PDF authorization survives the draft clock and draft-content purge.
  let sessionQuery = supabaseAdmin.from("sessions")
    .select("current_run_id,current_profile_version,current_report_version,expires_at")
    .eq("id", sessionId).eq("counselor_id", ownerId)
    .in("status", preview ? ["active", "completed"] : ["active", "completed", "expired"]);
  if (preview) sessionQuery = sessionQuery.gt("expires_at", new Date().toISOString());
  const { data: session, error } = await sessionQuery.maybeSingle();
  if (error || !session?.current_run_id || session.current_report_version !== version ||
    (preview && !(Date.parse(session.expires_at) > Date.now()))) return null;

  let reportQuery = supabaseAdmin.from("report_versions")
    .select("object_key,expires_at,run_id,report_version,approved_profile_version,status")
    .eq("session_id", sessionId).eq("counselor_id", ownerId)
    .eq("report_version", version).eq("run_id", session.current_run_id)
    .eq("approved_profile_version", session.current_profile_version)
    .eq("status", preview ? "draft" : "approved")
    .gt("expires_at", new Date().toISOString());
  if (!preview) reportQuery = reportQuery.not("approved_at", "is", null);
  const { data: report, error: reportError } = await reportQuery.maybeSingle();
  if (reportError || !report || !(Date.parse(report.expires_at) > Date.now()) ||
    report.object_key !== getReportPdfObjectKey(sessionId, version)) return null;
  return report as StoredReport;
}

export async function readDraftPdf(sessionId: string, ownerId: string, version: number) {
  const report = await readCurrentReport(sessionId, ownerId, version, true);
  if (!report) return null;
  const pdf = await pdfFileStore.downloadReportPdf(sessionId, version);
  const header = Buffer.from(await pdf.slice(0, 256).arrayBuffer()).toString("utf8");
  // This renderer contract includes a visible Draft origin on every page.
  if (!header.startsWith(`%PDF-1.4\n${reportContentMarker(version, report.approved_profile_version)}`)) return null;
  if (!(await readCurrentReport(sessionId, ownerId, version, true))) return null;
  return pdf;
}
