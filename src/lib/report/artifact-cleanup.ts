import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { pdfFileStore } from "@/lib/report/file-store";

interface CleanupObject { object_key: string; lease_token: string; attempts: number }

export async function queueReportCleanup(objectKey: string) {
  const { error } = await supabaseAdmin.from("report_artifact_cleanup")
    .upsert({ object_key: objectKey }, { onConflict: "object_key", ignoreDuplicates: true });
  if (error) throw new Error("Could not queue report deletion.");
}

export async function drainReportCleanup(limit = 50) {
  const { data, error } = await supabaseAdmin.rpc("claim_report_cleanup", { p_limit: limit });
  if (error) throw new Error("Report cleanup unavailable.");
  let removed = 0;
  let failed = 0;
  for (const item of (data ?? []) as CleanupObject[]) {
    let deletionFailed = false;
    try { await pdfFileStore.deleteObject(item.object_key); }
    catch { deletionFailed = true; }
    const mutation = deletionFailed
      ? supabaseAdmin.from("report_artifact_cleanup").update({
        lease_token: null, lease_until: null, last_error: "storage_delete_failed",
        next_attempt_at: new Date(Date.now() + Math.min(3600, 30 * 2 ** Math.min(item.attempts, 7)) * 1000).toISOString(),
      })
      : supabaseAdmin.from("report_artifact_cleanup").delete();
    const result = await mutation.eq("object_key", item.object_key).eq("lease_token", item.lease_token);
    if (result.error) throw new Error("Report cleanup state could not be saved.");
    if (deletionFailed) failed++; else removed++;
  }
  const pending = await supabaseAdmin.rpc("report_cleanup_pending");
  if (pending.error) throw new Error("Report cleanup state unavailable.");
  return { removed, failed, pending: pending.data === true };
}
