alter table public.telegram_connections
  add column if not exists preferred_language text not null default 'en',
  add column if not exists last_message_at timestamptz;

create table if not exists public.telegram_connection_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  telegram_chat_id text,
  telegram_username text,
  created_at timestamptz not null default now()
);

alter table public.telegram_connection_tokens enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'telegram_connection_tokens'
      and policyname = 'telegram_connection_tokens_all_own'
  ) then
    create policy "telegram_connection_tokens_all_own"
    on public.telegram_connection_tokens for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;
end $$;

create index if not exists telegram_connection_tokens_user_idx
  on public.telegram_connection_tokens(user_id, expires_at desc);
