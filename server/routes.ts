import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import OpenAI from "openai";
import { registerChatRoutes } from "./replit_integrations/chat";
import { registerImageRoutes } from "./replit_integrations/image";
import { registerAudioRoutes } from "./replit_integrations/audio";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";

// Initialize OpenAI client using the integration environment variables
const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Register the AI integration routes
  registerChatRoutes(app);
  registerImageRoutes(app);
  registerAudioRoutes(app);

  // === Complaints Routes ===

  app.post(api.complaints.create.path, async (req, res) => {
    try {
      const input = api.complaints.create.input.parse(req.body);
      const complaint = await storage.createComplaint(input);
      res.status(201).json(complaint);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.get(api.complaints.get.path, async (req, res) => {
    const complaint = await storage.getComplaint(Number(req.params.id));
    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found' });
    }
    res.json(complaint);
  });

  // === Stripe Routes ===

  app.get('/api/stripe/config', async (req, res) => {
    try {
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (err) {
      console.error('Error getting Stripe config:', err);
      res.status(500).json({ message: 'Failed to get Stripe configuration' });
    }
  });

  // Create embedded checkout session - form displays on the same page
  app.post('/api/stripe/create-checkout-session', async (req, res) => {
    try {
      const { complaintId } = req.body;
      
      if (!complaintId) {
        return res.status(400).json({ message: 'Complaint ID is required' });
      }

      const complaint = await storage.getComplaint(Number(complaintId));
      if (!complaint) {
        return res.status(404).json({ message: 'Complaint not found' });
      }

      if (complaint.status !== 'pending_payment') {
        return res.status(400).json({ message: 'Payment already processed for this complaint' });
      }

      const stripe = await getUncachableStripeClient();
      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;

      // Use embedded UI mode so checkout appears on-page
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'Complaint Filing Fee',
                description: `Administrative fee for processing complaint #${complaint.id}`,
              },
              unit_amount: complaint.filingFee, // 500 cents = $5.00
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        ui_mode: 'embedded',
        return_url: `${baseUrl}/status/${complaint.id}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        metadata: {
          complaintId: String(complaint.id),
          customerEmail: complaint.customerEmail,
        },
        customer_email: complaint.customerEmail,
      });

      res.json({ 
        clientSecret: session.client_secret,
      });
    } catch (err: any) {
      console.error('Error creating checkout session:', err);
      res.status(500).json({ message: err.message || 'Failed to create checkout session' });
    }
  });

  // === Verify Checkout Session (called from success page) ===
  // This is the primary source of truth for payment processing
  // Uses idempotency check to prevent double-processing
  
  app.post('/api/stripe/verify-session', async (req, res) => {
    try {
      const { sessionId, complaintId } = req.body;
      
      if (!sessionId || !complaintId) {
        return res.status(400).json({ message: 'Session ID and complaint ID are required' });
      }

      const complaint = await storage.getComplaint(Number(complaintId));
      if (!complaint) {
        return res.status(404).json({ message: 'Complaint not found' });
      }

      // IDEMPOTENCY CHECK: If already processed, just return success without any changes
      if (complaint.status !== 'pending_payment') {
        return res.json({ 
          verified: true,
          status: complaint.status,
          message: 'Payment already processed'
        });
      }

      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status === 'paid' && session.metadata?.complaintId === String(complaintId)) {
        // Process the successful payment with complete data
        const payment = await storage.createPayment({
          complaintId: Number(complaintId),
          amount: session.amount_total || 500,
        });

        // Update payment with transaction details
        await storage.updatePaymentByComplaintId(Number(complaintId), {
          status: 'succeeded',
          transactionId: (session.payment_intent as string) || session.id,
        });

        await storage.updateComplaint(Number(complaintId), { status: 'received' });
        
        // Trigger AI analysis
        generateBureaucraticResponse(Number(complaintId), complaint.content).catch(console.error);

        return res.json({ 
          verified: true,
          status: 'received',
          message: 'Payment verified successfully'
        });
      }

      return res.json({ 
        verified: false,
        status: session.payment_status,
        message: 'Payment not yet completed'
      });

    } catch (err: any) {
      console.error('Error verifying session:', err);
      res.status(500).json({ message: err.message || 'Failed to verify session' });
    }
  });

  // === Legacy Payment Route (kept for backwards compatibility but not used) ===

  app.post(api.payments.process.path, async (req, res) => {
    try {
      const { complaintId, paymentMethodId, cardLast4 } = api.payments.process.input.parse(req.body);
      
      const complaint = await storage.getComplaint(complaintId);
      if (!complaint) {
        return res.status(404).json({ message: 'Complaint not found' });
      }

      const amount = 500; // $5.00
      
      const payment = await storage.createPayment({
        complaintId,
        amount,
      });

      await storage.updateComplaint(complaintId, { status: "received" });

      generateBureaucraticResponse(complaintId, complaint.content).catch(console.error);

      res.json(payment);

    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid payment details",
          code: "validation_error"
        });
      }
      throw err;
    }
  });

  return httpServer;
}

// Helper to generate AI response - exported for webhook handler
export async function generateBureaucraticResponse(complaintId: number, content: string) {
  console.log(`[AI] Starting analysis for complaint #${complaintId}`);
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        {
          role: "system",
          content: `You are a highly bureaucratic government official at the Department of Complaints. 
          Your job is to analyze complaints and provide a response that is polite, formal, extremely verbose, and ultimately non-committal. 
          Use bureaucratic jargon like "stakeholder alignment," "procedural review," "bandwidth constraints," and "optimization vectors."
          
          You must also assign a "Complexity Score" from 1 to 10 based on how annoying or difficult this complaint seems.
          
          Return your response in JSON format with two fields:
          - responseText: The bureaucratic letter.
          - complexityScore: The integer score.`
        },
        {
          role: "user",
          content: `Complaint: "${content}"`
        }
      ],
      response_format: { type: "json_object" }
    });

    const contentString = response.choices[0].message.content || "{}";
    console.log(`[AI] Response for #${complaintId}:`, contentString);
    const aiResult = JSON.parse(contentString);
    
    await storage.updateComplaint(complaintId, {
      status: "resolved",
      aiResponse: aiResult.responseText || "Your complaint has been received and filed in the circular bin.",
      complexityScore: aiResult.complexityScore || 5
    });
    console.log(`[AI] Successfully resolved complaint #${complaintId}`);

  } catch (error) {
    console.error(`[AI] Error for #${complaintId}:`, error);
    await storage.updateComplaint(complaintId, {
      status: "resolved",
      aiResponse: "We acknowledge receipt of your correspondence. It is currently being routed through standard processing protocols. Expect a follow-up within 6-8 months.",
      complexityScore: 1
    });
  }
}
