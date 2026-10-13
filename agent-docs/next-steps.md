# CLI work — handoff / next steps

Read this first, then `agent-docs/cli-plan.md` (design + decisions) and `cli/README.md` (user docs).
Branch: `cli-support` (off `main` @ b0fe5da). Nothing here has been deployed.

## What this is
A `complaints` CLI for the satirical Complaints Department (this repo; deployed at https://complaints.pisomojado.org —
not a Stripe-internal project). It files complaints and buys subscriptions from the command line, **sandbox/Stripe
test mode only**. Because the web flow uses embedded Checkout (browser-only), we added sandbox-only backend endpoints
that create PaymentIntents / subscriptions directly from a Stripe test card number.

## Current state
- DONE and committed on this branch: `shared/testCards.ts` (allowlist), `cli_api_keys` table + storage + migration,
  `server/cliKeys.ts`, `server/cliRoutes.ts` (`POST /api/cli/complain`, `POST /api/cli/subscribe`),
  `script/cli-keys.ts` (key admin), `cli/` package (zero runtime deps) with 8 passing tests.
- Verified locally: root `npx tsc --noEmit` clean, `npm run build` OK, `cd cli && npm test` passes (8/8).
- NOT verified: anything touching real Stripe, DSQL, Bedrock or API Gateway. `node test-lambda-local.cjs` could not run
  (it attempts a network connect to AWS and times out on the devbox network).
- NOT done: deploy, DB migration, smoke tests, key minting. The previous agent (and CLAUDE.md) forbid agents from
  pushing/deploying; the human runs those.

## Why the previous session got stuck
The human's network blocks the AWS account in use, so they couldn't run the migration/deploy/key script from there.
They are moving to a different network and will push this branch to their GitHub repo and continue from there.

## Steps remaining (human-run unless noted)

### 1. Stripe dashboard — full permission list for the restricted test key (`rk_test_…`)
Stripe Dashboard (test mode) → Developers → API keys → edit the restricted key. Everything the server calls:

| Resource | Access | Used by |
|---|---|---|
| Customers | Write | CLI subscribe (`customers.create/update`) |
| PaymentMethods | Write | CLI complain/subscribe (`paymentMethods.create/attach`) |
| PaymentIntents | Write | CLI complain (`paymentIntents.create`, confirm:true) — **new** |
| Subscriptions | Write | CLI subscribe (`subscriptions.create`), webhook (`subscriptions.retrieve`) — **new** |
| Invoices | Write (safe default) | Subscriptions create/pay an invoice under the hood; if the first subscribe fails with a permission error naming invoices, add this — **unverified** |
| Prices / Products | Read | subscription line item references an existing price — **unverified** |
| Checkout Sessions | Write | existing web flow (`checkout.sessions.create/retrieve`) |
| Customer portal / Billing portal sessions | Write | existing `/api/subscriptions/customer-portal` |
| Connect → Accounts | Write | existing department registration (`accounts.create/retrieve/createLoginLink`) |
| Connect → Account Links | Write | existing onboarding (`accountLinks.create`) |
| Webhook endpoints | (not needed; signature verified locally with whsec_ secrets) | |

If any call returns a 403/"permission" error, the message names the missing resource — add it and retry.
Also required: **raw card number API access in test mode** (see smoke test 1). If Stripe rejects raw PANs, see Fallback.

### 2. Get onto a network that can reach AWS, check out the branch
```bash
git fetch origin && git switch cli-support
npm install --registry https://registry.npmjs.org
npx tsc --noEmit && npm run build     # sanity
```

### 3. Create the table
`npx tsx script/migrate-tables.ts` (idempotent; adds `cli_api_keys`). Needs AWS creds (SSM + DSQL).

### 4. Deploy backend only
`npm run deploy:api`. No frontend deploy needed. (Confirm the Lambda picks up the new routes; they're registered in
`server/routes.ts` via `registerCliRoutes`.)

### 5. Mint an API key
`npx tsx script/cli-keys.ts create --label me` — prints the key once (50 uses by default). Other commands: `list`,
`add-uses <id> <n>`, `revoke <id>`.

### 6. Install the CLI
`cd cli && npm install --registry https://registry.npmjs.org && npm run build && npm link`, then
`complaints config set-key <key>`. Default API URL is already the deployed API Gateway
(`https://o4mjau2wl3.execute-api.us-east-1.amazonaws.com/prod/`, taken from the public index.html); override with
`--api-url` / `COMPLAINTS_API_URL`.

### 7. Smoke tests (test 1 is also the "Phase 0 spike" nobody could run)
1. `complaints complain --content "It is too hot in here" --email someone@example.com --test-cc 4242424242424242`
   → expect a resolved complaint with an AI response. **If Stripe rejects the raw card number**, see Fallback.
2. Declined card `4000000000000002` → exit 1, "card was declined"; complaint is left `pending_payment` (known/accepted).
3. `complaints departments`, then `complain ... --dept <slug>` → success; in Stripe test dashboard confirm the
   application fee/transfer to the connected account (department must have charges enabled).
4. `complaints subscribe --registered --email x@example.com --test-cc 4242…` → `complaints status x@example.com`
   shows 0/3. Three `complain` calls with no card succeed; the 4th must demand `--test-cc` (402).
5. `subscribe --pro` → unlimited, no card needed. Re-subscribing an already-subscribed email → 409.
6. Key limit: `add`/use a key with `--max-uses 2` and confirm the 3rd `complain`/`subscribe` is refused (429
   "API key exhausted"). Read-only commands (`case`, `status`, `departments`) don't consume uses.
7. 3DS card (`4000002500003155`) → clear "requires 3D Secure; CLI cannot complete" error.
8. Check CloudWatch for `[CLI]` errors; no secrets/card numbers should appear in logs (we never log them).

## Fallback if raw card numbers are rejected by Stripe
Map allowlisted numbers to Stripe's `pm_card_*` test tokens server-side (e.g. 4242424242424242→`pm_card_visa`,
4000000000000002→`pm_card_chargeDeclined`, …) and use `payment_method: token` instead of creating a PM from the PAN.
Only the cards with a documented token would work; document that limitation. Touch points: `cardParams()` and the two
`paymentMethods.create` calls in `server/cliRoutes.ts`.

## Known limitations / design notes (don't "fix" without asking)
- `consumeUse` runs after validation; a use is spent even if the card is then declined.
- Failed payments leave a `pending_payment` complaint row (same as the web flow).
- API Gateway REST caps at ~29s; the CLI reports a gateway timeout (complaint may still be filed). Lambda timeout is 90s.
- Subscription allowance is keyed on email with no verification (pre-existing in the web `use-complaint` route too).
- CLI only honours **test-mode** subscriptions (`mode === 'test'`).
- Only complain/subscribe consume key uses (decision from human).
- `shared/testCards.ts` was transcribed from docs.stripe.com/testing via a summarizer — worth a skim, and re-check
  occasionally. Its commit message contains `GIT_VALID_PII_OVERRIDE` because the scanner false-positives on public
  Stripe test numbers; **do not use that override for any other file.**
- `cli/src/testCards.ts` is generated (`npm run sync-cards`) and gitignored.
- Not implemented on purpose: `departments register`, admin features, live mode.

## Possible follow-ups (ask the human first)
- Add server-side tests (the repo has no test runner besides the CLI's `node:test`); the endpoints' payment/allowance
  logic is untested.
- Atomic allowance check (concurrent CLI calls could exceed the 3/period).
- Publish `cli/` or a release note in the main README; add a link from `README.md`/`ARCHITECTURE.md`.
- Once deployed and smoke-tested: set the plan docs to COMPLETED and move to `agent-docs/completed/`
  (per CLAUDE.md), and update `ARCHITECTURE.md`.

## Rules for agents on this repo (from CLAUDE.md + session experience)
- Never `git push`, `cdk deploy`, `npm run deploy:*`, or mutate AWS; hand the human the command.
- Build + tests must pass before committing; scan for secrets/AWS account IDs (never commit the account ID).
- The commit hook scans for PII (emails, card-like numbers). Use `example.com` emails in docs/tests.
- Keep `agent-docs/` updated on every commit.
- `npm install` needs `--registry https://registry.npmjs.org`.
