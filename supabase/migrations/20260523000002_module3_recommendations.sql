-- Module 3 — Multi-Agent Analysis Output
-- Tables: ranked_recommendations, recommendation_sources

create table if not exists public.ranked_recommendations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  rank integer not null,
  career_path text not null,
  alignment_score double precision not null,
  aptitude_fit double precision not null,
  market_demand double precision not null,
  financial_feasibility double precision not null,
  reasoning_summary text not null,
  key_signals text[] not null default '{}',
  status text not null default 'complete'
    check (status in ('complete', 'degraded', 'incomplete')),
  degraded_reason text,
  incomplete_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.recommendation_sources (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references public.ranked_recommendations(id) on delete cascade,
  title text not null,
  reference text not null,
  acquisition_method text not null,
  ingestion_timestamp timestamptz not null default now(),
  related_signals text[] not null default '{}'
);

create index if not exists idx_ranked_recommendations_session_id
  on public.ranked_recommendations (session_id);

create index if not exists idx_recommendation_sources_recommendation_id
  on public.recommendation_sources (recommendation_id);

-- RLS enabled; service_role bypasses it
alter table public.ranked_recommendations enable row level security;
alter table public.recommendation_sources enable row level security;

-- Grant DML to all roles (same pattern as module 2 grants migration)
grant select, insert, update, delete
  on public.ranked_recommendations
  to anon, authenticated, service_role;

grant select, insert, update, delete
  on public.recommendation_sources
  to anon, authenticated, service_role;
