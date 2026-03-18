import { getUncachableStripeClient, getLiveStripeClient } from './stripeClient';
import { storage } from './storage';
import Stripe from 'stripe';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string, webhookSecret: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const stripe = await getUncachableStripeClient();
    
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      throw new Error(`Webhook Error: ${err.message}`);
    }

    console.log(`[Stripe Webhook] Received event: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.mode === 'subscription') {
          const email = session.metadata?.email;
          const tier = session.metadata?.tier as 'registered_complainant' | 'pro_complainant' | undefined;
          console.log(`[Stripe Webhook] Subscription checkout completed for ${email}`);

          if (email && tier && session.subscription) {
            const isLive = session.id.startsWith('cs_live_');
            const stripeForSub = isLive ? await getLiveStripeClient() : stripe;
            const stripeSub = await stripeForSub.subscriptions.retrieve(session.subscription as string);
            // Check idempotency
            const existing = await storage.getSubscriptionByStripeId(stripeSub.id);
            if (!existing) {
              const item = stripeSub.items.data[0];
              await storage.createSubscription({
                customerEmail: email,
                stripeCustomerId: session.customer as string,
                stripeSubscriptionId: stripeSub.id,
                stripePriceId: item.price.id,
                tier,
                status: stripeSub.status as any,
                mode: isLive ? 'live' : 'test',
                currentPeriodStart: new Date(item.current_period_start * 1000),
                currentPeriodEnd: new Date(item.current_period_end * 1000),
              });
              console.log(`[Stripe Webhook] Created subscription record for ${email}`);
            } else {
              console.log(`[Stripe Webhook] Subscription ${stripeSub.id} already exists, skipping`);
            }
          }
          break;
        }

        const complaintId = session.metadata?.complaintId;

        if (complaintId) {
          console.log(`[Stripe Webhook] Payment completed for complaint #${complaintId}`);

          // IDEMPOTENCY CHECK: Get the complaint and check if already processed
          const complaint = await storage.getComplaint(parseInt(complaintId));
          if (!complaint) {
            console.log(`[Stripe Webhook] Complaint #${complaintId} not found, skipping`);
            break;
          }

          // If already processed (by verify-session or previous webhook), skip
          if (complaint.status !== 'pending_payment') {
            console.log(`[Stripe Webhook] Complaint #${complaintId} already processed (status: ${complaint.status}), skipping`);
            break;
          }

          // Process the payment
          await storage.createPayment({
            complaintId: parseInt(complaintId),
            amount: session.amount_total || 500,
            mode: session.id.startsWith('cs_live_') ? 'live' : 'test',
          });

          await storage.updatePaymentByComplaintId(parseInt(complaintId), {
            status: 'succeeded',
            transactionId: (session.payment_intent as string) || session.id,
          });

          await storage.updateComplaint(parseInt(complaintId), { status: 'received' });

          // Trigger AI analysis — must be awaited: Lambda freezes on HTTP response, fire-and-forget won't complete
          const { generateBureaucraticResponse } = await import('./routes');
          await generateBureaucraticResponse(complaint.id, complaint.content);

          console.log(`[Stripe Webhook] Successfully processed payment for complaint #${complaintId}`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log(`[Stripe Webhook] Subscription updated: ${subscription.id}, status: ${subscription.status}`);
        const item = subscription.items.data[0];
        await storage.updateSubscriptionByStripeId(subscription.id, {
          status: subscription.status as any,
          currentPeriodStart: new Date(item.current_period_start * 1000),
          currentPeriodEnd: new Date(item.current_period_end * 1000),
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log(`[Stripe Webhook] Subscription canceled: ${subscription.id}`);
        await storage.updateSubscriptionByStripeId(subscription.id, { status: 'canceled' });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        console.warn(`[Stripe Webhook] Payment failed for customer ${invoice.customer}`);
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        const complaintId = session.metadata?.complaintId;
        if (complaintId) {
          console.log(`[Stripe Webhook] Checkout expired for complaint #${complaintId}`);
        }
        break;
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }
  }
}
