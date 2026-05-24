-- profiles: 1:1 with auth.users; counselor metadata (SDD §2.6)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  school text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = (select auth.uid()));

grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- auto-create a profile row whenever a new auth user is inserted
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
