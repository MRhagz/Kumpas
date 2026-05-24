-- Module 5 - Session orchestration progress tracking

alter table public.sessions
  add column if not exists module_status jsonb not null default
    jsonb_build_object(
      'intake', 'not_started',
      'profile', 'not_started',
      'analysis', 'not_started',
      'report', 'not_started'
    ),
  add column if not exists report_status text not null default 'not_started'
    check (report_status in ('not_started', 'generating', 'ready', 'downloaded', 'failed')),
  add column if not exists completed_at timestamptz;
