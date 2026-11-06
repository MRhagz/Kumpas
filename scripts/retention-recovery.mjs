import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

// Run only against a quiesced source or isolated restore target. The deletion
// ledger must be stored independently of the backup being restored.
const [operation, file, cutoff] = process.argv.slice(2);
if (!["export", "restore"].includes(operation) || !file) {
  throw new Error("Usage: retention-recovery.mjs export FILE | restore FILE QUIESCED_AT_ISO");
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Recovery service configuration is missing.");
}
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
async function checked(request) {
  const result = await request;
  if (result.error) throw new Error("Retention recovery operation failed; keep access closed.");
  return result.data;
}

if (operation === "export") {
  const capturedAt = new Date().toISOString();
  const tombstones = [];
  for (let offset = 0; ; offset += 500) {
    const rows = await checked(client.from("retention_tombstones").select("session_id,deleted_at")
      .order("session_id").range(offset, offset + 499));
    tombstones.push(...rows);
    if (rows.length < 500) break;
  }
  await writeFile(file, JSON.stringify({ version: 1, capturedAt, tombstones }), { mode: 0o600, flag: "wx" });
  console.info("Deletion ledger exported", { count: tombstones.length });
} else {
  if (process.env.RESTORE_TARGET_ISOLATED !== "true") throw new Error("Restore target must remain isolated from application access.");
  const ledger = JSON.parse(await readFile(file, "utf8"));
  if (ledger.version !== 1 || !Array.isArray(ledger.tombstones)
    || !Number.isFinite(Date.parse(cutoff)) || !Number.isFinite(Date.parse(ledger.capturedAt))
    || Date.parse(ledger.capturedAt) < Date.parse(cutoff)) {
    throw new Error("A deletion ledger captured after source quiescence is required.");
  }
  await checked(client.rpc("reapply_retention_tombstones", { p_tombstones: ledger.tombstones }));
  // Remove payloads before access reopens; failed transactions abort recovery.
  for (;;) {
    const rows = await checked(client.from("sessions").select("id").is("draft_purged_at", null)
      .or(`expires_at.lte.${new Date().toISOString()},status.eq.cancelled`).limit(100));
    if (!rows.length) break;
    for (const row of rows) await checked(client.rpc("purge_session_content", { p_session_id: row.id }));
  }
  await checked(client.rpc("prepare_report_retention"));
  await checked(client.rpc("purge_expired_correction_logs"));
  await checked(client.rpc("queue_legacy_document_cleanup"));
  for (const [claim, table, bucket, key] of [
    ["claim_report_cleanup", "report_artifact_cleanup", "kumpas-reports", "object_key"],
    ["claim_extraction_cleanup", "extraction_artifact_cleanup", "kumpas-documents", "object_path"],
  ]) {
    for (;;) {
      const rows = await checked(client.rpc(claim, { p_limit: 100 }));
      if (!rows.length) break;
      for (const row of rows) {
        await checked(client.storage.from(bucket).remove([row[key]]));
        await checked(client.from(table).delete().eq(key, row[key]).eq("lease_token", row.lease_token));
      }
    }
    const pending = await client.from(table).select(key, { count: "exact", head: true });
    if (pending.error || pending.count !== 0) throw new Error("Deletion retries or leases remain; keep access closed and retry recovery.");
  }
  console.info("Retention replay completed. Verify ownership/storage policies and orphan inventory before reopening access.");
}
