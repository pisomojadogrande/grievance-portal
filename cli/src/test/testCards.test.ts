import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isStripeTestCard, STRIPE_TEST_CARD_NUMBERS } from '../testCards.js';

test('accepts documented test cards, with spaces/dashes', () => {
  assert.ok(isStripeTestCard('4242424242424242'));
  assert.ok(isStripeTestCard('4242 4242 4242 4242'));
  assert.ok(isStripeTestCard('4000-0000-0000-0002'));
  assert.ok(isStripeTestCard('378282246310005'));
});

test('rejects real-looking and malformed numbers', () => {
  assert.ok(!isStripeTestCard('4111111111111111'));
  assert.ok(!isStripeTestCard('5555555555554445'));
  assert.ok(!isStripeTestCard(''));
  assert.ok(!isStripeTestCard('4242424242424242abc'));
  assert.ok(!isStripeTestCard('pm_card_visa'));
});

test('every allowlisted number is 14-19 digits', () => {
  for (const n of STRIPE_TEST_CARD_NUMBERS) assert.match(n, /^\d{14,19}$/);
});
