alter table public.users_profile enable row level security;
alter table public.automation_settings enable row level security;
alter table public.suppliers enable row level security;
alter table public.supplier_products enable row level security;
alter table public.product_analysis enable row level security;
alter table public.listing_drafts enable row level security;
alter table public.ebay_accounts enable row level security;
alter table public.ebay_oauth_states enable row level security;
alter table public.ebay_listings enable row level security;
alter table public.orders enable row level security;
alter table public.agent_tasks enable row level security;
alter table public.automation_logs enable row level security;
alter table public.reports enable row level security;
alter table public.telegram_connections enable row level security;
alter table public.telegram_connection_tokens enable row level security;

create policy "users_profile_select_own"
on public.users_profile for select
using (auth.uid() = user_id);

create policy "users_profile_insert_own"
on public.users_profile for insert
with check (auth.uid() = user_id);

create policy "users_profile_update_own"
on public.users_profile for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "automation_settings_select_own"
on public.automation_settings for select
using (auth.uid() = user_id);

create policy "automation_settings_insert_own"
on public.automation_settings for insert
with check (auth.uid() = user_id);

create policy "automation_settings_update_own"
on public.automation_settings for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "suppliers_all_own"
on public.suppliers for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "supplier_products_all_own"
on public.supplier_products for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "product_analysis_all_own"
on public.product_analysis for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "listing_drafts_all_own"
on public.listing_drafts for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "ebay_accounts_all_own"
on public.ebay_accounts for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "ebay_oauth_states_all_own"
on public.ebay_oauth_states for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "ebay_listings_all_own"
on public.ebay_listings for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "orders_all_own"
on public.orders for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "agent_tasks_all_own"
on public.agent_tasks for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "automation_logs_all_own"
on public.automation_logs for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "reports_all_own"
on public.reports for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "telegram_connections_all_own"
on public.telegram_connections for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "telegram_connection_tokens_all_own"
on public.telegram_connection_tokens for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
