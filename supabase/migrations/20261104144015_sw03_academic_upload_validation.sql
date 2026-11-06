-- Do not choose a winner or delete another counselor's existing records.
do $$
begin
  if exists (
    select 1 from public.extraction_results
    group by session_id, document_type having count(*) > 1
  ) then
    raise exception 'SW-03: duplicate academic records exist. Have the owning counselor resolve them before applying this migration.';
  end if;
end $$;

create unique index extraction_results_one_per_type
  on public.extraction_results (session_id, document_type);

-- A lease prevents concurrent replacements from extracting or overwriting one another.
-- The prior structured values and path stay intact until successful extraction.
alter table public.extraction_results
  add column upload_token uuid,
  add column upload_expires_at timestamptz;

update storage.buckets set file_size_limit = 10000000 where id = 'kumpas-documents';
