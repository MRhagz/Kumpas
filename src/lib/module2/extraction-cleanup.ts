import "server-only";
import { supabaseAdmin } from "@/lib/supabase";

interface CleanupObject { id: string; object_path: string; lease_token: string; attempts: number }

// New extraction uses memory only. This drains durable legacy objects independently
// of session status, including objects left after a killed cleanup invocation.
export async function drainExtractionCleanup(sessionId: string | null = null, limit = 50) {
  const { data, error } = await supabaseAdmin.rpc("claim_extraction_cleanup", { p_limit: limit, p_session_id: sessionId });
  if (error) throw new Error("Artifact cleanup unavailable");
  let removed = 0;
  let failed = 0;
  for (const item of (data ?? []) as CleanupObject[]) {
    let deletionFailed = false;
    try {
      const result = await supabaseAdmin.storage.from("kumpas-documents").remove([item.object_path]);
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
  return { removed, failed };
}
