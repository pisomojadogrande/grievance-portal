# Stripe Subscriptions Feature

## Status

- **Steps 0–8 (test mode):** COMPLETE and verified working in production
- **Step 9 (live mode):** COMPLETE — built, deployed pending human action

---

## Product Design

- **Registered Complainant** — 3 complaints/month, $3/month test / $0.30/month live
- **Pro Complainant** — unlimited complaints/month, $8/month test / $0.80/month live
- When allowance exhausted: user pays standard per-complaint fee
- Identity: email is the subscriber key (no login required)
- `/subscribe` page is separate from the complaint filing flow

---

## What Was Built (Steps 0–8)

### Database
- `subscriptions` table: id, customer_email, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, status, mode (test/live), current_period_start, current_period_end, created_at
- `payments` table: gained `mode` column (test/live), backfilled to 'test' for existing rows
- `script/migrate-tables.ts`: safe migration (no data loss) — adds `mode` to payments, creates subscriptions table
- `script/create-tables.ts`: updated to include both new columns for fresh installs

### Backend (`server/`)
- `storage.ts`: createSubscription, getSubscriptionByEmail (active only), getSubscriptionByStripeId, updateSubscriptionByStripeId, countComplaintsInPeriod
- `init.ts`: loads `stripe/price-registered-complainant` and `stripe/price-pro-complainant` from SSM
- `routes.ts`: 4 new routes — GET /api/subscriptions/status, POST /api/subscriptions/create-checkout-session, POST /api/subscriptions/use-complaint, POST /api/subscriptions/customer-portal
- `webhookHandlers.ts`: checkout.session.completed handles subscription mode; customer.subscription.updated, customer.subscription.deleted, invoice.payment_failed
- `aws/ssm.ts`: **pagination bug fixed** — GetParametersByPathCommand now follows NextToken (was silently dropping params beyond the first 10)

### Frontend (`client/src/`)
- `pages/Subscribe.tsx`: tier selection cards, email input, eagerly fetches clientSecret on Subscribe click, passes as `options={{ clientSecret }}` to EmbeddedCheckoutProvider
- `pages/SubscriptionConfirmation.tsx`: welcome page with "Manage Subscription" → Stripe Customer Portal
- `pages/Payment.tsx`: fetches subscription status on load; hides $5/$0.50 options when subscriber has allowance; shows exhausted notice otherwise
- `pages/FileComplaint.tsx`: checks subscription status on email blur; shows remaining allowance, updates fee notice and button label
- `pages/Home.tsx`: Subscribe button added
- `App.tsx`: routes for `/subscribe` and `/subscription/confirmation`

### SSM Parameters (test mode, in production)
- `/grievance-portal/stripe/price-registered-complainant` — `price_1TAb...` ($3/month)
- `/grievance-portal/stripe/price-pro-complainant` — `price_1TAb...` ($8/month)
- `/grievance-portal/stripe/webhook-secret` — real `whsec_...` (not the placeholder)

---

## Gotchas Encountered

**DSQL: `ALTER TABLE ADD COLUMN` with constraints not supported**
Must add column without constraints, then `UPDATE ... SET col = default WHERE col IS NULL`.

**Stripe API 2025-11-17.clover: `current_period_start`/`current_period_end` moved**
These fields are now on `subscription.items.data[0]`, not the subscription root. The `as any` cast was masking the undefined, causing `new Date(NaN)` → "Invalid time value" on DB insert.

**EmbeddedCheckoutProvider: stale closure with `fetchClientSecret`**
The provider calls `fetchClientSecret` once at mount and caches it. If React state (tier/email) is stale in the closure, the wrong session is created. Fix: fetch the client secret eagerly in the click handler using local variables, then pass as `options={{ clientSecret }}` directly.

**SSM pagination**
`GetParametersByPathCommand` returns max 10 results per page. With 12+ parameters, the new price IDs were silently dropped. Fixed by following `NextToken` in a do/while loop.

**Lambda cold start required for new SSM params**
The `initialized` flag and `cachedParams` are module-level — SSM is only loaded once per container lifetime. After adding new SSM parameters, force a cold start:
```bash
aws lambda update-function-configuration \
  --function-name grievance-portal \
  --environment "Variables={NODE_ENV=production,CACHE_BUST=$(date +%s)}" \
  --profile <profile>
```

---

## Step 9 — Live Mode Subscriptions (IN PROGRESS)

Prices at 10% of test amounts, matching the pattern used for one-time payments:
- **Registered Complainant** — $0.30/month (live)
- **Pro Complainant** — $0.80/month (live)

### Step 9a — Stripe Live Dashboard Setup (manual)

Use Stripe MCP or Stripe dashboard to create in **live** mode:
1. Product: **Registered Complainant Membership** → recurring price $0.30/month → note `price_...` ID
2. Product: **Pro Complainant Membership** → recurring price $0.80/month → note `price_...` ID

Store in SSM:
```bash
aws ssm put-parameter --name "/grievance-portal/stripe/live-price-registered-complainant" \
  --value "price_live_YOUR_ID" --type String --profile <profile>
aws ssm put-parameter --name "/grievance-portal/stripe/live-price-pro-complainant" \
  --value "price_live_YOUR_ID" --type String --profile <profile>
```

### Step 9b — Backend

**`server/init.ts`** — add:
```typescript
process.env.STRIPE_LIVE_PRICE_REGISTERED_COMPLAINANT = params['stripe/live-price-registered-complainant'];
process.env.STRIPE_LIVE_PRICE_PRO_COMPLAINANT = params['stripe/live-price-pro-complainant'];
```

**`server/routes.ts`** — add `POST /api/subscriptions/create-live-checkout-session`:
- Uses `getLiveStripeClient()` and live price IDs
- Same structure as test endpoint
- `return_url` → `/subscription/confirmation?session_id={CHECKOUT_SESSION_ID}`
- `metadata: { email, tier }` (mode is inferred from `cs_live_` prefix in webhook handler)

**`server/webhookHandlers.ts`** — no changes needed. The `checkout.session.completed` handler already detects live vs test via `session.id.startsWith('cs_live_')` and writes the correct `mode` value.

### Step 9c — Frontend

**`client/src/pages/Subscribe.tsx`** — add live section below test checkout:
- Test option is primary/default (same as Payment.tsx pattern)
- Live option is secondary, clearly labeled "Real Payment — $0.30 or $0.80/month"
- On submit: calls `/api/subscriptions/create-live-checkout-session`, uses live Stripe loader (`/api/stripe/live-config`)
- Both sections share the same tier selection and email input
- Separate `liveClientSecret` state so test and live don't interfere

### Step 9d — Config

`.env.example`:
```
STRIPE_LIVE_PRICE_REGISTERED_COMPLAINANT=price_live_...
STRIPE_LIVE_PRICE_PRO_COMPLAINANT=price_live_...
```

`test-lambda-local.cjs`:
```javascript
process.env.STRIPE_LIVE_PRICE_REGISTERED_COMPLAINANT = 'price_live_mock_registered';
process.env.STRIPE_LIVE_PRICE_PRO_COMPLAINANT = 'price_live_mock_pro';
```

### Step 9e — Deploy
```bash
AWS_PROFILE=<profile> CUSTOM_DOMAIN=<domain> npm run deploy:api && npm run deploy:frontend
```
Then force cold start to pick up new SSM params (see Gotchas above).

---

## Step 9 — What Was Built

### Backend
- `server/init.ts`: loads `stripe/live-price-registered-complainant` and `stripe/live-price-pro-complainant` from SSM
- `server/routes.ts`: added `POST /api/subscriptions/create-live-checkout-session` using `getLiveStripeClient()` and live price IDs

### Frontend
- `client/src/pages/Subscribe.tsx`: live payment option added as secondary section below test checkout. Test is primary (outlined prominent button), live is secondary (outline variant, below a divider labeled "Real Payment"). Separate `liveClientSecret` state so test and live don't interfere. Live option uses `getLiveStripe()` loader pointing at `/api/stripe/live-config`.

### Config
- `.env.example`: added `STRIPE_LIVE_PRICE_REGISTERED_COMPLAINANT` and `STRIPE_LIVE_PRICE_PRO_COMPLAINANT` with SSM path documentation
- `test-lambda-local.cjs`: added mock live price ID env vars

### Live Stripe Products (created via Stripe MCP)
- Registered Complainant: `price_live_xxxxxxxxxxxxxxxxxxxxxxxx` ($0.30/month, `prod_xxxxxxxxxxxx`)
- Pro Complainant: `price_live_yyyyyyyyyyyyyyyyyyyyyyyy` ($0.80/month, `prod_yyyyyyyyyyyy`)

SSM parameters stored at:
- `/grievance-portal/stripe/live-price-registered-complainant`
- `/grievance-portal/stripe/live-price-pro-complainant`
