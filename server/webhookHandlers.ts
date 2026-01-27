import { getUncachableStripeClient } from './stripeClient';
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
          });

          await storage.updatePaymentByComplaintId(parseInt(complaintId), {
            status: 'succeeded',
            transactionId: (session.payment_intent as string) || session.id,
          });

          await storage.updateComplaint(parseInt(complaintId), { status: 'received' });
          
          // Trigger AI analysis
          const { generateBureaucraticResponse } = await import('./routes');
          generateBureaucraticResponse(complaint.id, complaint.content).catch(console.error);
          
          console.log(`[Stripe Webhook] Successfully processed payment for complaint #${complaintId}`);
        }
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
