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

Phase 2 adds eBay sandbox OAuth, encrypted token storage, token refresh, seller policy sync, inventory location setup, and sandbox publish flow for manually approved drafts. Phase 3 adds Telegram AI chatbot control with account-linked chat setup, natural-language intent parsing, agent task logging, and dashboard connection controls. Production eBay publishing remains disabled.

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

The eBay OAuth and Inventory API integration is in:

- `lib/ebay/oauth.ts`
- `lib/ebay/client.ts`
- `lib/ebay/inventory.ts`
- `lib/ebay/offers.ts`
- `lib/ebay/policies.ts`
- `lib/ebay/locations.ts`
- `lib/ebay/account.ts`
- `lib/ebay/publish.ts`

Start OAuth at:

```text
/api/ebay/oauth
```

Sandbox publishing flow:

1. Connect eBay from `/dashboard/settings`.
2. Run `sql/phase2_ebay_sandbox.sql` if your Supabase database was created before Phase 2.
3. Click `Sync seller policies` to load payment, return, and fulfillment policies from the sandbox Account API.
4. Click `Setup location` to create/check a warehouse inventory location.
5. Ensure a listing draft has a valid `ebay_category_id`, item specifics, price, quantity, and at least one image URL.
6. Click `Publish sandbox` from `/dashboard/listings`.

The publish flow calls:

- `createOrReplaceInventoryItem`
- `createOffer`
- `publishOffer`

All eBay API failures are saved to `listing_drafts.error_message`, `listing_drafts.ebay_error_code`, `listing_drafts.ebay_error_json`, and `automation_logs`.

Production is intentionally blocked in Phase 2. Keep `EBAY_ENVIRONMENT=sandbox`; setting it to `production` will return a clear error.

## Telegram Bot

The Telegram webhook is:

```text
/api/telegram/webhook
```

### Create a Telegram Bot

1. Open Telegram and message `@BotFather`.
2. Send `/newbot`.
3. Choose a bot name and username.
4. Copy the bot token BotFather gives you.
5. Add it to `.env.local`:

```bash
TELEGRAM_BOT_TOKEN=123456:your_token
TELEGRAM_WEBHOOK_SECRET=choose-a-long-random-secret
APP_URL=https://your-public-url.example.com
```

For local testing, use a public HTTPS tunnel such as ngrok or Cloudflare Tunnel and set `APP_URL` to that tunnel URL.

### Set the Webhook

From the dashboard, open `/dashboard/telegram` and click `Set webhook`.

Or set it manually:

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://YOUR_PUBLIC_URL/api/telegram/webhook","secret_token":"YOUR_TELEGRAM_WEBHOOK_SECRET","allowed_updates":["message"]}'
```

Telegram sends the secret in the `X-Telegram-Bot-Api-Secret-Token` header; the webhook rejects mismatches.

### Connect a Chat

1. Sign in to the dashboard.
2. Open `/dashboard/telegram`.
3. Click `Generate link code`.
4. Send `/start CODE` to your Telegram bot.
5. The webhook binds that chat ID to your Supabase user in `telegram_connections`.

### Supported Natural-Language Intents

- `SHOW_STATUS`
- `SHOW_DAILY_REPORT`
- `PAUSE_AUTOMATION`
- `RESUME_AUTOMATION`
- `CHANGE_DAILY_LIMIT`
- `CHANGE_MIN_MARGIN`
- `FIND_PRODUCTS`
- `ANALYZE_PRODUCTS`
- `CREATE_LISTING_DRAFTS`
- `PUBLISH_SAFE_DRAFTS_SANDBOX`
- `SHOW_FAILED_TASKS`
- `UPDATE_BLOCKED_CATEGORY`
- `UPDATE_BLOCKED_BRAND`
- `CHANGE_APPROVAL_MODE`

Example messages:

- `Bugün 10 məhsul tap və analiz et`
- `Minimum profit 20 faiz olsun`
- `Automationu dayandır`
- `Bugünkü reportu göstər`
- `Riskli məhsulları list etmə`
- `5 safe draftı sandbox eBay-də publish et`

Every connected Telegram request is saved to `agent_tasks`. Bot responses and errors are saved to `automation_logs`. Sandbox draft publishing stays sandbox-only through the Phase 2 eBay service.

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
