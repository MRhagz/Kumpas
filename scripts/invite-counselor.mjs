import { createClient } from "@supabase/supabase-js";

// Run manually for one school-approved roster entry. Never commit roster contents.
const email = process.argv[2];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!email || !url || !serviceKey) {
  throw new Error("Usage: node --env-file=.env.local scripts/invite-counselor.mjs <approved-email>");
}
if (!url.startsWith("https://") && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(url)) {
  throw new Error("Supabase must use HTTPS outside local tests.");
}
const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
if (error || !data.user) throw new Error("Invitation failed; check the approved roster and Auth dashboard.");
const { error: roleError } = await admin.auth.admin.updateUserById(data.user.id, {
  app_metadata: { role: "counselor", counselor_activated: false },
});
if (roleError) throw new Error("Invitation sent but authorization failed. Account remains denied; repair in Auth dashboard.");
console.log("Invitation sent. The counselor must activate it before entering the workflow.");
