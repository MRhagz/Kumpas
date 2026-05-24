import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const counselors = [
  { email: "counselor1@kumpas.dev", password: "test123", full_name: "Counselor One" },
  { email: "counselor2@kumpas.dev", password: "test123", full_name: "Counselor Two" },
  { email: "counselor3@kumpas.dev", password: "test123", full_name: "Counselor Three" },
];

for (const c of counselors) {
  const { data, error } = await admin.auth.admin.createUser({
    email: c.email,
    password: c.password,
    email_confirm: true,
    user_metadata: { full_name: c.full_name },
  });

  if (error) {
    if (error.message.includes("already")) {
      console.log(`skip  ${c.email} (already exists)`);
    } else {
      console.error(`fail  ${c.email}: ${error.message}`);
    }
    continue;
  }

  console.log(`ok    ${c.email} (${data.user?.id})`);
}
