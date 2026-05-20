# Seller Automation Agent

AI-powered, policy-compliant seller automation dashboard built with Next.js 14, TypeScript, Tailwind CSS, Supabase, and modular service layers for suppliers, product analysis, AI listing drafts, images, Telegram, and marketplace APIs.

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

Phase 2 adds eBay sandbox OAuth, encrypted token storage, token refresh, seller policy sync, inventory location setup, and sandbox publish flow for manually approved drafts. Phase 3 adds Telegram AI chatbot control with account-linked chat setup, conversational AI intent parsing, deterministic fallback parsing, agent task logging, and dashboard connection controls. Production eBay publishing remains disabled.

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
- `EBAY_RUNAME`
- `EBAY_REDIRECT_URI`
- `EBAY_ENVIRONMENT=sandbox`
- `EBAY_MARKETPLACE_ID=EBAY_US`
- `EBAY_SANDBOX_FALLBACK_CATEGORY_ID` optional sandbox-only fallback category

Use `EBAY_RUNAME` for the eBay Developer portal Redirect URL name/RuName. Keep `EBAY_REDIRECT_URI` as the real application callback URL, for example `https://your-ngrok-url/market/callback`.

Vercel production values for this deployment:

```bash
APP_URL=https://seller-automation-agent.vercel.app
EBAY_REDIRECT_URI=https://seller-automation-agent.vercel.app/market/callback
EBAY_RUNAME=Sarkhan_Mahabba-SarkhanM-Dropsh-noiaygbc
EBAY_ENVIRONMENT=sandbox
EBAY_MARKETPLACE_ID=EBAY_US
EBAY_CLIENT_ID=your_sandbox_client_id
EBAY_CLIENT_SECRET=your_sandbox_client_secret
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
ENCRYPTION_SECRET=your_long_encryption_secret
```

Required for Telegram:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`

Required for AI providers:

- `AI_PROVIDER=groq`, `openai`, or `anthropic`
- `GROQ_API_KEY`, `OPENAI_API_KEY`, or `ANTHROPIC_API_KEY`

`AI_PROVIDER=groq` is the recommended local default for the Telegram conversational brain. If no AI key is configured, the Telegram bot keeps working with deterministic fallback parsing and writes a warning to `automation_logs`.

## Supabase Setup

1. Create a Supabase project.
2. Run `sql/schema.sql` in the SQL editor.
3. Run `sql/policies.sql`.
4. Optionally adapt and run `sql/seed.sql`.
5. Create a public or signed Supabase Storage bucket named `product-images`.

Every user-owned table has RLS enabled so users can only access rows where `auth.uid() = user_id`.

## Local Auth Setup

The app uses Supabase Auth email/password.

1. In Supabase, open `Authentication > Providers`.
2. Enable `Email`.
3. Enable email/password signups if you want users to create accounts from `/login`.
4. For local development, add these auth URLs in Supabase:

```text
Site URL: http://localhost:3000
Redirect URL: http://localhost:3000/auth/callback
```

5. Add Supabase env vars to `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

6. Start the app and open `/login`.

```bash
npm run dev
```

The login page supports login and signup on the same screen. If email confirmation is enabled in Supabase, signup will ask the user to confirm their email before signing in. Dashboard pages redirect unauthenticated users to `/login`, and protected dashboard API routes return `401` JSON when there is no active session.

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
- `lib/ebay/programs.ts`
- `lib/ebay/locations.ts`
- `lib/ebay/account.ts`
- `lib/ebay/publish.ts`

Start OAuth at:

```text
/api/ebay/oauth
```

Configure eBay sandbox OAuth in the eBay Developer portal before connecting:

1. Open your sandbox application keys.
2. Set these URLs:

```text
Privacy policy URL: https://seller-automation-agent.vercel.app/privacy
Auth accepted URL: https://seller-automation-agent.vercel.app/market/callback
Auth declined URL: https://seller-automation-agent.vercel.app/market/declined
```

3. Copy the Redirect URL name/RuName generated by eBay into `EBAY_RUNAME`.
4. Set `EBAY_REDIRECT_URI` to the same real app callback URL for local documentation and fallback behavior.

The app sends `EBAY_RUNAME` as eBay's OAuth `redirect_uri` parameter when configured. If `EBAY_RUNAME` is missing, it falls back to `EBAY_REDIRECT_URI`, but eBay sandbox OAuth may reject that URL with `invalid_request`.

Current deployment RuName:

```text
Sarkhan_Mahabba-SarkhanM-Dropsh-noiaygbc
```

Run the Phase 4 migration before testing OAuth persistence:

```sql
-- sql/phase4_ebay_oauth_states.sql
```

OAuth state is saved in `public.ebay_oauth_states`, so the callback can persist tokens even if the browser cookie/session context changes during the eBay redirect.

### OAuth Diagnostics

Use these routes to confirm whether the app or eBay Developer RuName binding is the problem:

```text
https://seller-automation-agent.vercel.app/api/ebay/oauth/callback-test
```

This must return:

```json
{ "ok": true, "message": "callback route reachable" }
```

Then test OAuth diagnostics:

1. Open `https://seller-automation-agent.vercel.app/api/ebay/oauth/debug`.
2. Confirm `hasRuname=true`, `redirectUriMode=runame`, and `redirectUriActuallyUsed=Sarkhan_Mahabba-SarkhanM-Dropsh-noiaygbc`.
3. Sign in to the dashboard and open `https://seller-automation-agent.vercel.app/dashboard/settings/ebay-debug`.
4. Click `Copy OAuth URL`, or call `https://seller-automation-agent.vercel.app/api/ebay/oauth/manual-url`.
5. Copy `authorizeUrl`.
6. Open `authorizeUrl` in a fresh private/incognito browser.
7. Complete eBay sandbox login and consent.
8. If Vercel logs show `/market/callback` or `[ebay_oauth_callback_hit]`, the app callback is being reached.
9. If eBay shows "Authorization successfully completed. It's now safe to close the browser window/tab" and no callback log appears, eBay did not call the callback URL. The issue is eBay Developer RuName callback binding, not the app.
10. In that case, create a new eBay Redirect URL/RuName, set Auth accepted URL exactly to `https://seller-automation-agent.vercel.app/market/callback`, and update `EBAY_RUNAME` in Vercel.

Sandbox publishing flow:

1. Connect eBay from `/dashboard/settings`.
2. Confirm a `public.ebay_accounts` row exists for your Supabase user with `status='connected'`, encrypted access/refresh tokens, and `marketplace='EBAY_US'`.
3. Confirm `Business policies` is `Active`, or click `Enable seller policies` to request `SELLING_POLICY_MANAGEMENT` opt-in.
4. Click `Sync seller policies` to load payment, return, and fulfillment policies from the sandbox Account API.
5. Click `Setup location` to create/check the stable `default-sandbox-location` warehouse inventory location.
6. Ensure a listing draft has a valid `ebay_category_id`, item specifics, price, quantity, and at least one image URL.
7. Click `Publish sandbox` from `/dashboard/listings`.

The settings page can check eBay Account API programs through:

```text
GET /api/ebay/programs
POST /api/ebay/programs/opt-in-selling-policies
```

`GET /api/ebay/programs` calls `get_opted_in_programs` and reports whether `SELLING_POLICY_MANAGEMENT` is active. `POST /api/ebay/programs/opt-in-selling-policies` calls `program/opt_in` with `{ "programType": "SELLING_POLICY_MANAGEMENT" }`. eBay can take time to activate program opt-in, so wait and check again before retrying policy sync.

The publish flow calls:

- `createOrReplaceInventoryItem`
- `createOffer`
- `publishOffer`

All eBay API failures are saved to `listing_drafts.error_message`, `listing_drafts.ebay_error_code`, `listing_drafts.ebay_error_json`, and `automation_logs`.

Production publishing is intentionally blocked. Keep `EBAY_ENVIRONMENT=sandbox`; setting it to `production` will return a clear error.

### Common eBay Sandbox Errors

- `invalid_request`: `EBAY_RUNAME` is missing or does not match the eBay Developer portal RuName.
- ngrok offline: the Auth accepted URL must be reachable by eBay; update `EBAY_REDIRECT_URI` and the portal URL when the tunnel changes.
- Callback not saving tokens: run `sql/phase4_ebay_oauth_states.sql` and confirm `SUPABASE_SERVICE_ROLE_KEY` and `ENCRYPTION_SECRET` exist in Vercel.
- `20403 User is not eligible for Business Policy`: the sandbox seller is not opted into `SELLING_POLICY_MANAGEMENT`. Click `Enable seller policies`, wait for eBay to activate the program if needed, then click `Sync seller policies` again.
- No policies found: create payment, return, and fulfillment policies in the sandbox seller account, then sync again.
- Missing inventory location: click `Setup location` in Settings.
- Invalid category/aspects: revise the draft category ID and item specifics JSON.
- Image error: use publicly accessible HTTP/HTTPS image URLs; HTTPS is recommended.

### End-to-End Sandbox Test

1. Redeploy Vercel after setting env vars and running migrations.
2. Open `https://seller-automation-agent.vercel.app/dashboard/settings`.
3. Click `Connect sandbox`, log in with an eBay sandbox test user, and consent.
4. Confirm Settings shows `Sandbox connected`.
5. In Supabase, verify `public.ebay_accounts` has one connected row for the user.
6. Confirm `Business policies` is `Active`, or click `Enable seller policies` and wait if eBay needs time to activate `SELLING_POLICY_MANAGEMENT`.
7. Click `Sync seller policies`.
8. Click `Setup location`.
9. Create or revise a listing draft until readiness is green, then approve it.
10. Click `Publish sandbox`.

Manual sandbox setup may still be required inside eBay: sandbox seller accounts often need `SELLING_POLICY_MANAGEMENT` enabled and payment, return, and fulfillment policies created before policy sync can succeed. After opt-in, the normal path is `Sync seller policies` → `Setup location` → approve draft → `Publish sandbox`.

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

### Enable the AI Telegram Brain

The Telegram webhook uses the AI provider abstraction in `lib/ai`. When a provider key exists, the bot asks the AI model to convert each natural message into strict JSON and validates it with Zod before execution. If the model returns invalid JSON or no key exists, the webhook falls back to deterministic parsing and logs a warning.

Groq setup:

```bash
AI_PROVIDER=groq
GROQ_API_KEY=your_groq_key
```

OpenAI setup:

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=your_openai_key
```

Anthropic setup:

```bash
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_anthropic_key
```

The `/dashboard/telegram` page shows `AI active` when Groq, OpenAI, or Anthropic is configured. It shows `Fallback` when no key is present, plus the latest parsed intent JSON for recent Telegram commands.

### Supported Natural-Language Intents

- `SHOW_STATUS`
- `SHOW_DAILY_REPORT`
- `PAUSE_AUTOMATION`
- `RESUME_AUTOMATION`
- `CHANGE_DAILY_LIMIT`
- `CHANGE_MIN_MARGIN`
- `CHANGE_MIN_PROFIT`
- `CHANGE_RISK_TOLERANCE`
- `ENABLE_TEST_MODE`
- `FIND_PRODUCTS`
- `ANALYZE_PRODUCTS`
- `CREATE_LISTING_DRAFTS`
- `PUBLISH_SAFE_DRAFTS_SANDBOX`
- `SHOW_FAILED_TASKS`
- `UPDATE_BLOCKED_CATEGORY`
- `UPDATE_BLOCKED_BRAND`
- `CHANGE_APPROVAL_MODE`
- `EXPLAIN_SYSTEM`
- `ASK_CLARIFICATION`

Example messages:

- `qaqa automationu aktiv et`
- `botu işə sal`
- `bugün 10 dənə yaxşı məhsul tap, riskli şeyləri list eləmə`
- `minimum margin 5 faiz olsun`
- `minimum profit 0.5 dollar olsun`
- `risk tolerance 40 olsun`
- `test mode aktiv et`
- `mənə bu gün nə etdiyini report ver`
- `list olunmayan məhsullar niyə reject oldu?`
- `safe olan 5 draftı sandbox ebaydə publish elə`
- `electronics kateqoriyasını blokla`
- `sabahdan gündəlik limit 15 olsun`
- `indi sistemi dayandır, mən sonra davam etdirəcəm`
- `hansı supplier daha yaxşıdır?`
- `nə problem var sistemdə?`
- `mənə insan kimi izah et`

Every connected Telegram request is saved to `agent_tasks` with the parsed intent JSON. Bot responses, parser fallback warnings, and errors are saved to `automation_logs`. Sandbox draft publishing stays sandbox-only through the Phase 2 eBay service; requests for production/live eBay publishing are refused with a safety explanation.

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
