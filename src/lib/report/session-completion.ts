import "server-only";

import { supabaseAdmin } from "@/lib/supabase";
import type { StoredReport } from "@/lib/report/access";

export class SessionCompletionService {
  async markReportDownloaded(sessionId: string, counselorId: string, report: StoredReport): Promise<void> {
    const { data, error } = await supabaseAdmin.rpc("complete_report_delivery", {
      p_session_id: sessionId, p_counselor_id: counselorId,
      p_expected_version: report.approved_profile_version,
      p_report_version: report.report_version, p_run_id: report.run_id,
    });
    if (error || !data) throw new Error("The approved report is no longer available.");
  }
}

export const sessionCompletionService = new SessionCompletionService();
