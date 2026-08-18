# Plan: Migrate Grievance Portal to Read Stripe State from Supabase Sync

## Context

The app currently mirrors Stripe subscription state into its own Aurora DSQL `subscriptions` table via webhooks (`customer.subscription.updated`, `customer.subscription.deleted`). This creates drift risk — the app's copy can diverge from the truth.

You've been onboarded to Stripe's **External Postgres** sync feature, which continuously replicates Stripe objects (via CDC) into a Supabase Postgres database (`$SUPABASE_URL`). That DB already has 15 Stripe-synced read-only tables in the `public` schema including `subscriptions`, `customers`, and `accounts`.

**Goal:** Read Stripe-owned state (subscriptions, customer email) directly from the Supabase sync instead of maintaining our own copies. All app-specific data (complaints, payments, departments, admin_users) stays in Aurora DSQL unchanged. The app gets a second database connection (Supabase, read-only) alongside the existing DSQL connection.

---

## What's Already Synced (Relevant Tables)

| Supabase table | Rows now | Key columns | Used for |
|---|---|---|---|
| `public.customers` | 2 | `id`, `email`, `livemode`, `metadata` | Email → customer lookup |
| `public.subscriptions` | 2 | `id`, `customer`, `status`, `items` (JSONB), `livemode`, `metadata` | Active subscription lookup |
| `public.accounts` | **0** | `id`, `charges_enabled`, `payouts_enabled` | Connect account status (blocked — see below) |

All columns are `GENERATED ALWAYS AS` expressions over `_raw_data JSONB` — **read-only**. A `livemode` boolean distinguishes test vs live objects.

**Important:** `payment_intents.metadata` is empty `{}` in the sync — the `complaintId` lives on the checkout *session* metadata, not on the PI. This means complaint↔payment linkage must stay in DSQL. The webhook payload delivers the full session object directly, so `checkout_sessions` is not needed in the sync.

---

## Stripe Tables We Need from Sync

| Table | Status | Notes |
|---|---|---|
| `subscriptions` | ✅ present | Replaces app's DSQL `subscriptions` table |
| `customers` | ✅ present | Needed for email → customer → subscription join |
| `accounts` | ⚠️ 0 rows | Needed for Connect `charges_enabled`/`payouts_enabled` — blocked until sync is working |

No new tables need to be added to the sync for the initial migration.

---

## What Changes

### Eliminated

| What | Replaced by |
|---|---|
| App's DSQL `subscriptions` table | `public.subscriptions` JOIN `public.customers` in Supabase |
| `customer.subscription.updated` webhook handler | Stripe sync keeps `status`, billing fields current automatically |
| `customer.subscription.deleted` webhook handler | Stripe sync sets `status = 'canceled'` automatically |
| `storage.createSubscription()` INSERT in `checkout.session.completed` | Stripe syncs the new subscription within seconds of creation |
| `storage.updateSubscriptionByStripeId()` method | No longer needed |

### Kept (DSQL, unchanged)

| Table | Why |
|---|---|
| `complaints` | Entirely app-specific |
| `admin_users` | Auth, no Stripe equivalent |
| `departments` | App-specific fields; `charges_enabled`/`payouts_enabled` kept for now |
| `payments` | Complaint↔PI linkage; Stripe sync can't provide this (PI metadata is empty) |

### Webhook status after migration

| Webhook | New status | Reason |
|---|---|---|
| `checkout.session.completed` (payment path) | Keep, simplify | Still links complaint→PI, marks `received`, triggers AI. Drop `createPayment` double-write: single INSERT of `(complaint_id, payment_intent_id, mode)`. |
| `checkout.session.completed` (subscription path) | Simplify | Remove `createSubscription` INSERT — Stripe syncs it. Keep only logging / any side-effects. |
| `customer.subscription.updated` | **Delete** | Stripe sync owns this. |
| `customer.subscription.deleted` | **Delete** | Stripe sync owns this. |
| `account.updated` | **Keep for now** | `accounts` sync is empty; remove in follow-up once Connect accounts appear in Supabase. |
| `invoice.payment_failed` | Keep | Logging only, no change. |
| `checkout.session.expired` | Keep | Logging only, no change. |

---

## Implementation Steps

### Step 1 — Add Supabase connection to `server/db.ts`

Add a second pool alongside the existing DSQL pool. Supabase uses standard Postgres SSL — Lambda can connect directly to the pooler URL with no socat needed (socat is a devbox-only workaround for internal network routing):

```typescript
// server/supabaseDb.ts  (new file)
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

let supabaseDb: ReturnType<typeof drizzle> | null = null;

export function getSupabaseDb() {
  if (!supabaseDb) {
    if (!process.env.SUPABASE_URL) throw new Error("SUPABASE_URL not set");
    const pool = new Pool({
      connectionString: process.env.SUPABASE_URL,
      max: 3,
      idleTimeoutMillis: 60000,
    });
    supabaseDb = drizzle(pool);
  }
  return supabaseDb!;
}
```

Add `SUPABASE_URL` to:
- `server/init.ts` — fetch from SSM parameter `/grievance-portal/supabase/url`
- `infrastructure/lib/compute-stack.ts` — add env var + SSM read permission for Lambda

### Step 2 — Remove `subscriptions` table from DSQL schema

In `shared/schema.ts`, delete the `subscriptions` table definition. Update `InsertSubscription` / `Subscription` types accordingly.

### Step 3 — Rewrite subscription methods in `storage.ts`

Remove `createSubscription`, `updateSubscriptionByStripeId`. Rewrite the read methods to query Supabase via raw SQL (Drizzle ORM can't easily model the Stripe sync's generated columns):

**`getSubscriptionByEmail(email, livemode)`:**
```sql
SELECT s.id, s.customer, s.status, s.livemode,
       s.items, s.metadata,
       s._updated_at
FROM public.subscriptions s
JOIN public.customers c
  ON s.customer = c.id
 AND s._account_id = c._account_id
WHERE c.email = $1
  AND s.status = 'active'
  AND s.livemode = $2
ORDER BY s._updated_at DESC
LIMIT 1
```

Tier is extracted from `items.data[0].price.id` in the JSONB result and mapped to `registered_complainant` / `pro_complainant` via a constant price-ID lookup table (the two price IDs are known from the Stripe dashboard).

**`getSubscriptionByStripeId(id)`:**
```sql
SELECT id, customer, status, livemode, items, metadata
FROM public.subscriptions
WHERE id = $1
LIMIT 1
```

**`countComplaintsInPeriod`** — unchanged; queries DSQL `complaints`.

### Step 4 — Simplify `webhookHandlers.ts`

**`checkout.session.completed` — subscription branch (approx lines 29–70):**
Delete the block that calls `storage.getSubscriptionByStripeId()` + `storage.createSubscription()`. Log the event and return. Stripe will sync the new subscription within seconds.

**`checkout.session.completed` — payment branch:**
Remove the two-step `createPayment` + `updatePaymentByComplaintId`. Replace with a single `storage.createPayment({ complaintId, paymentIntentId: session.payment_intent, mode })`. The `updateComplaint` and AI generation calls stay unchanged.

**Delete handlers (lines 105–122):**
Remove the `customer.subscription.updated` and `customer.subscription.deleted` cases entirely.

### Step 5 — Update `storage.ts` payment method

Simplify `createPayment` to just store `(complaint_id, payment_intent_id, mode)` — no `amount` or `status` fields needed since those can be read from Stripe sync's `payment_intents` if ever needed for display. Drop `updatePaymentByComplaintId`.

Update DSQL `payments` schema in `shared/schema.ts` to drop `amount`, `status`, `transactionId` columns (or keep them nullable if you want to avoid a migration).

### Step 6 — Devbox connectivity note

On the devbox, Supabase is reachable only via the socat tunnel (through `dynamic-egress-proxy`). The local test script (`test-lambda-local.cjs`) mocks SSM — add `SUPABASE_URL` to the mock env pointing at `localhost:15432` when running locally, and document starting the socat tunnel before local testing.

Lambda in AWS can connect to Supabase's pooler URL directly (publicly routable).

---

## Future: Remove `account.updated` webhook

Once you confirm `public.accounts` is populated with your Connect accounts, update `getDepartmentByStripeAccountId` to:
1. Fetch `charges_enabled` / `payouts_enabled` from Supabase `public.accounts WHERE id = $stripe_account_id` instead of DSQL `departments`
2. Drop `charges_enabled` / `payouts_enabled` columns from DSQL `departments`
3. Delete the `account.updated` webhook handler

This step is **blocked** until you verify accounts are syncing.

---

## Files to Modify

| File | Change |
|---|---|
| `server/supabaseDb.ts` | **New** — Supabase `pg.Pool` + Drizzle instance |
| `server/init.ts` | Fetch `SUPABASE_URL` from SSM |
| `server/storage.ts` | Rewrite subscription methods to use Supabase; remove `createSubscription`, `updateSubscriptionByStripeId`; simplify `createPayment` |
| `server/webhookHandlers.ts` | Delete `sub.updated` + `sub.deleted` handlers; simplify `checkout.session.completed` |
| `shared/schema.ts` | Remove `subscriptions` table; simplify `payments` table |
| `infrastructure/lib/compute-stack.ts` | Add `SUPABASE_URL` env var + SSM read permission |
| `test-lambda-local.cjs` | Add `SUPABASE_URL` mock pointing at localhost tunnel |

---

## Verification

1. **Build passes:** `npm run build` — no TS errors after removing subscription schema types
2. **Subscription lookup:** Create a test subscription in Stripe → within ~5s, `getSubscriptionByEmail` returns it from Supabase
3. **Webhook removal:** Cancel a subscription in Stripe dashboard → app reads `status: canceled` from Supabase sync with no handler firing
4. **Complaint flow:** Submit a complaint, complete checkout → complaint marked `received`, AI generates, payment row created with PI ID
5. **Admin portal:** Complaints list and department list render correctly
6. **Local dev:** Start socat tunnel, then `node test-lambda-local.cjs` — both DB connections initialize cleanly
