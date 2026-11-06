import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Correction cleanup configuration is missing.");
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await client.rpc("purge_expired_correction_logs");
if (error) {
  console.error("Correction cleanup failed.");
  process.exitCode = 1;
} else {
  console.info("Correction cleanup completed", { deletedCount: data });
}
