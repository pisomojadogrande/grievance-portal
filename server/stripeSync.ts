/**
 * Read-only queries against Stripe's synced Postgres databases.
 *
 * These tables are readable through an ORM, but raw parameterized SQL is a
 * better fit here:
 * 1. Stripe generates every business column, so Postgres rejects writes and
 *    removes half of an ORM's usual value.
 * 2. This repository has a `drizzle-kit push` command; describing Stripe-owned
 *    generated tables to that migration tool risks rewriting them as ordinary
 *    application-owned columns.
 * 3. Important fields such as subscription price and billing period live in
 *    JSONB paths, which an ORM cannot usefully type or simplify.
 * 4. Generated types would advertise misleading columns such as
 *    `invoices.subscription`, which exists but is always null for the current
 *    Stripe API shape.
 *
 * Keep this module isolated from the application's writable Aurora DSQL schema.
 */

import { getSyncDb, type StripeMode } from './supabaseDb';

export interface SyncedCheckoutSession {
  id: string;
  amountTotal: number | null;
  checkoutMode: string | null;
  customerId: string | null;
  metadata: Record<string, string>;
  paymentIntentId: string | null;
  paymentStatus: string | null;
  status: string | null;
  subscriptionId: string | null;
  updatedAt: Date;
}

export interface SyncedPayment {
  amount: number;
  status: string;
  transactionId: string;
  mode: StripeMode;
}

export type SubscriptionTier = 'registered_complainant' | 'pro_complainant';

export interface SyncedSubscription {
  customerEmail: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  tier: SubscriptionTier;
  status: string;
  mode: StripeMode;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  cancelAt: Date | null;
}

export interface SyncedSessionSubscription extends SyncedSubscription {
  checkoutSessionId: string;
}

export interface SyncedDunningInfo {
  invoiceId: string;
  status: string | null;
  attemptCount: number;
  nextPaymentAttempt: Date | null;
}

export interface SyncedAccount {
  id: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}

export interface WaitForCheckoutSessionOptions {
  timeoutMs?: number;
  intervalMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

interface SubscriptionRow {
  checkout_session_id?: string;
  customer_email: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  stripe_price_id: string;
  tier: SubscriptionTier;
  status: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean | null;
  cancel_at: string | null;
}

function optionalEpochSecondsToDate(value: string | number | null): Date | null {
  if (value === null) return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) {
    throw new Error(`Stripe sync returned an invalid epoch value: ${value}`);
  }
  return new Date(seconds * 1_000);
}

function epochSecondsToDate(value: string | number): Date {
  return optionalEpochSecondsToDate(value)!;
}

function getPriceIds(mode: StripeMode): { registered: string; pro: string } {
  const registeredEnv = mode === 'test'
    ? 'STRIPE_PRICE_REGISTERED_COMPLAINANT'
    : 'STRIPE_LIVE_PRICE_REGISTERED_COMPLAINANT';
  const proEnv = mode === 'test'
    ? 'STRIPE_PRICE_PRO_COMPLAINANT'
    : 'STRIPE_LIVE_PRICE_PRO_COMPLAINANT';
  const registered = process.env[registeredEnv];
  const pro = process.env[proEnv];

  if (!registered || registered === 'PLACEHOLDER' || registered === 'undefined') {
    throw new Error(`[Stripe Sync][${mode}] ${registeredEnv} is not configured`);
  }
  if (!pro || pro === 'PLACEHOLDER' || pro === 'undefined') {
    throw new Error(`[Stripe Sync][${mode}] ${proEnv} is not configured`);
  }

  return { registered, pro };
}

function mapSubscription(row: SubscriptionRow, mode: StripeMode): SyncedSubscription {
  return {
    customerEmail: row.customer_email,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    stripePriceId: row.stripe_price_id,
    tier: row.tier,
    status: row.status,
    mode,
    currentPeriodStart: epochSecondsToDate(row.current_period_start),
    currentPeriodEnd: epochSecondsToDate(row.current_period_end),
    cancelAtPeriodEnd: row.cancel_at_period_end ?? false,
    cancelAt: optionalEpochSecondsToDate(row.cancel_at),
  };
}

export async function getCheckoutSession(
  mode: StripeMode,
  sessionId: string,
): Promise<SyncedCheckoutSession | null> {
  const result = await getSyncDb(mode).query<{
    id: string;
    amount_total: number | null;
    checkout_mode: string | null;
    customer_id: string | null;
    metadata: Record<string, string> | null;
    payment_intent_id: string | null;
    payment_status: string | null;
    status: string | null;
    subscription_id: string | null;
    updated_at: Date;
  }>(`
    SELECT
      id,
      amount_total::integer AS amount_total,
      mode AS checkout_mode,
      customer AS customer_id,
      metadata,
      payment_intent AS payment_intent_id,
      payment_status,
      status,
      subscription AS subscription_id,
      _updated_at AS updated_at
    FROM checkout_sessions
    WHERE id = $1
    LIMIT 1
  `, [sessionId]);

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: row.id,
    amountTotal: row.amount_total,
    checkoutMode: row.checkout_mode,
    customerId: row.customer_id,
    metadata: row.metadata ?? {},
    paymentIntentId: row.payment_intent_id,
    paymentStatus: row.payment_status,
    status: row.status,
    subscriptionId: row.subscription_id,
    updatedAt: row.updated_at,
  };
}

export async function waitForCheckoutSession(
  mode: StripeMode,
  sessionId: string,
  options: WaitForCheckoutSessionOptions = {},
): Promise<SyncedCheckoutSession | null> {
  const timeoutMs = options.timeoutMs ?? 3_000;
  const intervalMs = options.intervalMs ?? 300;
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const deadline = Date.now() + timeoutMs;

  while (true) {
    const session = await getCheckoutSession(mode, sessionId);
    if (session) return session;

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) return null;
    await sleep(Math.min(intervalMs, remainingMs));
  }
}

export async function getPaymentForComplaint(
  mode: StripeMode,
  complaintId: number,
): Promise<SyncedPayment | null> {
  const result = await getSyncDb(mode).query<{
    amount: number;
    status: string;
    transaction_id: string;
  }>(`
    SELECT
      COALESCE(pi.amount_received, pi.amount, cs.amount_total)::integer AS amount,
      pi.status,
      pi.id AS transaction_id
    FROM checkout_sessions cs
    JOIN payment_intents pi
      ON pi.id = cs.payment_intent
      AND pi._account_id = cs._account_id
    WHERE cs.metadata->>'complaintId' = $1
    ORDER BY (cs.payment_status = 'paid') DESC, cs.created DESC NULLS LAST
    LIMIT 1
  `, [String(complaintId)]);

  const row = result.rows[0];
  if (!row) return null;

  return {
    amount: row.amount,
    status: row.status,
    transactionId: row.transaction_id,
    mode,
  };
}

export async function getActiveSubscriptionByEmail(
  mode: StripeMode,
  email: string,
): Promise<SyncedSubscription | null> {
  const { registered, pro } = getPriceIds(mode);
  const result = await getSyncDb(mode).query<SubscriptionRow>(`
    SELECT
      c.email AS customer_email,
      s.customer AS stripe_customer_id,
      s.id AS stripe_subscription_id,
      s.items->'data'->0->'price'->>'id' AS stripe_price_id,
      CASE
        WHEN s.items->'data'->0->'price'->>'id' = $2 THEN 'pro_complainant'
        ELSE 'registered_complainant'
      END AS tier,
      s.status,
      s.items->'data'->0->>'current_period_start' AS current_period_start,
      s.items->'data'->0->>'current_period_end' AS current_period_end,
      s.cancel_at_period_end,
      s.cancel_at
    FROM subscriptions s
    JOIN customers c
      ON c.id = s.customer
      AND c._account_id = s._account_id
    WHERE c.email = $1
      AND s.status = 'active'
      AND s.items->'data'->0->'price'->>'id' IN ($2, $3)
    ORDER BY
      CASE WHEN s.items->'data'->0->'price'->>'id' = $2 THEN 2 ELSE 1 END DESC,
      s.created DESC NULLS LAST
    LIMIT 1
  `, [email, pro, registered]);

  const row = result.rows[0];
  return row ? mapSubscription(row, mode) : null;
}

export async function getSubscriptionForSession(
  mode: StripeMode,
  sessionId: string,
): Promise<SyncedSessionSubscription | null> {
  const { registered, pro } = getPriceIds(mode);
  const result = await getSyncDb(mode).query<SubscriptionRow>(`
    SELECT
      cs.id AS checkout_session_id,
      c.email AS customer_email,
      s.customer AS stripe_customer_id,
      s.id AS stripe_subscription_id,
      s.items->'data'->0->'price'->>'id' AS stripe_price_id,
      CASE
        WHEN s.items->'data'->0->'price'->>'id' = $2 THEN 'pro_complainant'
        ELSE 'registered_complainant'
      END AS tier,
      s.status,
      s.items->'data'->0->>'current_period_start' AS current_period_start,
      s.items->'data'->0->>'current_period_end' AS current_period_end,
      s.cancel_at_period_end,
      s.cancel_at
    FROM checkout_sessions cs
    JOIN subscriptions s
      ON s.id = cs.subscription
      AND s._account_id = cs._account_id
    JOIN customers c
      ON c.id = s.customer
      AND c._account_id = s._account_id
    WHERE cs.id = $1
      AND s.items->'data'->0->'price'->>'id' IN ($2, $3)
    LIMIT 1
  `, [sessionId, pro, registered]);

  const row = result.rows[0];
  if (!row?.checkout_session_id) return null;

  return {
    checkoutSessionId: row.checkout_session_id,
    ...mapSubscription(row, mode),
  };
}

export async function getDunningInfo(
  mode: StripeMode,
  subscriptionId: string,
): Promise<SyncedDunningInfo | null> {
  const result = await getSyncDb(mode).query<{
    invoice_id: string;
    status: string | null;
    attempt_count: number | null;
    next_payment_attempt: string | null;
  }>(`
    SELECT
      i.id AS invoice_id,
      i.status,
      i.attempt_count::integer AS attempt_count,
      i.next_payment_attempt
    FROM subscriptions s
    JOIN invoices i
      ON i.id = s.latest_invoice
      AND i._account_id = s._account_id
    WHERE s.id = $1
    LIMIT 1
  `, [subscriptionId]);

  const row = result.rows[0];
  if (!row) return null;

  return {
    invoiceId: row.invoice_id,
    status: row.status,
    attemptCount: row.attempt_count ?? 0,
    nextPaymentAttempt: optionalEpochSecondsToDate(row.next_payment_attempt),
  };
}

export async function getAccount(
  mode: StripeMode,
  accountId: string,
): Promise<SyncedAccount | null> {
  const result = await getSyncDb(mode).query<{
    id: string;
    charges_enabled: boolean | null;
    payouts_enabled: boolean | null;
    details_submitted: boolean | null;
  }>(`
    SELECT id, charges_enabled, payouts_enabled, details_submitted
    FROM accounts
    WHERE id = $1
    LIMIT 1
  `, [accountId]);

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: row.id,
    chargesEnabled: row.charges_enabled ?? false,
    payoutsEnabled: row.payouts_enabled ?? false,
    detailsSubmitted: row.details_submitted ?? false,
  };
}

export async function countAbandonedCheckouts(mode: StripeMode): Promise<number> {
  const result = await getSyncDb(mode).query<{ count: number }>(`
    SELECT count(*)::integer AS count
    FROM checkout_sessions
    WHERE status = 'expired'
      AND metadata ? 'complaintId'
  `);
  return result.rows[0]?.count ?? 0;
}
