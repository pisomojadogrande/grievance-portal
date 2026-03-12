# Stripe Live Mode + Restricted Test Key

The work described here is complete.  Keeping the plan around for posterity.

## Context
The grievance portal currently uses Stripe test/sandbox keys stored in SSM, loaded via `server/init.ts` into env vars. The Stripe client is created in `server/stripeClient.ts` and used in `server/routes.ts` for checkout session creation and verification. The Payment page (`client/src/pages/Payment.tsx`) shows a hardcoded amber "Test Mode" banner and the $5.00 amount from `complaint.filingFee`.

Goal: (1) swap test mode to use a restricted key so the pattern mirrors live mode; (2) add a visible "Real Payment" option on the payment page that uses live Stripe keys and charges $0.50; (3) add structured error logging throughout.

---

## Step 0 — Switch test mode to a restricted Stripe key (SSM-only, no code changes)

**What:** Replace the existing test secret key in SSM with your restricted test key (`rk_test_...`). This is a credential swap only — no code changes required.

**AWS CLI commands to run:**
```bash
aws ssm put-parameter \
  --name "/grievance-portal/stripe/secret-key" \
  --value "rk_test_YOUR_RESTRICTED_KEY" \
  --type SecureString --overwrite

aws ssm put-parameter \
  --name "/grievance-portal/stripe/publishable-key" \
  --value "pk_test_YOUR_PUBLISHABLE_KEY" \
  --type String --overwrite
```

**Acceptance criteria (manual):**
- Deploy Lambda (no code changes, just verify existing deploy works with new key)
- Navigate to `complaints.pisomojado.org`, file a complaint, reach the payment page — test payment banner loads and Stripe embedded checkout appears
- Use test card `4242 4242 4242 4242`, complete payment, verify AI response is generated
- In Stripe test dashboard, confirm payment appears under the restricted key's account

---

## Step 1 — Add live Stripe SSM parameters

**What:** Add two new SSM parameters for live keys. No CDK deploy needed — use AWS CLI.

**AWS CLI commands:**
```bash
aws ssm put-parameter \
  --name "/grievance-portal/stripe/live-secret-key" \
  --value "rk_live_YOUR_RESTRICTED_LIVE_KEY" \
  --type SecureString

aws ssm put-parameter \
  --name "/grievance-portal/stripe/live-publishable-key" \
  --value "pk_live_YOUR_PUBLISHABLE_LIVE_KEY" \
  --type String
```

Also add these to `infrastructure/lib/parameters-stack.ts` (with `'PLACEHOLDER'` values) so future CDK deploys know about them.

Also add to `.env.example`:
```
STRIPE_LIVE_SECRET_KEY=rk_live_...
STRIPE_LIVE_PUBLISHABLE_KEY=pk_live_...
```

**Files modified:**
- `infrastructure/lib/parameters-stack.ts` — add 2 new `StringParameter` entries
- `.env.example` — document new vars

**Acceptance criteria:** `aws ssm get-parameter --name /grievance-portal/stripe/live-secret-key --with-decryption` returns your live key value.

---

## Step 2 — Load live keys in backend init + client

**Files modified:** `server/init.ts`, `server/stripeClient.ts`

**`server/init.ts`** — add two lines to the SSM loading block:
```typescript
process.env.STRIPE_LIVE_SECRET_KEY = params['stripe/live-secret-key'];
process.env.STRIPE_LIVE_PUBLISHABLE_KEY = params['stripe/live-publishable-key'];
```

**`server/stripeClient.ts`** — add two new exported functions:
```typescript
export function getLiveStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_LIVE_SECRET_KEY;
  if (!secretKey || secretKey === 'PLACEHOLDER') {
    throw new Error('[Stripe][Live] STRIPE_LIVE_SECRET_KEY is not configured');
  }
  return new Stripe(secretKey, { apiVersion: '2025-11-17.clover' });
}

export function getLiveStripePublishableKey(): string {
  const publishableKey = process.env.STRIPE_LIVE_PUBLISHABLE_KEY;
  if (!publishableKey || publishableKey === 'PLACEHOLDER') {
    throw new Error('[Stripe][Live] STRIPE_LIVE_PUBLISHABLE_KEY is not configured');
  }
  return publishableKey;
}
```

**Acceptance criteria:** `npm run build` succeeds. `node test-lambda-local.cjs` runs without errors (live key will be undefined locally, but the error only throws when those functions are called).

---

## Step 3 — New backend routes for live payments

**File modified:** `server/routes.ts`

**Add two new routes:**

### `GET /api/stripe/live-config`
Returns the live publishable key, with detailed error logging:
```typescript
app.get('/api/stripe/live-config', async (req, res) => {
  try {
    const publishableKey = getLiveStripePublishableKey();
    console.log('[Stripe][Live] Config requested, key prefix:', publishableKey.substring(0, 12));
    res.json({ publishableKey });
  } catch (err: any) {
    console.error('[Stripe][Live] Failed to get live config:', err.message);
    res.status(500).json({ message: 'Live payment not available: ' + err.message });
  }
});
```

### `POST /api/stripe/create-live-checkout-session`
Like the existing test endpoint but uses live client and hardcodes $0.50:
```typescript
app.post('/api/stripe/create-live-checkout-session', async (req, res) => {
  try {
    const { complaintId } = req.body;
    // ... same validation as test endpoint ...

    const stripe = getLiveStripeClient();
    const LIVE_AMOUNT_CENTS = 50; // $0.50

    console.log(`[Stripe][Live] Creating checkout session for complaint #${complaintId}, amount: ${LIVE_AMOUNT_CENTS} cents`);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Complaint Filing Fee (Real)',
            description: `Administrative fee for complaint #${complaintId}`,
          },
          unit_amount: LIVE_AMOUNT_CENTS,
        },
        quantity: 1,
      }],
      mode: 'payment',
      ui_mode: 'embedded',
      return_url: `${frontendUrl}/status/${complaintId}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      metadata: { complaintId: String(complaintId), customerEmail: complaint.customerEmail },
      customer_email: complaint.customerEmail,
    });

    console.log(`[Stripe][Live] Session created: ${session.id} for complaint #${complaintId}`);
    res.json({ clientSecret: session.client_secret });
  } catch (err: any) {
    console.error(`[Stripe][Live] Error creating checkout session for complaint #${complaintId}:`, {
      message: err.message,
      type: err.type,
      code: err.code,
      statusCode: err.statusCode,
      raw: err.raw,
    });
    res.status(500).json({ message: err.message || 'Failed to create live checkout session' });
  }
});
```

**Update `verify-session`** to detect live vs test by session ID prefix (`cs_live_` vs `cs_test_`):
```typescript
const isLiveSession = sessionId.startsWith('cs_live_');
console.log(`[Stripe][${isLiveSession ? 'Live' : 'Test'}] Verifying session ${sessionId} for complaint #${complaintId}`);
const stripe = isLiveSession ? getLiveStripeClient() : await getUncachableStripeClient();
```
Also improve the error log to include full Stripe error details (same structured object as above).

**Acceptance criteria (local):** `npm run build` succeeds. `node test-lambda-local.cjs` succeeds.

---

## Step 4 — Frontend: add Real Payment option on Payment page

**File modified:** `client/src/pages/Payment.tsx`

**UX design:**
- Default view unchanged: amber test mode banner, $5.00, test card instructions, "Pay $5.00 - Enter Card Details" button
- Below the test button, add a subdued separator and a second "Real Payment" section:
  - Blue/indigo info banner: "Real Payment — $0.50 will be charged to your card. Use your actual credit card."
  - Button: "Pay $0.50 - Real Payment"
- When real payment button is clicked, load the live Stripe key (via `/api/stripe/live-config`) and open an `EmbeddedCheckoutProvider` configured with the live key and fetching from `/api/stripe/create-live-checkout-session`
- The "Amount Due" header area stays showing the complaint's `filingFee` (test) but the real payment section clearly shows $0.50

**Implementation notes:**
- Add state: `showLiveCheckout: boolean`, `liveStripeLoaded: boolean`, `liveStripeError: string | null`
- Separate `getLiveStripePromise()` function that calls `/api/stripe/live-config` (parallel to existing `getStripePromise()`)
- Live checkout session fetch calls `/api/stripe/create-live-checkout-session`
- If `/api/stripe/live-config` returns an error, show the live payment button grayed out with an error message (don't hide it entirely so errors are visible)
- Show the live mode section below the test mode section, separated with a visible divider line and label "— or —"

**Also update `client/src/pages/FileComplaint.tsx`:**
Change the footer note from "No real payments are processed" to "By default, test payments use Stripe sandbox. A real payment option ($0.50) is available at checkout."

**Acceptance criteria (manual, post-deploy):**
- Default payment page shows test mode (amber banner, $5.00, test card)
- Below that, user sees "Real Payment" section with $0.50 and blue banner
- Test payment flow works end-to-end (no regression)
- Real payment: clicking the real payment button loads the Stripe live embedded checkout form
- Entering a real card and completing payment redirects to `/status/{id}`
- Status page verifies the payment (backend detects `cs_live_` prefix, uses live client)
- AI response is generated and displayed
- In Stripe live dashboard, a $0.50 payment appears

---

## Step 5 — Update agent-docs

Update `agent-docs/deploy-to-aws-plan.md` with notes on the live mode setup, new SSM params, and restricted key pattern.

---

## Deployment sequence

1. Run Step 0 SSM commands (test restricted key) → test manually (no deploy needed if Lambda already running, but a redeploy forces Lambda to re-read SSM)
2. Run Step 1 SSM commands (live keys)
3. Implement code changes (Steps 2–4) → `npm run build` → `node test-lambda-local.cjs`
4. Deploy API: `AWS_PROFILE=<profile> CUSTOM_DOMAIN=<domain> npm run deploy:api`
5. Deploy frontend: `AWS_PROFILE=<profile> CUSTOM_DOMAIN=<domain> npm run deploy:frontend`
6. Manual end-to-end test: test mode payment, then live mode payment

## Critical files

- `server/init.ts` — SSM param loading
- `server/stripeClient.ts` — Stripe client factory
- `server/routes.ts` — API endpoints (checkout session creation, verify-session)
- `client/src/pages/Payment.tsx` — Payment UX
- `client/src/pages/FileComplaint.tsx` — Footer disclaimer
- `infrastructure/lib/parameters-stack.ts` — CDK SSM param definitions
- `.env.example` — Local dev documentation
