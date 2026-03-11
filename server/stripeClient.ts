import Stripe from 'stripe';

function getCredentials() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  
  if (!secretKey || !publishableKey) {
    throw new Error('STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY must be set');
  }

  return { publishableKey, secretKey };
}

export async function getUncachableStripeClient() {
  const { secretKey } = getCredentials();

  return new Stripe(secretKey, {
    apiVersion: '2025-11-17.clover',
  });
}

export async function getStripePublishableKey() {
  const { publishableKey } = getCredentials();
  return publishableKey;
}

export async function getStripeSecretKey() {
  const { secretKey } = getCredentials();
  return secretKey;
}

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
