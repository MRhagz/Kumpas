-- Module 2 — Document Intake & Extraction
-- Tables: sessions, session_notes, extraction_results, correction_logs
-- Storage bucket: kumpas-documents

-- sessions: durable session store (SDD §5.1)
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  counselor_id uuid,
  status text not null default 'active'
    check (status in ('active', 'completed', 'expired', 'cancelled')),
  approved_profile jsonb,
  created_at timestamptz not null default now(),
  last_activity timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

-- session_notes: counselor qualitative input
create table if not exists public.session_notes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  counselor_id uuid,
  career_goal text not null default '',
  interests text not null default '',
  financial text not null default '',
  concerns text not null default '',
  impression text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- extraction_results: structured academic data from Gemini per document
create table if not exists public.extraction_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  counselor_id uuid,
  document_type text not null check (document_type in ('ncae', 'form_137', 'nat')),
  raw_gemini_response jsonb,
  structured_data jsonb not null,
  redacted_image_path text,
  created_at timestamptz not null default now()
);

-- correction_logs: field-level counselor corrections (SDD §5.2)
-- no student-identifiable data is stored here
create table if not exists public.correction_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  field_name text not null,
  extracted_value text,
  corrected_value text not null,
  correction_timestamp timestamptz not null default now()
);

-- foreign-key indexes (postgres best practice — supports cascading delete + joins)
create index if not exists idx_session_notes_session_id on public.session_notes (session_id);
create index if not exists idx_extraction_results_session_id on public.extraction_results (session_id);
create index if not exists idx_correction_logs_session_id on public.correction_logs (session_id);

-- RLS enabled; policies ready for Module 5 auth
alter table public.sessions enable row level security;
alter table public.session_notes enable row level security;
alter table public.extraction_results enable row level security;
alter table public.correction_logs enable row level security;

create policy "sessions_own" on public.sessions
  for all to authenticated using (counselor_id = (select auth.uid()));

create policy "session_notes_own" on public.session_notes
  for all to authenticated using (counselor_id = (select auth.uid()));

create policy "extraction_results_own" on public.extraction_results
  for all to authenticated using (counselor_id = (select auth.uid()));

create policy "correction_logs_own" on public.correction_logs
  for all to authenticated
  using (session_id in (select id from public.sessions where counselor_id = (select auth.uid())));

-- storage bucket for redacted document images
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kumpas-documents',
  'kumpas-documents',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

create policy "service_role_documents" on storage.objects
  for all to service_role
  using (bucket_id = 'kumpas-documents')
  with check (bucket_id = 'kumpas-documents');
