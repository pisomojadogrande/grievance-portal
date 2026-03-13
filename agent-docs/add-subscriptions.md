# Plan: Stripe Subscriptions Feature

## Context
The grievance portal currently supports one-time complaint payments ($5 test / $0.50 live). This plan adds a subscription tier system so users can pay monthly for a complaint allowance instead of per-complaint. Primary goal is learning Stripe Subscriptions, Customer Portal, and Webhooks.

**Chosen product design:**
- **Registered Complainant** — 3 complaints/month, $3/month (test mode sandbox)
- **Pro Complainant** — unlimited complaints/month, $8/month (test mode sandbox)
- When basic allowance is exhausted: user pays standard per-complaint fee
- Subscribe flow: dedicated `/subscribe` page (separate from complaint filing)
- Identity: email is the subscriber key (no login required)
- Stripe features in scope: recurring billing, Customer Portal, Webhooks

---

## Step 0 — Stripe Dashboard Setup (manual — human runs these)

1. In Stripe **test** dashboard, create two Products with monthly recurring Prices:
   - **Registered Complainant Membership** → $3.00/month → note the `price_...` ID
   - **Pro Complainant Membership** → $8.00/month → note the `price_...` ID
2. In Stripe dashboard, enable the **Customer Portal** (Billing → Customer Portal settings) — allow cancellations and plan switching.
3. Store price IDs in SSM:
   ```bash
   aws ssm put-parameter --name "/grievance-portal/stripe/price-registered-complainant" \
     --value "price_YOUR_ID" --type String
   aws ssm put-parameter --name "/grievance-portal/stripe/price-pro-complainant" \
     --value "price_YOUR_ID" --type String
   ```

---

## Step 1 — Database: add subscriptions table

**File:** `shared/schema.ts`

Add a `subscriptions` table:
```typescript
export const subscriptions = pgTable('subscriptions', {
  id: integer('id').primaryKey(),
  customerEmail: text('customer_email').notNull(),
  stripeCustomerId: text('stripe_customer_id').notNull(),
  stripeSubscriptionId: text('stripe_subscription_id').notNull().unique(),
  stripePriceId: text('stripe_price_id').notNull(),
  tier: text('tier', { enum: ['registered_complainant', 'pro_complainant'] }).notNull(),
  status: text('status', { enum: ['active', 'canceled', 'past_due', 'incomplete', 'trialing'] }).notNull(),
  currentPeriodStart: timestamp('current_period_start').notNull(),
  currentPeriodEnd: timestamp('current_period_end').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

**File:** `server/storage.ts`

Add to interface and implementation:
- `createSubscription(sub)` — uses `getNextId('subscriptions')` per DSQL manual ID pattern
- `getSubscriptionByEmail(email)` — returns most recent active subscription for email (order by createdAt desc, take first)
- `getSubscriptionByStripeId(stripeSubscriptionId)`
- `updateSubscriptionByStripeId(stripeSubscriptionId, updates)`
- `countComplaintsInPeriod(email, periodStart)` — counts complaints with status IN ('received', 'processing', 'resolved') created >= periodStart for this email

DSQL note: no auto-increment; use `SELECT COALESCE(MAX(id), 0) + 1 FROM subscriptions` per existing pattern.

---

## Step 2 — Load subscription price IDs in init.ts

**File:** `server/init.ts`

Add to SSM loading block:
```typescript
process.env.STRIPE_PRICE_REGISTERED_COMPLAINANT = params['stripe/price-registered-complainant'];
process.env.STRIPE_PRICE_PRO_COMPLAINANT = params['stripe/price-pro-complainant'];
```

Add to `.env.example` and `test-lambda-local.cjs` (with mock values).

---

## Step 3 — Backend: subscription routes

**File:** `server/routes.ts`

### `GET /api/subscriptions/status?email=...`
Used by the Payment page to check if the complaint's email has an active subscription. Returns:
```json
{ "active": true, "tier": "registered_complainant", "complaintsUsed": 2, "complaintsAllowed": 3, "currentPeriodEnd": "..." }
// or { "active": false }
```
Logic: look up subscription by email, check `status === 'active'`, count complaints in current period via `countComplaintsInPeriod(email, currentPeriodStart)`.

### `POST /api/subscriptions/create-checkout-session`
Body: `{ email, tier: 'registered_complainant' | 'pro_complainant' }`

Creates a Stripe subscription checkout session (embedded mode):
```typescript
const priceId = tier === 'pro_complainant'
  ? process.env.STRIPE_PRICE_PRO_COMPLAINANT
  : process.env.STRIPE_PRICE_REGISTERED_COMPLAINANT;

const session = await stripe.checkout.sessions.create({
  payment_method_types: ['card'],
  line_items: [{ price: priceId, quantity: 1 }],
  mode: 'subscription',
  ui_mode: 'embedded',
  return_url: `${baseUrl}/subscription/confirmation?session_id={CHECKOUT_SESSION_ID}`,
  customer_email: email,
  metadata: { email, tier },
});
```
Returns `{ clientSecret: session.client_secret }`.

### `POST /api/subscriptions/use-complaint`
Body: `{ complaintId, email }`

Allows a subscriber to process a complaint without paying. Validates:
1. Complaint exists, belongs to the given email, has status `pending_payment`
2. Email has active subscription
3. If `registered_complainant`: `complaintsUsed < 3`
4. If `pro_complainant`: always allowed

On success: updates complaint to `received`, calls `generateBureaucraticResponse`, returns `{ success: true }`. Frontend redirects to `/status/:id`.

### `POST /api/subscriptions/customer-portal`
Body: `{ email }`

Looks up subscription by email, gets `stripeCustomerId`, creates a Stripe Billing Portal session:
```typescript
const portalSession = await stripe.billingPortal.sessions.create({
  customer: subscription.stripeCustomerId,
  return_url: `${baseUrl}/`,
});
res.json({ url: portalSession.url });
```

---

## Step 4 — Backend: webhook handlers

**File:** `server/webhookHandlers.ts`

The existing webhook handler already handles `checkout.session.completed` for one-time payments by checking `session.mode`. Extend it to also handle subscription sessions:

**`checkout.session.completed`** (extend existing handler):
```typescript
if (session.mode === 'subscription') {
  const stripeSub = await stripe.subscriptions.retrieve(session.subscription);
  await storage.createSubscription({
    customerEmail: session.metadata.email,
    stripeCustomerId: session.customer,
    stripeSubscriptionId: stripeSub.id,
    stripePriceId: stripeSub.items.data[0].price.id,
    tier: session.metadata.tier,
    status: stripeSub.status,
    currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
    currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
  });
}
```

**New events to handle:**

`customer.subscription.updated` — update status + period dates.

`customer.subscription.deleted` — mark as canceled.

`invoice.payment_failed` — log warning (Stripe will also fire `subscription.updated` → `past_due`).

---

## Step 5 — Frontend: /subscribe page

**New file:** `client/src/pages/Subscribe.tsx`

UX:
1. Two tier cards side by side (stacked on mobile):
   - **Registered Complainant** — $3/month — 3 complaints/month
   - **Pro Complainant** — $8/month — Unlimited complaints/month
2. Clicking a tier reveals email input + "Subscribe" button
3. On submit: call `/api/subscriptions/create-checkout-session`, render `EmbeddedCheckoutProvider` (reuse `makeStripeLoader` and `CheckoutSection` from `Payment.tsx`)
4. On completion: Stripe redirects to `/subscription/confirmation?session_id=...`

Add route `/subscribe` → `<Subscribe />` in the frontend router.
Add "Subscribe" link on `client/src/pages/Home.tsx`.

---

## Step 6 — Frontend: /subscription/confirmation page

**New file:** `client/src/pages/SubscriptionConfirmation.tsx`

- "Welcome to The Complaints Department, [tier title]!"
- Shows tier name and monthly allowance
- "File a Complaint" button → `/file-complaint`
- "Manage Subscription" button → POST `/api/subscriptions/customer-portal` → redirect to Stripe portal URL

No polling needed — webhook handles DB creation asynchronously.

---

## Step 7 — Frontend: Payment page subscription section

**File:** `client/src/pages/Payment.tsx`

On load, fetch `GET /api/subscriptions/status?email={complaint.customerEmail}`.

If **active subscriber with allowance remaining**: show green section at top of card:
```
┌──────────────────────────────────────────┐
│ ✓ Registered Complainant Membership      │
│   2 of 3 complaints used this month      │
│   [File Using Subscription — Free]       │
└──────────────────────────────────────────┘
```
"File Using Subscription" → POST `/api/subscriptions/use-complaint` → redirect to `/status/:id`.

If **allowance exhausted**: show muted notice with reset date, then standard payment options below.

If **no subscription**: page unchanged.

---

## Step 8 — Router, nav, and docs

- Add `/subscribe` and `/subscription/confirmation` routes to frontend router
- Add "Subscribe" nav link on `Home.tsx`
- Update `.env.example` with new SSM param names
- Update `agent-docs/deploy-to-aws-plan.md` with subscription architecture notes
- Mark this doc as COMPLETED after implementation

---

## Critical files

| File | Change |
|------|--------|
| `shared/schema.ts` | Add `subscriptions` table |
| `server/storage.ts` | Add subscription CRUD + `countComplaintsInPeriod` |
| `server/init.ts` | Load price ID SSM params |
| `server/routes.ts` | Add 4 new subscription routes |
| `server/webhookHandlers.ts` | Handle subscription Stripe events |
| `client/src/pages/Subscribe.tsx` | New page |
| `client/src/pages/SubscriptionConfirmation.tsx` | New page |
| `client/src/pages/Payment.tsx` | Add subscriber section |
| `client/src/pages/Home.tsx` | Add Subscribe link |
| `.env.example` + `test-lambda-local.cjs` | Add price ID mocks |

---

## Verification

1. `npm run build` succeeds
2. `node test-lambda-local.cjs` runs without errors
3. Manual test — subscribe flow:
   - Visit `/subscribe`, choose Registered Complainant, enter test email
   - Complete with test card `4242 4242 4242 4242`
   - Redirected to `/subscription/confirmation`
   - Stripe dashboard: subscription appears; DB: subscription row created via webhook
4. Manual test — subscriber complaint:
   - File complaint with subscribed email → Payment page shows green subscriber section
   - Click "File Using Subscription" → status page shows AI response
5. Manual test — allowance exhausted:
   - Use all 3 complaints → Payment page shows exhausted notice + standard payment options
6. Manual test — Customer Portal:
   - Click "Manage Subscription" → Stripe-hosted portal
   - Cancel → webhook fires → DB status updated to canceled
7. Deploy: `AWS_PROFILE=<profile> CUSTOM_DOMAIN=<domain> npm run deploy:api && npm run deploy:frontend`

---

## Step 9 — Live mode subscriptions (deferred — implement after test mode is confirmed working)

Prices are set at 10% of the test-mode amounts to keep real charges minimal, matching the pattern used for one-time payments ($5 test → $0.50 live):

- **Registered Complainant** — $0.30/month (live)
- **Pro Complainant** — $0.80/month (live)

### Step 9a — Stripe Dashboard Setup (manual)

1. In Stripe **live** dashboard, create two Products with monthly recurring Prices:
   - **Registered Complainant Membership (Live)** → $0.30/month → note the `price_...` ID
   - **Pro Complainant Membership (Live)** → $0.80/month → note the `price_...` ID
2. Store live price IDs in SSM:
   ```bash
   aws ssm put-parameter --name "/grievance-portal/stripe/live-price-registered-complainant" \
     --value "price_live_YOUR_ID" --type String
   aws ssm put-parameter --name "/grievance-portal/stripe/live-price-pro-complainant" \
     --value "price_live_YOUR_ID" --type String
   ```

### Step 9b — Backend

**`server/init.ts`** — load two new SSM params:
```typescript
process.env.STRIPE_LIVE_PRICE_REGISTERED_COMPLAINANT = params['stripe/live-price-registered-complainant'];
process.env.STRIPE_LIVE_PRICE_PRO_COMPLAINANT = params['stripe/live-price-pro-complainant'];
```

**`server/routes.ts`** — add `POST /api/subscriptions/create-live-checkout-session`:
- Same structure as the test endpoint but uses `getLiveStripeClient()` and the live price IDs
- `return_url` still points to `/subscription/confirmation?session_id={CHECKOUT_SESSION_ID}`
- `metadata` includes `{ email, tier, mode: 'live' }`

**`server/webhookHandlers.ts`** — the existing `checkout.session.completed` handler already routes by `session.mode === 'subscription'`; no changes needed since live webhook events go through the same handler. Stripe live events have subscription IDs starting with `sub_` (same as test) so no prefix-based routing is needed — the existing idempotency check (`getSubscriptionByStripeId`) prevents double-processing.

### Step 9c — Frontend

**`client/src/pages/Subscribe.tsx`** — add a live section below the test checkout, mirroring how `Payment.tsx` shows both options:
- Label it clearly: **"Real Payment — $0.30 or $0.80/month"**
- Same tier cards; on subscribe calls `/api/subscriptions/create-live-checkout-session`
- Uses `liveStripe` loader (fetches from `/api/stripe/live-config`)

### Step 9d — Config

Add to `.env.example`:
```
STRIPE_LIVE_PRICE_REGISTERED_COMPLAINANT=price_live_...
STRIPE_LIVE_PRICE_PRO_COMPLAINANT=price_live_...
```

Add mock values to `test-lambda-local.cjs`:
```javascript
process.env.STRIPE_LIVE_PRICE_REGISTERED_COMPLAINANT = 'price_live_mock_registered';
process.env.STRIPE_LIVE_PRICE_PRO_COMPLAINANT = 'price_live_mock_pro';
```
