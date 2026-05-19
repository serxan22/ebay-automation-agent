create extension if not exists "pgcrypto";

create table if not exists public.ebay_oauth_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  state text unique not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);

alter table public.ebay_oauth_states enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ebay_oauth_states'
      and policyname = 'ebay_oauth_states_all_own'
  ) then
    create policy "ebay_oauth_states_all_own"
    on public.ebay_oauth_states for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;
end $$;

create index if not exists ebay_oauth_states_state_idx
  on public.ebay_oauth_states(state);

create index if not exists ebay_oauth_states_user_created_idx
  on public.ebay_oauth_states(user_id, created_at desc);

alter table public.listing_drafts
  add column if not exists published_at timestamptz;
