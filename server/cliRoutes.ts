import type { Express, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type Stripe from 'stripe';
import { storage } from './storage';
import { getUncachableStripeClient } from './stripeClient';
import { hashCliApiKey } from './cliKeys';
import { isStripeTestCard, normalizeCardNumber } from '@shared/testCards';
import { REGISTERED_COMPLAINANT_MONTHLY_ALLOWANCE, type Subscription } from '@shared/schema';

// Sandbox-only endpoints for the command-line client. Unlike the web flow (embedded Checkout), these
// create PaymentIntents / subscriptions directly from a Stripe *test* card number. Safety rails:
//   1. every request needs an API key with remaining uses (X-API-Key)
//   2. only Stripe's documented test card numbers are accepted (shared/testCards.ts)
//   3. refuses to run at all unless the configured Stripe secret key is a test-mode key

const FILING_FEE_FALLBACK_CENTS = 500;

const testCardSchema = z.object({
  number: z.string().min(1, 'Card number is required'),
  expMonth: z.coerce.number().int().min(1).max(12).default(12),
  expYear: z.coerce.number().int().min(2025).max(2100).default(2034),
  cvc: z.string().regex(/^\d{3,4}$/, 'CVC must be 3 or 4 digits').default('123'),
}).superRefine((card, ctx) => {
  if (!isStripeTestCard(card.number)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['number'],
      message: 'Only Stripe test card numbers are accepted (see https://docs.stripe.com/testing). This service is sandbox-only.',
    });
  }
});
type TestCard = z.infer<typeof testCardSchema>;

const complainSchema = z.object({
  content: z.string().min(10, 'Complaint must be at least 10 characters long. We need details.'),
  email: z.string().email('Please provide a valid email for official correspondence.'),
  departmentSlug: z.string().optional().nullable(),
  testCard: testCardSchema.optional().nullable(),
});

const subscribeSchema = z.object({
  email: z.string().email('Please provide a valid email for official correspondence.'),
  tier: z.enum(['registered_complainant', 'pro_complainant']),
  testCard: testCardSchema,
});

class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

function cardParams(card: TestCard) {
  return {
    number: normalizeCardNumber(card.number)!,
    exp_month: card.expMonth,
    exp_year: card.expYear,
    cvc: card.cvc,
  };
}

function sendError(res: Response, err: any) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message, ...err.extra });
  }
  if (err instanceof z.ZodError) {
    return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
  }
  if (err?.type === 'StripeCardError' || err?.type === 'StripeInvalidRequestError') {
    return res.status(402).json({
      message: err.message,
      code: err.code,
      declineCode: err.decline_code,
    });
  }
  console.error('[CLI] Unexpected error:', err?.message, err?.type, err?.code);
  return res.status(500).json({ message: err?.message || 'Internal error' });
}

async function requireTestModeStripe(): Promise<Stripe> {
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (!/^(sk|rk)_test_/.test(key)) {
    throw new HttpError(503, 'CLI endpoints are disabled: Stripe is not configured in test mode.');
  }
  return getUncachableStripeClient();
}

// Verifies the key exists, isn't revoked and has uses left. Does NOT consume a use — handlers call
// consumeUse() once the request has validated, so typos don't burn invocations.
async function cliAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const apiKey = req.header('x-api-key');
    if (!apiKey) return res.status(401).json({ message: 'Missing API key (X-API-Key). Run: complaints config set-key <key>' });
    const row = await storage.getCliApiKeyByHash(hashCliApiKey(apiKey));
    if (!row || row.revoked) return res.status(401).json({ message: 'Invalid or revoked API key' });
    if (row.uses >= row.maxUses) return res.status(429).json({ message: `API key exhausted: ${row.uses}/${row.maxUses} invocations used` });
    (req as any).cliKeyHash = row.keyHash;
    next();
  } catch (err) {
    sendError(res, err);
  }
}

async function consumeUse(req: Request): Promise<void> {
  const row = await storage.consumeCliApiKeyUse((req as any).cliKeyHash);
  if (!row) throw new HttpError(429, 'API key exhausted or revoked');
}

export interface Allowance {
  tier: Subscription['tier'];
  used: number;
  allowed: number | null; // null = unlimited
  remaining: number | null;
  periodEnd: string;
}

/** Single source of truth for subscription allowance (test-mode subscriptions only; CLI is sandbox-only). */
export async function getTestAllowance(email: string): Promise<Allowance | undefined> {
  const sub = await storage.getSubscriptionByEmail(email);
  if (!sub || sub.mode !== 'test') return undefined;
  const used = await storage.countComplaintsInPeriod(email, sub.currentPeriodStart);
  const allowed = sub.tier === 'pro_complainant' ? null : REGISTERED_COMPLAINANT_MONTHLY_ALLOWANCE;
  return {
    tier: sub.tier,
    used,
    allowed,
    remaining: allowed === null ? null : Math.max(0, allowed - used),
    periodEnd: sub.currentPeriodEnd.toISOString(),
  };
}

export function registerCliRoutes(
  app: Express,
  deps: { generateBureaucraticResponse: (complaintId: number, content: string) => Promise<unknown> },
) {
  app.post('/api/cli/complain', cliAuth, async (req, res) => {
    try {
      const input = complainSchema.parse(req.body);

      let department: Awaited<ReturnType<typeof storage.getDepartmentBySlug>>;
      if (input.departmentSlug) {
        department = await storage.getDepartmentBySlug(input.departmentSlug);
        if (!department || !department.stripeAccountId) {
          throw new HttpError(404, `Unknown department "${input.departmentSlug}". Run: complaints departments`);
        }
      }

      // Decide payment path before touching anything.
      const allowance = await getTestAllowance(input.email);
      const useSubscription = !!allowance && (allowance.remaining === null || allowance.remaining > 0);
      if (!useSubscription && !input.testCard) {
        throw new HttpError(402, allowance
          ? `Monthly complaint allowance exhausted (${allowance.used}/${allowance.allowed}). Provide --test-cc to pay the filing fee.`
          : 'No active subscription for this email. Provide --test-cc to pay the filing fee, or run: complaints subscribe');
      }
      const stripe = useSubscription ? null : await requireTestModeStripe();

      await consumeUse(req);

      const complaint = await storage.createComplaint({
        content: input.content,
        customerEmail: input.email,
        departmentId: department?.id ?? null,
      });

      let paymentMethod: 'subscription' | 'card' = 'subscription';
      if (!useSubscription) {
        paymentMethod = 'card';
        const amount = complaint.filingFee || FILING_FEE_FALLBACK_CENTS;
        const connect = department?.stripeAccountId && department.chargesEnabled
          ? { application_fee_amount: department.applicationFeeAmount, transfer_data: { destination: department.stripeAccountId } }
          : {};
        const pm = await stripe!.paymentMethods.create({ type: 'card', card: cardParams(input.testCard!) });
        const intent = await stripe!.paymentIntents.create({
          amount,
          currency: 'usd',
          confirm: true,
          payment_method: pm.id,
          automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
          description: `Administrative fee for complaint #${complaint.id}`,
          metadata: { complaintId: String(complaint.id), customerEmail: input.email, source: 'cli' },
          ...connect,
        });
        if (intent.status !== 'succeeded') {
          const why = intent.status === 'requires_action'
            ? 'This card requires 3D Secure authentication, which the CLI cannot complete.'
            : `Payment did not complete (status: ${intent.status}).`;
          throw new HttpError(402, why, { complaintId: complaint.id, code: intent.status });
        }
        await storage.createPayment({ complaintId: complaint.id, amount, mode: 'test' });
        await storage.updatePaymentByComplaintId(complaint.id, {
          status: 'succeeded',
          transactionId: intent.id,
        });
      }

      await storage.updateComplaint(complaint.id, { status: 'received' });
      // Lambda freezes after responding, so AI generation must finish before we reply.
      await deps.generateBureaucraticResponse(complaint.id, complaint.content);

      const final = await storage.getComplaint(complaint.id);
      res.status(201).json({
        complaint: final,
        department: department ? { name: department.name, slug: department.slug } : null,
        paymentMethod,
        allowance: await getTestAllowance(input.email) ?? null,
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post('/api/cli/subscribe', cliAuth, async (req, res) => {
    try {
      const input = subscribeSchema.parse(req.body);
      const stripe = await requireTestModeStripe();

      const priceId = input.tier === 'pro_complainant'
        ? process.env.STRIPE_PRICE_PRO_COMPLAINANT
        : process.env.STRIPE_PRICE_REGISTERED_COMPLAINANT;
      if (!priceId) throw new HttpError(500, 'Subscription prices not configured');

      const existing = await storage.getSubscriptionByEmail(input.email);
      if (existing && existing.mode === 'test') {
        throw new HttpError(409, `${input.email} already has an active ${existing.tier} subscription.`);
      }

      await consumeUse(req);

      const customer = await stripe.customers.create({ email: input.email, metadata: { source: 'cli' } });
      const pm = await stripe.paymentMethods.create({ type: 'card', card: cardParams(input.testCard) });
      await stripe.paymentMethods.attach(pm.id, { customer: customer.id });
      await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: pm.id } });

      const stripeSub = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: priceId }],
        default_payment_method: pm.id,
        payment_behavior: 'error_if_incomplete', // declined / 3DS-required cards throw instead of leaving an incomplete sub
        metadata: { email: input.email, tier: input.tier, source: 'cli' },
      });
      if (stripeSub.status !== 'active' && stripeSub.status !== 'trialing') {
        throw new HttpError(402, `Subscription did not activate (status: ${stripeSub.status}).`);
      }

      if (!(await storage.getSubscriptionByStripeId(stripeSub.id))) {
        const item = stripeSub.items.data[0];
        await storage.createSubscription({
          customerEmail: input.email,
          stripeCustomerId: customer.id,
          stripeSubscriptionId: stripeSub.id,
          stripePriceId: item.price.id,
          tier: input.tier,
          status: 'active',
          mode: 'test',
          currentPeriodStart: new Date(item.current_period_start * 1000),
          currentPeriodEnd: new Date(item.current_period_end * 1000),
        });
      }

      res.status(201).json({ allowance: await getTestAllowance(input.email) });
    } catch (err) {
      sendError(res, err);
    }
  });
}
