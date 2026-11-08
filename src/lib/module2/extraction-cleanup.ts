import "server-only";
import { supabaseAdmin } from "@/lib/supabase";

interface CleanupObject { id: string; object_path: string; bucket_id?: string; lease_token: string; attempts: number }

// Includes expired/abandoned raw uploads and legacy objects, independently of
// session status. The queue exists before any raw upload is authorized.
export async function drainExtractionCleanup(sessionId: string | null = null, limit = 50) {
  const queued = await supabaseAdmin.rpc("queue_temporary_upload_cleanup");
  if (queued.error) throw new Error("Temporary upload inventory unavailable");
  const { data, error } = await supabaseAdmin.rpc("claim_intake_cleanup", { p_limit: limit, p_session_id: sessionId });
  if (error) throw new Error("Artifact cleanup unavailable");
  let removed = 0;
  let failed = 0;
  for (const item of (data ?? []) as CleanupObject[]) {
    let deletionFailed = false;
    try {
      const result = await supabaseAdmin.storage.from(item.bucket_id ?? "kumpas-documents").remove([item.object_path]);
      deletionFailed = !!result.error;
    } catch { deletionFailed = true; }
    const mutation = deletionFailed
      ? supabaseAdmin.from("extraction_artifact_cleanup").update({
        lease_token: null, lease_until: null, last_error: "storage_delete_failed",
        next_attempt_at: new Date(Date.now() + Math.min(3600, 30 * 2 ** Math.min(item.attempts, 7)) * 1000).toISOString(),
      })
      : supabaseAdmin.from("extraction_artifact_cleanup").delete();
    const result = await mutation.eq("id", item.id).eq("lease_token", item.lease_token);
    if (result.error) throw new Error("Artifact cleanup state could not be saved");
    if (deletionFailed) failed++; else removed++;
  }
  const pending = await supabaseAdmin.rpc("extraction_cleanup_pending", { p_session_id: sessionId });
  if (pending.error) throw new Error("Artifact cleanup state unavailable");
  return { removed, failed, pending: pending.data === true };
}
