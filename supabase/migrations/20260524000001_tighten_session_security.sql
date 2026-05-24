-- Wipe pre-auth dev data: pre-existing sessions have no counselor_id and cannot satisfy the new NOT NULL constraint.
truncate table sessions cascade;

-- counselor_id must be present on every row tied to a counselor — invite-only model (SRS §3.3, SDD §2.6).
alter table sessions alter column counselor_id set not null;
alter table session_notes alter column counselor_id set not null;
alter table extraction_results alter column counselor_id set not null;

-- All writes go through service-role from authenticated route handlers; the anon role must not touch these tables.
revoke all on sessions from anon;
revoke all on session_notes from anon;
revoke all on extraction_results from anon;
revoke all on correction_logs from anon;
