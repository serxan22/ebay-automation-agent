alter table public.listing_drafts
  add column if not exists ebay_offer_id text,
  add column if not exists ebay_item_id text,
  add column if not exists ebay_sku text,
  add column if not exists ebay_error_code text,
  add column if not exists ebay_error_json jsonb not null default '{}',
  add column if not exists publish_attempts integer not null default 0 check (publish_attempts >= 0),
  add column if not exists last_publish_attempt_at timestamptz;

alter table public.ebay_accounts
  add column if not exists refresh_token_expires_at timestamptz,
  add column if not exists oauth_scopes text[] not null default '{}',
  add column if not exists last_token_refresh_at timestamptz,
  add column if not exists payment_policy_name text,
  add column if not exists return_policy_name text,
  add column if not exists fulfillment_policy_name text,
  add column if not exists inventory_location_name text,
  add column if not exists inventory_location_status text,
  add column if not exists last_policy_sync_at timestamptz,
  add column if not exists last_location_sync_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ebay_accounts_user_id_marketplace_key'
  ) then
    alter table public.ebay_accounts
      add constraint ebay_accounts_user_id_marketplace_key unique (user_id, marketplace);
  end if;
end $$;

create index if not exists listing_drafts_user_publish_idx
  on public.listing_drafts(user_id, last_publish_attempt_at desc);

create index if not exists ebay_accounts_user_marketplace_idx
  on public.ebay_accounts(user_id, marketplace);
