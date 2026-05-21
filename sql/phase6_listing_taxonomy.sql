alter type approval_mode add value if not exists 'full_auto_sandbox_only';

alter table public.listing_drafts
  add column if not exists ebay_category_name text,
  add column if not exists ebay_category_path text,
  add column if not exists category_tree_id text,
  add column if not exists category_confidence numeric(4, 2),
  add column if not exists required_item_specifics text[] not null default '{}',
  add column if not exists missing_item_specifics text[] not null default '{}',
  add column if not exists image_validation_status text,
  add column if not exists image_validation_warnings text[] not null default '{}',
  add column if not exists listing_quality_score integer check (listing_quality_score between 0 and 100);

create index if not exists listing_drafts_missing_category_idx
  on public.listing_drafts(user_id, updated_at desc)
  where ebay_category_id is null;

create index if not exists listing_drafts_category_tree_idx
  on public.listing_drafts(user_id, category_tree_id, ebay_category_id);
