-- Module 2 follow-up: grant DML to anon, authenticated, service_role on the
-- four tables created by 20260523000000_module2_sessions.sql. apply_migration
-- did not auto-grant these (unlike the Supabase dashboard table editor).
-- RLS is still enforced; service_role bypasses it by virtue of its postgres role.

grant select, insert, update, delete on public.sessions to anon, authenticated, service_role;
grant select, insert, update, delete on public.session_notes to anon, authenticated, service_role;
grant select, insert, update, delete on public.extraction_results to anon, authenticated, service_role;
grant select, insert, update, delete on public.correction_logs to anon, authenticated, service_role;
