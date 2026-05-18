# eBay Agent System

AI-powered, policy-compliant eBay automation dashboard built with Next.js 14, TypeScript, Tailwind CSS, Supabase, and modular service layers for suppliers, product analysis, AI listing drafts, images, Telegram, and eBay APIs.

## Phase 1 Scope

This implementation builds the foundation only:

- Supabase schema, RLS policies, and safe defaults
- Dashboard pages for overview, suppliers, products, listings, automation, Telegram, reports, and settings
- Supplier CSV import with flexible column mapping
- Product profitability and compliance analysis
- AI listing generator with OpenAI/Groq/Anthropic-compatible provider abstraction and safe fallback
- Image validation and Sharp optimization pipeline
- Manual approval listing draft flow
- Telegram, eBay, and cron skeletons

Production eBay publishing, full Telegram execution, daily automation, supplier API sync, order tracking, and full auto mode belong to later phases.

## Install

```bash
npm install
npm run dev
```

Open `http://localhost:3000/dashboard`.

## Environment

Copy `.env.example` to `.env.local` and fill the values you need:

```bash
cp .env.example .env.local
```

Required for Supabase-backed app data:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Required for encrypted credentials:

- `ENCRYPTION_SECRET`

Required for eBay sandbox:

- `EBAY_CLIENT_ID`
- `EBAY_CLIENT_SECRET`
- `EBAY_REDIRECT_URI`
- `EBAY_ENVIRONMENT=sandbox`
- `EBAY_MARKETPLACE_ID=EBAY_US`

Required for Telegram:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`

Required for AI providers:

- `AI_PROVIDER=openai`, `groq`, or `anthropic`
- `OPENAI_API_KEY`, `GROQ_API_KEY`, or `ANTHROPIC_API_KEY`

## Supabase Setup

1. Create a Supabase project.
2. Run `sql/schema.sql` in the SQL editor.
3. Run `sql/policies.sql`.
4. Optionally adapt and run `sql/seed.sql`.
5. Create a public or signed Supabase Storage bucket named `product-images`.

Every user-owned table has RLS enabled so users can only access rows where `auth.uid() = user_id`.

## Supplier CSV Import

The `/dashboard/suppliers` page includes a CSV importer with editable column mapping.

Supported source fields include:

- `title`
- `description`
- `supplier_sku`
- `brand`
- `category`
- `supplier_price`
- `shipping_cost`
- `stock_quantity`
- `product_url`
- `image_url_1`
- `image_url_2`
- `image_url_3`
- `shipping_days`
- `country`
- `currency`

If Supabase env vars are not configured, the importer returns a preview result instead of writing data.

## Listing Drafts

Phase 1 creates manual-review listing drafts only. The AI listing generator:

- Does not invent brand, warranty, authenticity, licensing, or delivery claims
- Keeps eBay titles under 80 characters
- Avoids supplier mentions and spammy language
- Uses safe fallback output when no AI API key is configured

## eBay Sandbox

The eBay OAuth and Inventory API skeletons are in:

- `lib/ebay/oauth.ts`
- `lib/ebay/client.ts`
- `lib/ebay/inventory.ts`
- `lib/ebay/offers.ts`
- `lib/ebay/policies.ts`

Start OAuth at:

```text
/api/ebay/oauth
```

Phase 2 should persist encrypted tokens into `ebay_accounts`, fetch seller policies, create inventory locations, and publish approved sandbox drafts.

## Telegram Bot

The Telegram webhook skeleton is:

```text
/api/telegram/webhook
```

Set the webhook with Telegram using your deployed app URL and `TELEGRAM_WEBHOOK_SECRET`. The intent parser already recognizes English, Azerbaijani, and Turkish messages, but persistent settings updates and live task execution are Phase 3 work.

## Automation Modes

- `manual`: default; drafts are held for approval
- `trusted_auto`: future mode for high-score products only
- `full_auto`: future mode, still blocked by risk and daily limits

New seller safe mode defaults:

- Daily listing limit: 5
- Manual approval
- High risk threshold
- Restricted categories blocked
- Supplier resale permission required

## Deploy to Vercel

1. Push the repository to GitHub.
2. Import the project in Vercel.
3. Add environment variables from `.env.example`.
4. Deploy.
5. Configure Supabase Auth redirect URLs and Telegram webhook to the Vercel URL.

## Background Workers Later

Vercel Cron is scaffolded at `/api/cron/daily`. For heavier workloads, move agent execution to Railway, Render, Fly.io, Inngest, or Upstash Queue while keeping the orchestrator contract in `lib/agent/orchestrator.ts`.

## Build

```bash
npm run build
```
