# CLI for The Complaints Department

## Status

- [ ] Phase 0: spike — confirm test-mode raw card numbers work with our Stripe key
- [ ] Phase 1: backend (API keys, test-card allowlist, `/api/cli/*` endpoints)
- [ ] Phase 2: key admin script (`script/cli-keys.ts`)
- [ ] Phase 3: CLI package (`cli/`)
- [ ] Phase 4: docs + local tests + deploy instructions handed to human

(Update this file on every commit.)

## Goal

`complaints` CLI that files complaints and buys subscriptions synchronously against the deployed
service, sandbox-only. Examples:

```
complaints complain --content "It is too hot in here" --email someone@example.com \
    --test-cc 4242424242424242 --dept internecine-strife
complaints subscribe --pro --email pro@example.com --test-cc 4242424242424242
complaints complain --content "..." --email pro@example.com     # uses subscription, no card
```

(`--user` accepted as an alias for `--email`.)

## Decisions (from human)

1. New sandbox-only backend endpoints (option 1). Server creates PaymentIntents / subscriptions itself;
   the CLI never holds Stripe credentials.
2. Server accepts only Stripe's documented test card numbers (https://docs.stripe.com/testing), including the
   special-behavior ones (declines, disputes, fraud, etc.). Everything else rejected with 400 before touching Stripe.
3. Both tiers (registered_complainant: 3/period, pro_complainant: unlimited) purchasable via CLI with a test card.
   A later `complain` for an email with an active **test-mode** subscription needs no card until the allowance
   is exhausted. Must be enforced server-side (the web `use-complaint` route already checks registered=3; the CLI
   endpoint will share one helper so the rules live in one place).
4. Commands: `complain`, `subscribe`, `case <id>`, `status <email>` (subscription tier + allowance used/remaining —
   *not* the same as `case`), `departments`, `config`. No `departments register`.
5. TypeScript in `cli/` with own package.json and `complaints` bin; commander for parsing. Clear install/run docs.
6. Default API URL = deployed API Gateway URL (overridable `--api-url` / `COMPLAINTS_API_URL`); human-readable
   output by default, `--json` for scripting.
7. API keys: each key valid for 50 invocations, then dead. Human mints more via an AWS-credentialed script
   (not via CLI).

## Design

### Findings that drive the design
- Existing paid flow = embedded Checkout (browser only); can't be completed from a CLI. Hence new endpoints.
- `/api/payments` (legacy) doesn't verify payment — never use.
- Free existing endpoints reusable by CLI: `GET /api/departments`, `GET /api/complaints/:id`,
  `GET /api/subscriptions/status?email=`.
- Webhooks only handle `checkout.session.completed` for payments/subs, so PaymentIntent/Subscription-API flows
  won't double-process; the CLI endpoints write DB records directly (same helpers as the webhook).
- Lambda must await Bedrock before responding (see CLAUDE.md). API Gateway REST caps at 29s; CLI polls
  `GET /api/complaints/:id` if the sync call times out or returns before `resolved`.
- DSQL: no FKs, no auto-increment (use `getNextId`), table creation via `script/migrate-tables.ts`.

### API keys
- Table `cli_api_keys`: id, key_hash (sha256, unique), label, max_uses (default 50), uses (default 0),
  revoked bool, created_at, last_used_at. Plaintext key (`cmp_` + 32 random bytes base64url) shown once at creation.
- Middleware `cliAuth`: reads `X-API-Key`, atomically
  `UPDATE ... SET uses = uses + 1 WHERE key_hash=$1 AND uses < max_uses AND NOT revoked RETURNING` (retry on DSQL OCC
  conflict). 401 invalid/revoked, 429-style message when exhausted ("API key exhausted: 50/50 invocations used").
- What counts as an invocation: each call to the *mutating* endpoints (`complain`, `subscribe`) — i.e. the things
  that cost money/Bedrock. Read-only helpers (`departments`, `case`, `status`, polling) use existing public endpoints
  and don't consume uses. (Easy to change if the human wants every call counted.)

### Test cards (`shared/testCards.ts`)
- Allowlist of numbers from docs.stripe.com/testing (basic, international, declines, fraud, disputes, refunds,
  balance, 3DS). Pure function `isStripeTestCard(number)`; CLI uses default exp 12/2034, CVC 123 (override flags).
- Server additionally refuses to run the CLI endpoints unless the Stripe secret key starts with `sk_test_`/`rk_test_`.
- 3DS-required cards: PaymentIntent returns `requires_action` → CLI reports "card requires authentication; not
  supported from CLI" (complaint stays `pending_payment`).

### Endpoints (all `cliAuth`)
- `POST /api/cli/complain` `{ content, email, departmentSlug?, testCard? {number, expMonth?, expYear?, cvc?} }`
  1. validate; resolve department by slug (must be active/charges enabled, same rule as web).
  2. If email has active *test* subscription with allowance → create complaint, mark `received`, await
     `generateBureaucraticResponse`, return complaint (payment: `subscription`).
  3. Else require `testCard` (else 402 explaining allowance exhausted / no subscription) → create complaint →
     PaymentIntent (`confirm: true`, `payment_method_data` card, `allow_redirects: 'never'`, Connect
     `application_fee_amount` + `transfer_data` for departments, same as checkout) → on success create payment row,
     mark `received`, await AI, return complaint. Decline → 402 with Stripe's decline message/code.
- `POST /api/cli/subscribe` `{ email, tier, testCard }` → reject if already active test sub for email → create
  Customer → attach PM → `subscriptions.create` (price IDs from existing env vars) → on `active`, insert subscription
  row (idempotent via `getSubscriptionByStripeId`) → return tier + allowance.
- Shared helper `getComplaintAllowance(sub)` replaces the inline `3` in routes.ts.
- Known pre-existing caveat (not fixing): subscription use is keyed on email with no email verification, same as web.

### CLI (`cli/`)
- `cli/package.json` (`bin: { complaints: dist/index.js }`), `commander`, Node ≥18 `fetch`, built with `tsc`.
- Config: `COMPLAINTS_API_KEY` env or `complaints config set-key <key>` (stored `~/.config/complaints/config.json`, 0600).
- Refuses to send anything that isn't a known test card client-side too (fast failure, same allowlist copy).
- Output: complaint #, department, payment method, status, AI response text. Non-zero exit on failure with the
  server's message.
- README with install (`cd cli && npm install && npm run build && npm link`) and usage.

### Key admin script
`script/cli-keys.ts` (run with human's AWS creds, like `show-department.ts`):
`create --label <l> [--max-uses 50]`, `list`, `revoke <id>`, `add-uses <id> <n>`.

## Deploy prerequisites for the human (to be finalised)
1. Stripe restricted test key (`rk_test_…`) needs write on PaymentIntents, PaymentMethods, Customers, Subscriptions
   (plus existing Connect perms) — and raw-card-data API access in test mode (Phase 0 verifies).
2. `npm run db:migrate`-equivalent (`tsx script/migrate-tables.ts`) to create `cli_api_keys`.
3. `npm run deploy:api` (backend only; no frontend change needed).
4. `tsx script/cli-keys.ts create --label me` to mint first key.
Exact commands will be written here once built.

## Test plan
- Unit: test-card allowlist; allowance helper; key limiter (mock db).
- `npm run build` + `node test-lambda-local.cjs` still pass.
- CLI: arg parsing / error paths against a mocked server.
- Post-deploy smoke (human-run): complain w/ 4242…, declined card 4000000000000002, subscribe registered, 4th complaint
  after 3 uses requires card, key exhaustion at 50.

## Log
- (none yet)
