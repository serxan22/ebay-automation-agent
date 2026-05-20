alter table public.automation_settings
  alter column daily_listing_limit set default 10,
  alter column min_profit_amount set default 2,
  alter column min_margin_percentage set default 20,
  alter column max_shipping_days set default 10,
  alter column risk_tolerance set default 40;

update public.automation_settings
set
  daily_listing_limit = coalesce(daily_listing_limit, 10),
  min_profit_amount = coalesce(min_profit_amount, 2),
  min_margin_percentage = coalesce(min_margin_percentage, 20),
  max_shipping_days = coalesce(max_shipping_days, 10),
  risk_tolerance = coalesce(risk_tolerance, 40)
where true;
