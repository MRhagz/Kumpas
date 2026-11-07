-- Isolate lifecycle deployment from SW-01's invited-counselor login rollout.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
-- Workflow writes use service-role routes; browser writes could undo termination.
revoke insert, update, delete, truncate, references, trigger on public.sessions,
  public.session_notes, public.extraction_results, public.ranked_recommendations from anon, authenticated;
