# Plan: Migrate Grievance Portal reads to Stripe-synced Supabase databases

## Original prompt (preserved verbatim, per user request)

> We're working on this project.  It's a satirical business that I use to learn and illustrate Stripe integration concepts.
>
> I have access to a private preview feature that's somewhat like what's documented here https://docs.stripe.com/data/database except with the difference being that Stripe will sync its state to a Supabase database that I own.  You can read the contents of the database using the env variable SUPABASE_URL_SBX (for the state in my sandbox).  If you want to connect to that database to see its contents, you will want to be running a socat tunnel, example starting at line 180 of /pay/src/pay-server/lib/stripe_databases/scripts/ext_postgres_lifecycle_test.sh.
>
> We suspect that Stripe users will have a cleaner and less error-prone integration if they can rely on this Stripe-populated database than today's integration, in which everyone must implement his own webhooks and attempt to keep his own database in sync.  This is what the integration is doing right now, populating Stripe updates into its AWS DSQL database.  Our goal here is to change the implementation to use our SUPABASE_URL_SBX database instead.
>
> You already started this plan, at /home/becky/stripe/grievance-portal/agent-docs/stripe-sync-migration-plan.md.  I thought it was not a very good plan, for a few reasons:
> 1. It didn't account for the fact that I have two different databases populated by Stripe: One for my sandbox and one for live-mode.  (The URL I gave you is for sandbox mode)
> 2. The plan didn't preserve my original prompt.
> 3. The plan is proposing to just stop writing the necessary state to my AWS DSQL database.  While that's where I want to get EVENTUALLY, initially I would like to keep writing, but switch all appropriate reads to the Supabase database.  However, I would like us to clearly mark the writing code that would go away if we were to fully switch over.
> 4. To the extent that you can add some unit tests here so that we can verify functionality without deploying, that would be useful.
> 5. It's complaining that the accounts table has zero rows.  It had been looking at my live-mode database, where in fact there were no connected accounts.  However, my sandbox database should have two in there you can look at.  So you shouldn't block on this part.
> 6. I'd like a better explanation of why the Drizzle ORM cannot work with Stripe sync's columns.
> 7. Most importantly, I am just not sure about the plan overall.  So before you go and present me another plan, I want to carefully, one by one, go through each of the webhook handlers in /home/becky/stripe/grievance-portal/server/webhookHandlers.ts.  You're going to discuss each one with me individually: What it's doing today, what we think we should modify it to do instead, and give me a chance to ask questions on each before moving on to the next one.

---

## Context

The portal maintains its own mirror of Stripe state in Aurora DSQL, kept current
by the webhook handlers in `server/webhookHandlers.ts`. Stripe's External Postgres
sync (private preview) now replicates Stripe objects into Supabase databases the
user owns — **one per mode** (sandbox / live). The thesis to demonstrate: relying
on the Stripe-populated database yields a cleaner, less error-prone integration
than hand-rolled webhook mirroring.

Migration is deliberately **two-phase**:

- **Phase 1 (this plan):** switch reads to Supabase. Keep existing DSQL writes,
  each tagged with a marker identifying it as Phase 2 deletion candidate. Keeps
  the migration reversible and enables source-vs-source comparison.
- **Phase 2 (later):** delete marked writes, the DSQL `subscriptions` table, and
  handlers that exist only to feed it.

## Implementation progress

Last updated: 2026-08-20 UTC.

- **Step 0 — complete.** The corrected plan was committed in `2f40e41`; the
  follow-up API-read audit and double-charge analysis were committed in
  `8edfa49`. The checked-in plan matches the working tree, and the credential
  scan found no connection string, credential, or AWS account ID.
- **Step 1 — complete and deployed.** Dependencies are installed, `server/supabaseDb.ts`
  now lazily creates separate sandbox/live pools, and `server/init.ts` maps both
  SSM values into the expected environment variables. The existing Lambda SSM
  policy already covers `/grievance-portal/supabase/*` and now documents that
  fact. `npm run check`, `npm run build`, the infrastructure TypeScript build,
  and all 3 infrastructure tests pass; a direct `SELECT 1` through the socat
  tunnel also verified the sandbox pool and lazy pool reuse. The live connection
  cannot be checked locally because `SUPABASE_URL_LIVE` is not present in this
  environment, but the missing-value guard was verified. The added content
  passed the credential and AWS-account-ID scan. The implementation and this
  progress record are kept together in one Step 1 checkpoint. The first human
  deployment attempt hung after bootstrapping; the
  cause was not established, and the proposed proxy/region workaround was not
  correct. Starting a fresh shell made CDK run normally, but it targeted
  `us-west-2` and created new Parameters, Database, Auth, and Compute stacks
  there; it did not update the existing main stacks in `us-east-1`. Both sync URL
  parameters are confirmed present in `us-east-1`. A subsequent main-region CDK
  diff is correct: Parameters, Database, and Auth have no changes, and Compute
  changes only the Lambda code asset. The human deployed that update successfully;
  CloudFormation is `UPDATE_COMPLETE`, Lambda reports a successful update, and
  the API Gateway `/api/health` check passes. The custom hostname's `/api/health`
  path serves the frontend HTML (the client uses its injected API Gateway URL),
  so it is not the API health-check route. The browser smoke test confirms the
  site loads, but one complaint remains indefinitely at "Bureaucratic Review in
  Progress"; diagnosis is intentionally deferred until cleanup finishes. The
  accidental west-region inventory contains four application stacks, one
  retained Cognito pool, and the accidental CDK bootstrap stack/bucket, with no
  DSQL cluster. The user deleted those stacks, pool, and bucket; read-only checks
  confirm they are gone, with only two empty Lambda log groups left to delete.
  The `complaints-ro` trace for complaint 77 confirms the known Step 3 race:
  `verify-session` set the complaint to `received` at 22:48:20.588Z, the checkout
  webhook arrived at 22:48:21.061Z, saw `received`, and skipped at 22:48:21.069Z.
  No AI/Bedrock attempt occurred; the current row is still `received` with no AI
  response or complexity score. Step 1 itself is deployed and its connection
  work is sound; this smoke test reproduced the pre-existing bug Step 3 is
  designed to remove.
- **Steps 2–8 — not started.**

The plan is the implementation ledger: update this section as work is completed,
verified, committed, deployed by the user, and manually tested.

### The sharpened claim (emerged from the handler walkthrough)

> The sync eliminates webhooks whose job is to **maintain a copy of Stripe's
> state.** It does not eliminate webhooks whose job is to **trigger an action.**

This correctly predicts every outcome in the file: handlers 1/3/4/7 are mirrors →
they disappear; handler 5 is a trigger → it stays; handler 2 is both → it shrinks.
A demo that concedes this boundary is more credible than one that oversells.

### The one systematic cost

**Webhook arrival does NOT imply the synced row has landed.** Stripe's webhook
delivery and its CDC pipeline are independent, and the webhook is typically
*first* (low-latency path). So read-after-write lag lands precisely on reads that
immediately follow a user action — the worst place, because that's when the user
is watching. **Any post-checkout read must treat "row absent" as "not yet," never
as "doesn't exist."**

Corollaries: inline lag measurement is impossible (no `_updated_at` to subtract
from yet), and an inline DSQL-vs-sync mismatch check would be worse than useless —
it would detect *absence* and report it as *disagreement*, producing an alarming
mismatch rate that is entirely lag. **Both move offline.**

---

## Verified facts about the sync (sandbox, `SUPABASE_URL_SBX`)

Connected via socat tunnel: `localhost:15432` →
`aws-0-us-west-2.pooler.supabase.com:5432` via
`dynamic-egress-proxy.service.envoy`, proxyport 10071.

- **29 tables** in `public`. Populated: `checkout_sessions` (110), `charges` (108),
  `payment_intents` (107), `payouts` (24), `transfers`/`application_fees` (11),
  `customers` (11), `invoices` (8), `invoice_payments` (7), `subscriptions` (6→7
  during the session — sync is live), `accounts` (2), `products`/`prices`/`plans`
  (2 each), `billing_portal_configurations` (1).
- **`accounts` has both Connect express accounts** (`acct_1TCR1YGigIi4IgnG`,
  `acct_1TCPZwKETHpgxnht`), `charges_enabled`/`payouts_enabled`/`details_submitted`
  all true. The earlier plan's "0 rows" blocker was the live DB and is void.
- **`checkout_sessions.metadata` is fully synced**, including
  `{"complaintId": "74", "customerEmail": "..."}`. The earlier plan wrongly
  concluded complaint↔payment linkage was unavailable. It is available — via the
  *session*, not the PI (`payment_intents.metadata` is indeed `{}`).
- Each table has a CHECK constraint pinning `_account_id` to the platform account
  (`acct_1SrPBBGRKyOKl0At`), and every row has `livemode = false`. **Mode is
  selected by choosing which database to connect to, not by filtering `livemode`.**
- Billing period lives at `items->'data'->0->>'current_period_start'` / `_end`.
- Price → tier: `price_1TADu0GRKyOKl0AtNXbz8LzJ` ($3/mo Registered),
  `price_1TADwVGRKyOKl0AtwTSGLsxR` ($8/mo Pro). Derive from the
  `STRIPE_PRICE_*` / `STRIPE_LIVE_PRICE_*` SSM params already loaded in
  `server/init.ts` — don't hardcode.
- **`customers.email` is not unique** — verified in the sandbox: two distinct
  addresses each have 2 customer rows, and one of those pairs has 2 *active*
  subscriptions. Lookups by email must resolve the ambiguity deliberately.
- Subscriptions carry `cancel_at_period_end`, `cancel_at`, `canceled_at`,
  `cancellation_details`, `ended_at` — none of which DSQL mirrors.

### ⚠️ Gotcha: `invoices.subscription` is ALWAYS NULL

The column exists, but Stripe moved the field to
`parent.subscription_details.subscription` in newer API versions, and the sync
generates columns as `GENERATED ALWAYS AS (_raw_data ->> 'subscription')`. The
top-level key is gone. **Verified:**

- `JOIN invoices i ON i.subscription = s.id` → **0 rows.** No error, no warning.
- `_raw_data -> 'parent' -> 'subscription_details' ->> 'subscription'` → populated
  on 8 of 9 invoices. The exception is a `draft` invoice whose `parent` is `null`
  entirely, so absence means "not a subscription invoice yet," not an error.

Worst failure shape a database can have: plausible name, valid query, empty result
that reads as "customer has no invoices." Report to the sync team as preview
feedback.

**Two different questions, two different routes — do not conflate them:**

| Question | Route |
|---|---|
| "What's the state of this subscription's *current* bill?" | `subscriptions.latest_invoice → invoices.id` |
| "Show me *all* invoices for this subscription" | the nested `parent` path above |
| anything at all | **never** the `subscription` column |

An earlier draft of this plan said "always navigate `latest_invoice → invoices.id`,"
which is wrong as general guidance. `latest_invoice` points at exactly one row, so
it silently drops history: verified in the sandbox, `sub_1Too15…` has two invoices
(an original and a renewal) and the `latest_invoice` join returns only the newer
one. It is the right route for `getDunningInfo`, which genuinely wants only the
current bill — and the wrong route for anything else.

---

## Audit: every Stripe API call in the codebase

The handler walkthrough covered reads of *our DSQL mirror*. This is the separate
question — reads that go to the **Stripe API** and could go to the synced database
instead. Swept with `rg` over `server/`, `client/`, `script/`. Eleven calls total,
of which only **three are reads**:

| Location | Call | Disposition |
|---|---|---|
| `routes.ts:206` | `checkout.sessions.retrieve` | replaced by the synced read in `confirm-payment` (Step 3) |
| `routes.ts:500` | `accounts.retrieve` | block deleted outright (Step 4) |
| `webhookHandlers.ts:40` | `subscriptions.retrieve` | tagged `SYNC-DEPRECATED`; dies with its branch (Step 6) |

The other eight are `create` calls — `checkout.sessions.create` ×3,
`accountLinks.create` ×2, `accounts.create`, `billingPortal.sessions.create`,
`accounts.createLoginLink` — plus `webhooks.constructEvent`, which is local
signature verification and not an API call at all.

**Those eight stay on the Stripe API permanently, and that bounds the whole
exercise: the sync replaces reads, never actions.** You cannot create a checkout
session, mint an onboarding link, or open a billing portal by reading a database.
This is the same mirror-vs-trigger boundary the handler walkthrough found, seen
from the other side — and worth stating in the demo, because "replace your webhooks
with a database" invites the misreading that Stripe's API stops mattering.

**Replacing an API read with a synced read always adds a lag exposure that was not
there before**, because the Stripe API answers from the truth while the sync answers
from a copy that is behind. Each of the three above was checked for this; see the
timing table in Step 4. Note `webhookHandlers.ts:40` is deliberately *not* repointed
at the sync — inside a webhook the synced row is the least likely thing to have
landed, so the API call stays until the whole branch is deleted.

---

## Why raw SQL, not Drizzle (answering point 6 accurately)

The earlier plan said the ORM "can't work." That's wrong, and the real reasoning
goes in a header comment on the query module:

1. **Writes are genuinely impossible** — every business column is
   `GENERATED ALWAYS AS (...) STORED`; Postgres rejects INSERT/UPDATE. Half an
   ORM's value is unusable. Costs us nothing, since we only read.
2. **The migration tooling is the real hazard, not the query builder.**
   `drizzle-kit` makes the database match your TypeScript. Pointed at these
   tables it would rewrite generated columns into plain ones. The repo has a
   `db:push` script, so this is a live trap.
3. **Strongest point: the data is inside JSONB, where ORMs don't help.** Tier is
   `items->'data'->0->'price'->>'id'`; period is
   `items->'data'->0->>'current_period_start'`. An ORM types the `items` column
   and then hands you `unknown` — you write the JSON path either way, getting the
   ceremony without the payoff.
4. **A typed schema would encode lies.** `invoices.subscription` is a real column
   that is always NULL; generated types would advertise it and autocomplete would
   make the trap *easier* to hit.

**Conclusion:** readable by an ORM, but the value-add is small and the
schema-management half is dangerous. Raw parameterized SQL via `pg.Pool`.

---

## Code markers

- `// SYNC-DEPRECATED:` — a write that mirrors Stripe-owned state into DSQL.
  Superseded by the sync; kept in Phase 1 as safety net / comparison source.
- `// SYNC-DUAL-WRITE-ONLY:` — exists only because Phase 1 keeps both sources
  live (e.g. the reconciliation script). Meaningless once there's one truth.

---

## Implementation

### Step 0 — Land this plan in the repo and commit it

Replace `agent-docs/stripe-sync-migration-plan.md` with this document (the
existing file is the rejected plan and contains three factual errors corrected
above: `accounts` has 0 rows, complaint↔payment linkage is impossible from the
sync, and Drizzle "can't work"). Commit that alone, before any code changes, so
the reasoning is checkpointed independently of the implementation.

Per CLAUDE.md the commit must not contain the Supabase connection string or the
AWS account ID — the plan references only the platform account id
`acct_1SrPBBGRKyOKl0At` and public price/session/account ids, which are Stripe
sandbox identifiers, not credentials. Verify before committing.

### Step 1 — Supabase connection, mode-aware

New `server/supabaseDb.ts`: two lazily-initialized `pg.Pool`s (sandbox, live),
selected by mode, mirroring the existing `getUncachableStripeClient()` /
`getLiveStripeClient()` split in `server/stripeClient.ts`.

```ts
getSyncDb(mode: 'test' | 'live'): Pool
```

Wire up: SSM params (`/grievance-portal/supabase/url-sbx`, `.../url-live`) →
mapping in `server/init.ts` (alongside the existing `params[...]` assignments) →
env vars + SSM read permission in `infrastructure/lib/compute-stack.ts`.

**Live-mode `accounts` is empty today, but the user intends to add live connected
accounts later.** Department/account reads must therefore be mode-aware like
everything else — no sandbox-only shortcuts. The only thing needed when live
Connect accounts exist is flipping `routeDepartment: false` at `routes.ts:163`,
a deliberate switch rather than a limitation.

### Step 2 — Query module

New `server/stripeSync.ts` — all Supabase reads, raw parameterized SQL, with the
four-point Drizzle rationale above as a header comment. Functions:

- `getCheckoutSession(mode, sessionId)` — with `waitForCheckoutSession(...)`
  variant: bounded retry ~300ms × ~3s total, for post-checkout paths only.
- `getPaymentForComplaint(mode, complaintId)` — `checkout_sessions` by
  `metadata->>'complaintId'` joined to `payment_intents`. Returns **today's field
  shape** (`amount`, `status`, `transactionId`, `mode`) so no frontend churn.
- `getActiveSubscriptionByEmail(mode, email)` — join `subscriptions` ↔ `customers`
  on `(customer, _account_id)`, `status = 'active'`. **Duplicate emails: highest
  tier wins** (pro > registered) — a deliberate change from today's accidental
  `ORDER BY createdAt DESC LIMIT 1`. Returns tier (derived from price id), period
  bounds, `cancel_at_period_end`, `cancel_at`, `status`.
- `getSubscriptionForSession(mode, sessionId)` — `checkout_sessions.subscription`
  → `subscriptions`. Used by the confirmation poll; keys off `session_id` so it
  sidesteps duplicate emails entirely.
- `getDunningInfo(mode, subscriptionId)` — `subscriptions.latest_invoice` →
  `invoices.id` for `status`, `attempt_count`, `next_payment_attempt`.
  **Never join on `invoices.subscription`.**
- `getAccount(mode, accountId)` — `charges_enabled`, `payouts_enabled`,
  `details_submitted`.
- `countAbandonedCheckouts(mode)` — `checkout_sessions` where `status='expired'`.

### Step 3 — Fix the $5 flow: exactly one logical path

**This fixes a live bug.** Today two writers race: the
`checkout.session.completed` webhook (records payment, sets `received`, generates
AI) and `POST /api/stripe/verify-session` (`routes.ts:185-236`) which records
payment and sets `received` but deliberately does *not* generate AI. If the
browser wins — and the redirect is instant while the webhook takes ~1s+, so it's
a coin flip — `verify-session` sets `received`, then the webhook sees
`status !== 'pending_payment'` (`webhookHandlers.ts:77`) and `break`s, **skipping
AI generation too.** The complaint sticks at `received` forever and
`Status.tsx:68-72` polls a spinner that can never resolve.

**Hard constraint:** no single API Gateway call may both wait for a synced row and
run Bedrock. API Gateway caps integration time near 30s; Bedrock at 4096 tokens
can consume much of it. **This is why it's two calls** — each has one slow thing,
and the delays can never stack.

**Call 1 — `POST /api/complaints/:id/confirm-payment`** (body: `session_id`)
1. `waitForCheckoutSession(...)` — bounded ~3s.
2. Assert `payment_status = 'paid'` and `metadata->>'complaintId'` matches.
3. Record payment; set complaint → `received`.

No Bedrock. Worst case ~4s.

**Call 2 — `POST /api/complaints/:id/generate`**
1. **Refuse unless status is `received`** — the guard that makes it re-callable.
2. Set `processing` → Bedrock → save → `resolved`; return the response.

No sync query. Worst case is Bedrock's own latency.

**`Status.tsx` resume logic** — one switch on current status. *This table is the
"exactly one logical path"*; every entry point funnels into the same sequence:

| Status found | Action |
|---|---|
| `pending_payment` | call 1, then call 2 |
| `received` | call 2 |
| `processing` | poll until `resolved` |
| `resolved` | render |

Errors from either call return to the browser and are **shown to the user** —
strictly better than today, where webhook failures die in CloudWatch.

#### The subscription path takes the same shape

A complaint can become eligible for a letter two ways: the filer paid $5, or they
spent a membership allowance. **Only the first half differs.** Both converge on the
*same* call 2:

| | Paid $5 | Used membership |
|---|---|---|
| Call 1 | `confirm-payment` — wait for the synced checkout session | `claim-allowance` — wait for the synced subscription, check tier + allowance |
| | → set `received` | → set `received` |
| Call 2 | `generate` | **the same `generate`** |

So `POST /api/subscriptions/use-complaint` (`routes.ts:369-395`) splits: the
lookup/allowance/`received` part becomes call 1, and its `generateBureaucraticResponse`
call at line 388 is deleted in favour of the shared `generate`. Net effect is *less*
code than today, because letter generation currently exists in two places (this
route and the webhook) and ends up in one.

**Why the split is mandatory here, not cosmetic.** `use-complaint` today does the
subscription lookup *and* Bedrock in a single request. Repointing the lookup at the
sync adds a bounded wait, which would put a database wait and Bedrock in one API
Gateway call — the stacking that must never happen. Splitting is the only way to
migrate this read at all.

🐛 **And it closes a money bug.** Line 379-380 returns `403 No active subscription`
when the lookup finds nothing. Against the sync, "not found" during the lag window
is indistinguishable from "never existed," so a member who *just* subscribed gets
refused and falls through to the $5 path — **paying twice.** The trigger is one
click, not a corner case: `SubscriptionConfirmation.tsx:105` puts a "File a
Complaint" button directly on the post-subscribe confirmation page. This is the
sharpest illustration in the codebase of why lag must read as "not yet" and never
as "no."

- **`verify-session` loses its write path entirely** (`routes.ts:211-219`
  removed, not tagged). This is the bug fix.
- **Abandoned tab:** if the user closes it after call 1, the complaint waits at
  `received` until someone loads `/status/:id`. Truly one path, zero extra
  machinery. Accepted risk: a customer who never returns never gets their letter.
  Explicitly rejected: webhook backstop (second path) and admin sweep.
- **Result: the $5 path needs no webhook at all** — payment confirmation is a read
  from Stripe's database. The strongest demonstration in the codebase.

### Step 4 — Repoint the remaining reads

| Read | New source |
|---|---|
| `GET /api/complaints/:id/payment` (`routes.ts:174-178`) | `getPaymentForComplaint`. **Post-checkout path** (`Status.tsx:86-93` fires it as soon as status leaves `pending_payment`) → needs the bounded wait. |
| `/api/subscriptions/status` | `getActiveSubscriptionByEmail` + `getDunningInfo` |
| `/api/subscriptions/use-complaint` | `getActiveSubscriptionByEmail` **with the bounded wait** — split into `claim-allowance` + shared `generate`, see Step 3 |
| `/api/subscriptions/customer-portal` | `getActiveSubscriptionByEmail` (needs `customer` id) |
| `routes.ts:45` Connect routing gate | `getAccount(...).charges_enabled` |
| `routes.ts:554` login vs onboarding link | `getAccount(...)` |
| `GET /api/departments/:slug` | `getAccount(...)` — **delete the reconciliation block at `routes.ts:495-509` entirely** |

**Which reads need the bounded wait, and why it's not "all the subscription ones."**
The test is not *what* the read is but *how soon after the user acted* it can fire.

| Read | Soonest it can fire after the user's action | Wait? |
|---|---|---|
| `confirm-payment` | milliseconds (Stripe redirects instantly) | **yes** |
| `GET /:id/payment` | milliseconds (`Status.tsx:86-93` fires as soon as status leaves `pending_payment`) | **yes** |
| `claim-allowance` | ~1 second (one click from the confirmation page) | **yes** |
| `/subscriptions/status` | minutes — user navigates there deliberately | no |
| `/subscriptions/customer-portal` | minutes — same | no |
| department / account reads | seconds, but a stale `false` is merely cosmetic and self-corrects on refresh | no (user's call) |

An earlier draft asserted all three subscription routes were "minutes-to-weeks
later, so no retry." That was right for two of them and wrong for `use-complaint`,
which is reachable one click after subscribing.

**Deleting `routes.ts:495-509`** removes a Stripe API call *and* a DB write from an
ordinary page-view path. That block's own comment ("in case we missed a webhook")
is the best evidence in the repo for the thesis: someone hand-rolled a lazy
reconciliation loop specifically because the mirror couldn't be trusted. Under the
sync there is no copy to be stale. **Per user: no bounded wait here** — a few
indeterminate seconds between Stripe-side onboarding and the app reflecting it is
fine on an already-multi-minute flow. Only cosmetic consequence: during that
window the page still offers "get a fresh onboarding link," which harmlessly
bounces to Stripe and self-corrects on refresh.

### Step 5 — New features the sync makes nearly free

Each is net-new capability with zero new plumbing — the strongest form of the
argument, since hand-rolled mirroring's real failure mode isn't broken code but a
schema that quietly captures less than the truth.

1. **Subscription confirmation actually verifies.**
   `SubscriptionConfirmation.tsx` currently verifies *nothing*: it parses
   `session_id` (line 21) and never uses it, reads tier/email from
   `sessionStorage`, and renders the green "Membership Confirmed" check
   unconditionally. Add a waiting affordance polling
   `getSubscriptionForSession(mode, session_id)` until the row lands, then reveal
   confirmation. **On timeout: reassure without blocking** — "Your payment
   succeeded; your membership is being registered" + manual refresh. Never a
   false success, never a stranded spinner.

   **Also gate the "File a Complaint" button** (line 105) on that poll having
   succeeded — belt-and-braces for the double-charge bug in Step 3. The split into
   `claim-allowance` is the actual fix, since it covers someone who reaches
   `/file-complaint` by any other route; this just stops the fast-clicker from
   reaching the bad case at all. Keep it disabled during the timeout/reassurance
   state too — that state means "we still can't see your membership," which is
   exactly when the button must not be live.
2. **Pending cancellation.** `/api/subscriptions/status` returns
   `cancelAtPeriodEnd` / `cancelAt`; UI shows "set to end on <date>". Today the
   app is blind to this for up to a month — and with
   `subscription_cancel.enabled = true` in the portal config, it's the live path
   customers take.
3. **`past_due` explained.** Today a failed renewal moves the subscription to
   `past_due`, the `status = 'active'` filter drops it, and the subscriber
   **silently loses their allowance** with no explanation. Report `past_due` +
   `next_payment_attempt`; badge says "payment failed, retrying <date>" instead
   of vanishing. Read-only — no email infrastructure.
4. **`details_submitted`.** The onboarding page's `pending` state conflates
   "hasn't finished onboarding" with "submitted, awaiting Stripe review" — two
   situations needing different copy, only one of which should offer a fresh
   onboarding link.
5. **Abandoned-cart metric.** Admin dashboard gains "complaints abandoned at
   checkout": synced `checkout_sessions` where `status = 'expired'` joined against
   DSQL `complaints` still in `pending_payment`. Unanswerable today without
   scraping logs. Natural home beside `getDailyComplaintStats()`. Note this is a
   **cross-database join** done in application code — the shape most real
   integrations need.

### Step 6 — Tag the surviving DSQL writes

| Location | Marker |
|---|---|
| `createSubscription()` + the now-pointless `subscriptions.retrieve()` in the subscription branch | `SYNC-DEPRECATED` |
| `createPayment()` + `updatePaymentByComplaintId()` in the payment branch | `SYNC-DEPRECATED` |
| `customer.subscription.updated` body (whole) | `SYNC-DEPRECATED` |
| `customer.subscription.deleted` body (whole) | `SYNC-DEPRECATED` |
| `account.updated` body (whole) | `SYNC-DEPRECATED` |
| `complaints.status` flip + AI trigger | **unmarked** — workflow, not mirroring; survives Phase 2 |
| `invoice.payment_failed` | **unmarked** + explanatory comment: it's a *trigger*, the one handler the sync strengthens the case for. Prevents a future reader deleting webhooks wholesale from assuming it was an oversight. |
| `checkout.session.expired` | **unmarked** + comment: Phase 2 can remove it for a *different* reason — the sync makes its logging redundant, not replaced. |

Also: derive tier from price id rather than a stored `tier` column (required
anyway — the synced table has no `tier` concept). Do **not** backfill tier/price
into the DSQL mirror; it's slated for deletion.

Keep the `default:` case logging unhandled event types (line 155-156) — per user,
don't bother unsubscribing event types from the Stripe endpoint config in Phase 2;
just log anything arriving without a handler.

### Step 7 — Offline reconciliation script

`script/sync-reconcile.ts`, tagged `SYNC-DUAL-WRITE-ONLY`. Compares DSQL rows
against synced rows across all history, **correctly interpreting absence as lag
rather than disagreement**, and reports observed lag distribution
(`_updated_at` vs DSQL `created_at`). Far stronger evidence than per-request spot
checks, and run deliberately before committing to Phase 2. No inline
instrumentation in the handlers.

### Step 8 — Unit tests (user request #4)

No test framework exists (`package.json` has no vitest/jest). Add **vitest** with
a `test` script. Test with fixtures captured from the real sandbox rows recorded
above — **no deploy, no network, no live DB**:

- tier derivation from price id, both modes
- **highest-tier-wins** resolution for duplicate emails (fixture built from the
  real sandbox pair that has two active subscriptions on one email)
- session → subscription resolution for the confirmation poll
- payment-shape mapper returns today's exact field shape
- bounded-wait helper: succeeds on late arrival, gives up at the bound
  (fake timers)
- `Status.tsx` resume table: each status → correct action
- dunning read navigates `latest_invoice`, and a regression test asserting the
  `invoices.subscription` join is *not* used
- **the double-charge regression:** `claim-allowance` against a sync fixture where
  the subscription row is absent on the first read and present on the second must
  succeed, *not* return 403. This is the test that would have caught the money bug.
- `claim-allowance` and `confirm-payment` both leave the complaint at `received`,
  so the shared `generate` behaves identically whichever produced it
- `past_due` / `cancel_at_period_end` status mapping

Also add `SUPABASE_URL_SBX` (pointing at `localhost:15432`) to
`test-lambda-local.cjs`, and document starting the socat tunnel first. Lambda in
AWS reaches the Supabase pooler directly.

---

## Files

| File | Change |
|---|---|
| `server/supabaseDb.ts` | **new** — mode-aware `pg.Pool` pair |
| `server/stripeSync.ts` | **new** — all Supabase reads, raw SQL, Drizzle rationale in header |
| `server/storage.ts` | subscription/payment read methods delegate to `stripeSync`; writes stay, tagged |
| `server/webhookHandlers.ts` | tag mirror writes; payment branch stops driving the flow and stops generating AI |
| `server/routes.ts` | new `confirm-payment` / `claim-allowance` / `generate` endpoints; strip `verify-session` writes; drop the duplicate `generateBureaucraticResponse` at line 388; delete `495-509`; repoint reads |
| `server/init.ts` | map the two Supabase SSM params |
| `client/src/pages/Status.tsx` | resume-table logic, error surfacing |
| `client/src/pages/SubscriptionConfirmation.tsx` | real verification + waiting affordance; gate the "File a Complaint" button on the poll |
| `client/src/pages/DepartmentOnboardingComplete.tsx` | `details_submitted` states |
| `infrastructure/lib/compute-stack.ts` | env vars + SSM read permission |
| `script/sync-reconcile.ts` | **new** — offline comparison |
| `test-lambda-local.cjs` | `SUPABASE_URL_SBX` mock → tunnel |
| `agent-docs/stripe-sync-migration-plan.md` | replace with this plan |

Per CLAUDE.md: **never deploy.** Provide `cdk deploy` / SSM put-parameter commands
for the human to run. Never commit AWS account IDs or the Supabase URL.

---

## Verification

1. `npm run build` — compiles clean.
2. `npm test` — all unit tests pass. **No deploy needed** (user request #4).
3. Start the socat tunnel, then `node test-lambda-local.cjs` — both DB
   connections initialize.
4. `tsx script/sync-reconcile.ts` — DSQL vs sync agree; review the lag
   distribution before contemplating Phase 2.
5. Manual, after the human deploys:
   - **$5 flow:** submit → pay → single path runs → letter appears. Kill the
     webhook endpoint entirely and confirm it *still works* — the headline result.
   - Reload `/status/:id` mid-flow at each status; confirm correct resume.
   - **Subscribe:** confirmation page shows the waiting state then confirms.
   - **The double-charge case, deliberately raced:** subscribe, then click "File a
     Complaint" the instant the button becomes live and file immediately. The
     complaint must consume the membership allowance and must *never* present a $5
     checkout. Worth doing more than once — it's a timing bug, so a single pass
     proving nothing is the trap.
   - Cancel via portal → "set to end on <date>" appears while access continues.
   - Register a department, complete onboarding → correct `details_submitted`
     copy, no reconciliation API call in logs.
   - Admin dashboard shows the abandoned-checkout count.

---
---

# Appendix: handler-by-handler discussion log

Preserved because the reasoning matters more than the conclusions — and because
two of these handlers turned out to contain live bugs.

### 1. `checkout.session.completed` — subscription branch (lines 32–62)

**Today:** reads `email`/`tier` from metadata → sniffs live vs test from the
`cs_live_` prefix → **extra `subscriptions.retrieve()` API call** just to get
`status` and item period bounds → idempotency-checks via
`getSubscriptionByStripeId()` → `createSubscription()` writes 9 denormalized
Stripe fields to DSQL.

**Key discovery:** `SubscriptionConfirmation.tsx` **verifies nothing today** —
parses `session_id` (line 21), never uses it; renders success unconditionally. We
aren't preserving a working check, we're adding the first one.

**Why no `customer.subscription.created` webhook is needed:** the browser cannot
observe a webhook (server→server), so "wait for the event" degrades to polling our
server. And the row landing in Supabase is strictly *later* than the event
arriving — so polling Supabase directly is simpler and never slower. **Under the
sync model the row's existence IS the notification.** No subscription to
configure, no handler to write, no delivery-retry semantics. The trade is
push → poll.

**Decided:** keep `return_url` (rejected `redirect_on_completion: 'never'` +
`onComplete` — viable but larger blast radius, and the confirmation page needs a
waiting state regardless since it's URL-reachable). Poll keys off `session_id`,
not email. Timeout reassures without blocking. Writes tagged `SYNC-DEPRECATED`.

### 2. `checkout.session.completed` — non-subscription / payment branch (lines 64–101)

The `session.mode !== 'subscription'` path — the $5 complaint flow.

**Ownership split — this handler is a mix, unlike Handler 1:**

| Written | Owner | From sync? |
|---|---|---|
| `payments.amount` | Stripe | `checkout_sessions.amount_total` |
| `payments.status` | Stripe | `payment_intents.status` |
| `payments.transactionId` | Stripe | `checkout_sessions.payment_intent` |
| `payments.mode` | Stripe | implied by which DB |
| `payments.complaintId` | App | **yes** — `checkout_sessions.metadata` |
| `complaints.status` | App | no — our workflow |
| AI generation | App | no |

Verified end-to-end: `cs_test_a1hv0GX…` carries `{"complaintId": "74"}` →
`pi_3U1suSGRKyOKl0At2CTbZGUk` → `amount 500`, `status succeeded`,
`application_fee_amount 100`, `transfer_data.destination acct_1TCPZwKETHpgxnht`.
The whole `payments` row is recoverable, **plus Connect detail DSQL never
captured** (documented as a follow-on demo; the read returns today's shape).

**The `received` flip and AI trigger stay, unmarked.** Stripe knows payment
succeeded; only the app knows that means "generate a bureaucratic response."
**The sync removes your mirror, not your business logic.**

🐛 **Live bug + the single-path redesign → see Step 3 above.**

### 3. `customer.subscription.updated` (lines 105–115)

Three lines of substance. **The purest case in the file: 100% mirror, 0% business
logic.** Phase 2 deletes it outright.

**Two defects the sync fixes for free:**
1. *Silently drops updates for unknown subscriptions* —
   `updateSubscriptionByStripeId` returns `undefined` on no match and the handler
   ignores it. No row, no log.
2. *Never updates `tier`/`stripePriceId`* — only `status` and two timestamps. A
   plan change leaves `tier` wrong permanently; a Pro subscriber could be metered
   as Registered.

**Reachability of #2, checked:** portal config `bpc_1TC2BrGRKyOKl0At…` has
`subscription_update.enabled = false`, so customers can't self-switch. **Latent,
not live** — but reachable today via a Dashboard plan change, and live the moment
portal plan-switching is enabled. Under the sync,
`items->data->0->price->id` is always current, so tier is *derived* rather than
*remembered* and the bug cannot exist. Documented in `agent-docs/` as a demo win:
a real defect in real code, not a hypothetical.

### 4. `customer.subscription.deleted` (lines 117–122)

Two lines; same verdict as Handler 3.

**The genuinely different part — cancellation isn't binary.** This fires only when
a subscription is *fully gone*. DSQL has one signal (`status`), so it's `active`
or `canceled`. But the normal path is `cancel_at_period_end = true`, and the portal
has `subscription_cancel.enabled = true`, so **that's the live path customers
take.** For up to a month the app shows them plainly `active` with no idea a
cancellation is pending. Not wrong — they correctly keep their allowance — but
blind to a fact Stripe knows.

**A different flavor of argument than 1–3.** Those were "the sync removes code."
This is "the sync gives you fields you didn't think to mirror" — arguably
stronger, since hand-rolled mirroring's real failure mode isn't broken code but a
schema that quietly captures less than the truth. → Step 5.2.

### 5. `invoice.payment_failed` (lines 124–128)

**Today:** `console.warn`. Nothing to migrate.

**The gap it masks:** → Step 5.3.

**⚠️ THE THESIS LIMIT.** This is fundamentally a *notification*: the correct
response is to email the customer. **No user is sitting in a browser to poll on
their behalf, and a database Stripe writes to cannot wake your code up.** If this
handler ever grows the behavior it should have, it *needs* the webhook; the sync
would force a cron scanning for `past_due` — more moving parts, not fewer. This is
where the sharpened claim in Context comes from.

**Decided:** leave in place, **no `SYNC-DEPRECATED` tag**, add a comment recording
why — it mirrors nothing and is the one handler the sync strengthens the case
*for*. No failed invoices exist in the sandbox (8 rows, all `paid`/`draft`), so
exercising it needs a test clock or a failing card; unit-test against fixtures.

### 6. `checkout.session.expired` (lines 130–137)

**Today:** logs. No writes. The complaint stays `pending_payment` forever — live
example `cs_test_a10FZ6iGv4S7EqW4Z1fWwbCMD…`, `{"complaintId": "76"}`, a
permanent orphan.

**That's correct behavior.** It's an abandoned cart, and
`createEmbeddedCheckoutSession` (`routes.ts:32-34`) *depends* on it — it refuses to
create a session unless status is `pending_payment`. **Expiring the complaint
would break payment retries.**

By the mirror-vs-trigger test it's neither: pure observability, which the sync does
strictly better (`status = 'expired'` is queryable across all history; a log line
vanishes at CloudWatch retention). → Step 5.5.

### 7. `account.updated` (lines 139–153)

Pure mirror of `charges_enabled` / `payouts_enabled` onto the department row.

**Best evidence in the repo for the thesis** — `routes.ts:495-509`, whose own
comment reads *"reconcile by checking Stripe directly in case we missed a
webhook."* Someone hit this handler being unreliable and hand-rolled a lazy
reconciliation loop: on every department page load, if the mirror says false, call
`accounts.retrieve()` and write the truth back. A Stripe API call plus a write on
a page-view path, existing solely because the copy might be stale. Under the sync
it deletes. → Step 4.

Four consumers of `chargesEnabled`: `routes.ts:45` (Connect routing gate),
`routes.ts:495-509` (deleted), `routes.ts:554` (login vs onboarding link),
`DepartmentOnboardingComplete.tsx:41` / `DepartmentAdmin.tsx:147` (UI).

**Mode:** live `accounts` is empty today, but the user intends live connected
accounts eventually — so these reads are mode-aware, no sandbox-only shortcuts.

**`details_submitted`** is available and never mirrored → Step 5.4.
