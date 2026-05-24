-- Module 3 - structured key-signal rows for Module 4 report presentation

alter table public.ranked_recommendations
  add column if not exists key_signal_details jsonb not null default '[]'::jsonb;
