create extension if not exists "pgcrypto";

create type approval_mode as enum ('manual', 'trusted_auto', 'full_auto');
create type supplier_type as enum ('csv', 'api', 'manual', 'doba', 'wholesale2b', 'inventorysource', 'syncee', 'custom');
create type supplier_status as enum ('active', 'inactive', 'needs_attention');
create type draft_status as enum ('draft', 'approved', 'rejected', 'published', 'failed');
create type task_source as enum ('dashboard', 'telegram', 'cron', 'system');
create type task_status as enum ('queued', 'running', 'completed', 'failed', 'cancelled');
create type log_level as enum ('info', 'warning', 'error', 'success');
create type report_type as enum ('daily', 'weekly', 'product_research', 'listing', 'risk', 'sales');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.users_profile (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  full_name text,
  business_name text,
  default_marketplace text not null default 'EBAY_US',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  daily_listing_limit integer not null default 10 check (daily_listing_limit between 0 and 250),
  min_profit_amount numeric(12, 2) not null default 2,
  min_margin_percentage numeric(5, 2) not null default 20,
  max_shipping_days integer not null default 10 check (max_shipping_days >= 0),
  min_stock_quantity integer not null default 5 check (min_stock_quantity >= 0),
  auto_listing_enabled boolean not null default false,
  approval_mode approval_mode not null default 'manual',
  risk_tolerance integer not null default 40 check (risk_tolerance between 0 and 100),
  default_quantity integer not null default 1 check (default_quantity > 0),
  pricing_buffer_percentage numeric(5, 2) not null default 5,
  promoted_listing_percentage numeric(5, 2) not null default 0,
  allowed_categories text[] not null default '{}',
  blocked_categories text[] not null default array[
    'electronics',
    'supplements',
    'luxury goods',
    'cosmetics',
    'medical',
    'children safety',
    'weapons',
    'adult',
    'copyrighted',
    'fandom'
  ],
  blocked_brands text[] not null default '{}',
  blocked_keywords text[] not null default '{}',
  supplier_priority uuid[] not null default '{}',
  shipping_country_preference text not null default 'US',
  max_price numeric(12, 2),
  min_price numeric(12, 2),
  require_image_quality_score integer not null default 65,
  require_demand_score integer not null default 35,
  new_account_safe_mode boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type supplier_type not null default 'csv',
  base_url text,
  api_key_encrypted text,
  status supplier_status not null default 'active',
  country text,
  default_shipping_days integer not null default 5,
  allows_dropshipping boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supplier_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  supplier_sku text not null,
  title text not null,
  description text,
  brand text,
  category text,
  supplier_price numeric(12, 2) not null check (supplier_price >= 0),
  shipping_cost numeric(12, 2) not null default 0 check (shipping_cost >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  currency text not null default 'USD',
  product_url text,
  image_urls text[] not null default '{}',
  raw_data jsonb not null default '{}',
  shipping_days integer not null default 5 check (shipping_days >= 0),
  country_of_origin text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, supplier_id, supplier_sku)
);

create table if not exists public.product_analysis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  supplier_product_id uuid not null references public.supplier_products(id) on delete cascade,
  profit_score integer not null check (profit_score between 0 and 100),
  risk_score integer not null check (risk_score between 0 and 100),
  demand_score integer not null check (demand_score between 0 and 100),
  competition_score integer not null check (competition_score between 0 and 100),
  image_score integer not null check (image_score between 0 and 100),
  shipping_score integer not null check (shipping_score between 0 and 100),
  final_score integer not null check (final_score between 0 and 100),
  estimated_ebay_fees numeric(12, 2) not null default 0,
  estimated_total_cost numeric(12, 2) not null default 0,
  recommended_ebay_price numeric(12, 2) not null default 0,
  estimated_profit numeric(12, 2) not null default 0,
  margin_percentage numeric(5, 2) not null default 0,
  ai_notes text,
  rejection_reasons text[] not null default '{}',
  approved_for_listing boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.listing_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  supplier_product_id uuid not null references public.supplier_products(id) on delete cascade,
  analysis_id uuid references public.product_analysis(id) on delete set null,
  ebay_title text not null,
  ebay_description text not null,
  ebay_category_id text,
  item_specifics jsonb not null default '{}',
  condition text not null default 'NEW',
  quantity integer not null default 1 check (quantity > 0),
  price numeric(12, 2) not null check (price >= 0),
  optimized_image_urls text[] not null default '{}',
  status draft_status not null default 'draft',
  ai_generated boolean not null default true,
  ebay_offer_id text,
  ebay_item_id text,
  ebay_sku text,
  error_message text,
  ebay_error_code text,
  ebay_error_json jsonb not null default '{}',
  publish_attempts integer not null default 0 check (publish_attempts >= 0),
  last_publish_attempt_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ebay_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ebay_user_id text,
  marketplace text not null default 'EBAY_US',
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  oauth_scopes text[] not null default '{}',
  last_token_refresh_at timestamptz,
  payment_policy_id text,
  payment_policy_name text,
  return_policy_id text,
  return_policy_name text,
  fulfillment_policy_id text,
  fulfillment_policy_name text,
  inventory_location_key text,
  inventory_location_name text,
  inventory_location_status text,
  last_policy_sync_at timestamptz,
  last_location_sync_at timestamptz,
  status text not null default 'disconnected',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, marketplace)
);

create table if not exists public.ebay_oauth_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  state text unique not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);

create table if not exists public.ebay_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_draft_id uuid references public.listing_drafts(id) on delete set null,
  supplier_product_id uuid references public.supplier_products(id) on delete set null,
  ebay_item_id text,
  ebay_offer_id text,
  ebay_sku text not null,
  title text not null,
  price numeric(12, 2) not null,
  quantity integer not null default 1,
  status text not null default 'active',
  published_at timestamptz,
  last_revised_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ebay_order_id text not null,
  ebay_item_id text,
  buyer_username text,
  buyer_country text,
  buyer_address_json jsonb not null default '{}',
  total_price numeric(12, 2) not null default 0,
  profit_estimate numeric(12, 2) not null default 0,
  status text not null default 'new',
  fulfillment_status text not null default 'unfulfilled',
  supplier_order_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source task_source not null default 'dashboard',
  original_message text,
  parsed_intent jsonb not null default '{}',
  task_type text not null,
  status task_status not null default 'queued',
  parameters_json jsonb not null default '{}',
  result_json jsonb not null default '{}',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  level log_level not null default 'info',
  module text not null,
  message text not null,
  metadata_json jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_type report_type not null,
  title text not null,
  content text not null,
  metrics_json jsonb not null default '{}',
  sent_to_telegram boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.telegram_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  telegram_chat_id text not null unique,
  telegram_username text,
  preferred_language text not null default 'en',
  last_message_at timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create index if not exists suppliers_user_idx on public.suppliers(user_id);
create index if not exists supplier_products_user_supplier_idx on public.supplier_products(user_id, supplier_id);
create index if not exists supplier_products_category_idx on public.supplier_products(category);
create index if not exists product_analysis_product_idx on public.product_analysis(supplier_product_id);
create index if not exists listing_drafts_user_status_idx on public.listing_drafts(user_id, status);
create index if not exists listing_drafts_user_publish_idx on public.listing_drafts(user_id, last_publish_attempt_at desc);
create index if not exists ebay_accounts_user_marketplace_idx on public.ebay_accounts(user_id, marketplace);
create index if not exists ebay_oauth_states_state_idx on public.ebay_oauth_states(state);
create index if not exists ebay_oauth_states_user_created_idx on public.ebay_oauth_states(user_id, created_at desc);
create index if not exists agent_tasks_user_status_idx on public.agent_tasks(user_id, status);
create index if not exists automation_logs_user_created_idx on public.automation_logs(user_id, created_at desc);
create index if not exists reports_user_created_idx on public.reports(user_id, created_at desc);
create index if not exists telegram_connection_tokens_user_idx on public.telegram_connection_tokens(user_id, expires_at desc);

create trigger users_profile_updated_at
before update on public.users_profile
for each row execute function public.set_updated_at();

create trigger automation_settings_updated_at
before update on public.automation_settings
for each row execute function public.set_updated_at();

create trigger suppliers_updated_at
before update on public.suppliers
for each row execute function public.set_updated_at();

create trigger supplier_products_updated_at
before update on public.supplier_products
for each row execute function public.set_updated_at();

create trigger product_analysis_updated_at
before update on public.product_analysis
for each row execute function public.set_updated_at();

create trigger listing_drafts_updated_at
before update on public.listing_drafts
for each row execute function public.set_updated_at();

create trigger ebay_accounts_updated_at
before update on public.ebay_accounts
for each row execute function public.set_updated_at();

create trigger ebay_listings_updated_at
before update on public.ebay_listings
for each row execute function public.set_updated_at();

create trigger orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

create trigger agent_tasks_updated_at
before update on public.agent_tasks
for each row execute function public.set_updated_at();

create trigger telegram_connections_updated_at
before update on public.telegram_connections
for each row execute function public.set_updated_at();
