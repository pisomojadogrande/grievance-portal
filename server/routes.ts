import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { createChatCompletion } from "./aws/bedrock";
import { getUncachableStripeClient, getStripePublishableKey, getLiveStripeClient, getLiveStripePublishableKey } from "./stripeClient";
import { getParameter } from "./aws/ssm";
import { cognitoAuthMiddleware } from "./aws/cognito";
import { adminLoginSchema } from "@shared/schema";

// Temporary stub for authentication - will be replaced with Cognito
const isAuthenticated = (req: any, res: any, next: any) => {
  // TODO: Implement Cognito authentication
  req.user = { claims: { sub: 'temp-user-id', email: 'temp@example.com' } };
  next();
};

// Shared helper: validates the complaint, creates an embedded Stripe checkout session, returns clientSecret.
// Pass amount=null to use complaint.filingFee (test mode); pass an explicit cent value for live mode.
async function createEmbeddedCheckoutSession(
  stripe: Awaited<ReturnType<typeof import('./stripeClient').getUncachableStripeClient>>,
  complaintId: number | undefined,
  { amount, productName, label }: { amount: number | null; productName: string; label: string }
): Promise<string> {
  if (!complaintId) throw Object.assign(new Error('Complaint ID is required'), { statusCode: 400 });

  const complaint = await storage.getComplaint(Number(complaintId));
  if (!complaint) throw Object.assign(new Error('Complaint not found'), { statusCode: 404 });
  if (complaint.status !== 'pending_payment') {
    throw Object.assign(new Error('Payment already processed for this complaint'), { statusCode: 400 });
  }

  const frontendUrl = process.env.FRONTEND_URL || (await getParameter('/grievance-portal/frontend/url'));
  const baseUrl = frontendUrl || `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
  const unitAmount = amount ?? complaint.filingFee;

  console.log(`[Stripe][${label}] Creating checkout session for complaint #${complaintId}, amount: ${unitAmount} cents`);

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: productName,
          description: `Administrative fee for complaint #${complaintId}`,
        },
        unit_amount: unitAmount,
      },
      quantity: 1,
    }],
    mode: 'payment',
    ui_mode: 'embedded',
    return_url: `${baseUrl}/status/${complaintId}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
    metadata: { complaintId: String(complaintId), customerEmail: complaint.customerEmail },
    customer_email: complaint.customerEmail,
  });

  console.log(`[Stripe][${label}] Session created: ${session.id} for complaint #${complaintId}`);
  return session.client_secret!;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // === Health Check ===
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

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
    } catch (err: any) {
      console.error('[Stripe][Test] Failed to get config:', err.message);
      res.status(500).json({ message: 'Failed to get Stripe configuration' });
    }
  });

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

  app.post('/api/stripe/create-checkout-session', async (req, res) => {
    try {
      const { complaintId } = req.body;
      const stripe = await getUncachableStripeClient();
      const clientSecret = await createEmbeddedCheckoutSession(stripe, complaintId, {
        amount: null, // use complaint.filingFee
        productName: 'Complaint Filing Fee',
        label: 'Test',
      });
      res.json({ clientSecret });
    } catch (err: any) {
      console.error('[Stripe][Test] Error creating checkout session:', {
        message: err.message, type: err.type, code: err.code, statusCode: err.statusCode,
      });
      res.status(err.statusCode || 500).json({ message: err.message || 'Failed to create checkout session' });
    }
  });

  app.post('/api/stripe/create-live-checkout-session', async (req, res) => {
    try {
      const { complaintId } = req.body;
      const stripe = getLiveStripeClient();
      const clientSecret = await createEmbeddedCheckoutSession(stripe, complaintId, {
        amount: 50, // $0.50
        productName: 'Complaint Filing Fee (Real)',
        label: 'Live',
      });
      res.json({ clientSecret });
    } catch (err: any) {
      console.error(`[Stripe][Live] Error creating checkout session:`, {
        message: err.message, type: err.type, code: err.code, statusCode: err.statusCode,
      });
      res.status(err.statusCode || 500).json({ message: err.message || 'Failed to create live checkout session' });
    }
  });

  app.get('/api/complaints/:id/payment', async (req, res) => {
    const payments = await storage.getPaymentsByComplaintId(Number(req.params.id));
    if (!payments.length) return res.status(404).json({ message: 'Payment not found' });
    res.json(payments[0]);
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

      const isLiveSession = sessionId.startsWith('cs_live_');
      console.log(`[Stripe][${isLiveSession ? 'Live' : 'Test'}] Verifying session ${sessionId} for complaint #${complaintId}`);
      const stripe = isLiveSession ? getLiveStripeClient() : await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status === 'paid' && session.metadata?.complaintId === String(complaintId)) {
        // Process the successful payment with complete data
        const payment = await storage.createPayment({
          complaintId: Number(complaintId),
          amount: session.amount_total || 500,
          mode: isLiveSession ? 'live' : 'test',
        });

        // Update payment with transaction details
        await storage.updatePaymentByComplaintId(Number(complaintId), {
          status: 'succeeded',
          transactionId: (session.payment_intent as string) || session.id,
        });

        await storage.updateComplaint(Number(complaintId), { status: 'received' });

        // Run AI analysis synchronously - Lambda freezes after response, so fire-and-forget doesn't work
        await generateBureaucraticResponse(Number(complaintId), complaint.content);

        return res.json({
          verified: true,
          status: 'resolved',
          message: 'Payment verified successfully'
        });
      }

      return res.json({ 
        verified: false,
        status: session.payment_status,
        message: 'Payment not yet completed'
      });

    } catch (err: any) {
      console.error('Error verifying session:', {
        message: err.message,
        type: err.type,
        code: err.code,
        statusCode: err.statusCode,
        raw: err.raw,
      });
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

  // === Subscription Routes ===

  app.get('/api/subscriptions/status', async (req, res) => {
    try {
      const email = req.query.email as string;
      if (!email) return res.status(400).json({ message: 'email query param is required' });

      const sub = await storage.getSubscriptionByEmail(email);
      if (!sub) return res.json({ active: false });

      const complaintsUsed = await storage.countComplaintsInPeriod(email, sub.currentPeriodStart);
      const complaintsAllowed = sub.tier === 'pro_complainant' ? null : 3;

      res.json({
        active: true,
        tier: sub.tier,
        complaintsUsed,
        complaintsAllowed,
        currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
      });
    } catch (err: any) {
      console.error('[Subscriptions] Error fetching status:', err.message);
      res.status(500).json({ message: 'Failed to fetch subscription status' });
    }
  });

  app.post('/api/subscriptions/create-checkout-session', async (req, res) => {
    try {
      const { email, tier } = req.body;
      if (!email || !tier) return res.status(400).json({ message: 'email and tier are required' });
      if (!['registered_complainant', 'pro_complainant'].includes(tier)) {
        return res.status(400).json({ message: 'Invalid tier' });
      }

      const priceId = tier === 'pro_complainant'
        ? process.env.STRIPE_PRICE_PRO_COMPLAINANT
        : process.env.STRIPE_PRICE_REGISTERED_COMPLAINANT;

      if (!priceId) return res.status(500).json({ message: 'Subscription prices not configured' });

      const stripe = await getUncachableStripeClient();
      const frontendUrl = process.env.FRONTEND_URL || (await getParameter('/grievance-portal/frontend/url'));
      const baseUrl = frontendUrl || `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'subscription',
        ui_mode: 'embedded',
        return_url: `${baseUrl}/subscription/confirmation?session_id={CHECKOUT_SESSION_ID}`,
        customer_email: email,
        metadata: { email, tier },
      });

      res.json({ clientSecret: session.client_secret });
    } catch (err: any) {
      console.error('[Subscriptions] Error creating checkout session:', err.message);
      res.status(err.statusCode || 500).json({ message: err.message || 'Failed to create subscription session' });
    }
  });

  app.post('/api/subscriptions/create-live-checkout-session', async (req, res) => {
    try {
      const { email, tier } = req.body;
      if (!email || !tier) return res.status(400).json({ message: 'email and tier are required' });
      if (!['registered_complainant', 'pro_complainant'].includes(tier)) {
        return res.status(400).json({ message: 'Invalid tier' });
      }

      const priceId = tier === 'pro_complainant'
        ? process.env.STRIPE_LIVE_PRICE_PRO_COMPLAINANT
        : process.env.STRIPE_LIVE_PRICE_REGISTERED_COMPLAINANT;

      if (!priceId) return res.status(500).json({ message: 'Live subscription prices not configured' });

      const stripe = await getLiveStripeClient();
      const frontendUrl = process.env.FRONTEND_URL || (await getParameter('/grievance-portal/frontend/url'));
      const baseUrl = frontendUrl || `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'subscription',
        ui_mode: 'embedded',
        return_url: `${baseUrl}/subscription/confirmation?session_id={CHECKOUT_SESSION_ID}`,
        customer_email: email,
        metadata: { email, tier },
      });

      res.json({ clientSecret: session.client_secret });
    } catch (err: any) {
      console.error('[Subscriptions] Error creating live checkout session:', err.message);
      res.status(err.statusCode || 500).json({ message: err.message || 'Failed to create live subscription session' });
    }
  });

  app.post('/api/subscriptions/use-complaint', async (req, res) => {
    try {
      const { complaintId, email } = req.body;
      if (!complaintId || !email) return res.status(400).json({ message: 'complaintId and email are required' });

      const complaint = await storage.getComplaint(Number(complaintId));
      if (!complaint) return res.status(404).json({ message: 'Complaint not found' });
      if (complaint.customerEmail !== email) return res.status(403).json({ message: 'Email does not match complaint' });
      if (complaint.status !== 'pending_payment') return res.status(400).json({ message: 'Complaint already processed' });

      const sub = await storage.getSubscriptionByEmail(email);
      if (!sub) return res.status(403).json({ message: 'No active subscription' });

      if (sub.tier === 'registered_complainant') {
        const used = await storage.countComplaintsInPeriod(email, sub.currentPeriodStart);
        if (used >= 3) return res.status(403).json({ message: 'Monthly allowance exhausted' });
      }

      await storage.updateComplaint(Number(complaintId), { status: 'received' });
      await generateBureaucraticResponse(Number(complaintId), complaint.content);

      res.json({ success: true });
    } catch (err: any) {
      console.error('[Subscriptions] Error using complaint allowance:', err.message);
      res.status(500).json({ message: err.message || 'Failed to process subscription complaint' });
    }
  });

  app.post('/api/subscriptions/customer-portal', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: 'email is required' });

      const sub = await storage.getSubscriptionByEmail(email);
      if (!sub) return res.status(404).json({ message: 'No active subscription found' });

      const stripe = await getUncachableStripeClient();
      const frontendUrl = process.env.FRONTEND_URL || (await getParameter('/grievance-portal/frontend/url'));
      const baseUrl = frontendUrl || `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: sub.stripeCustomerId,
        return_url: `${baseUrl}/`,
      });

      res.json({ url: portalSession.url });
    } catch (err: any) {
      console.error('[Subscriptions] Error creating portal session:', err.message);
      res.status(500).json({ message: err.message || 'Failed to create customer portal session' });
    }
  });

  // === Admin Routes ===

  app.get('/api/admin/complaints', cognitoAuthMiddleware, async (req, res) => {
    try {
      const complaints = await storage.getAllComplaints();
      res.json(complaints);
    } catch (err) {
      console.error('Error fetching complaints:', err);
      res.status(500).json({ message: 'Failed to fetch complaints' });
    }
  });

  app.get('/api/admin/stats/daily', cognitoAuthMiddleware, async (req, res) => {
    try {
      const stats = await storage.getDailyComplaintStats();
      res.json(stats);
    } catch (err) {
      console.error('Error fetching daily stats:', err);
      res.status(500).json({ message: 'Failed to fetch stats' });
    }
  });

  // === Cognito Admin Auth Routes ===

  // Login with Cognito
  app.post('/api/admin/login', async (req: any, res) => {
    try {
      const input = adminLoginSchema.parse(req.body);
      const { authenticateWithCognito } = await import('./aws/cognito.js');
      
      const authResult = await authenticateWithCognito(input.email, input.password);
      
      if (!authResult || !authResult.IdToken) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }
      
      res.json({ 
        success: true, 
        email: input.email,
        idToken: authResult.IdToken,
        accessToken: authResult.AccessToken,
        refreshToken: authResult.RefreshToken
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error('Login error:', err);
      res.status(401).json({ message: 'Invalid email or password' });
    }
  });

  // Check auth status (Cognito JWT)
  app.get('/api/admin/auth-status', async (req: any, res) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.json({ authenticated: false });
    }

    const token = authHeader.substring(7);
    
    try {
      const { verifyCognitoToken } = await import('./aws/cognito.js');
      const decoded = await verifyCognitoToken(token);
      
      res.json({ 
        authenticated: true, 
        authType: 'cognito',
        email: decoded.email,
        isAdmin: true
      });
    } catch (err) {
      res.json({ authenticated: false });
    }
  });

  return httpServer;
}

// Helper to generate AI response - exported for webhook handler
export async function generateBureaucraticResponse(complaintId: number, content: string) {
  console.log(`[AI] Starting analysis for complaint #${complaintId}`);
  const startTime = Date.now();
  
  try {
    const systemPrompt = `You are a highly bureaucratic government official at the Department of Complaints. 
Your job is to analyze complaints and provide a response that is polite, formal, extremely verbose, and ultimately non-committal. 
Use bureaucratic jargon like "stakeholder alignment," "procedural review," "bandwidth constraints," and "optimization vectors."

You must also assign a "Complexity Score" from 1 to 10 based on how annoying or difficult this complaint seems.

IMPORTANT: When signing the letter, use an officious title but DO NOT use placeholder names like [Your Name]. 
Either omit the name entirely or use a generic bureaucratic title like "Senior Complaint Analysis Officer" or "Chief Processing Administrator".

Return your response in JSON format with two fields:
- responseText: The bureaucratic letter.
- complexityScore: The integer score.`;

    const userPrompt = `Complaint: "${content}"`;
    
    const responseText = await createChatCompletion({
      messages: [
        { role: 'user', content: `${systemPrompt}\n\n${userPrompt}` }
      ],
      max_tokens: 4096,
      temperature: 1.0,
    });

    const duration = Date.now() - startTime;
    console.log(`[AI] Bedrock inference took ${duration}ms for complaint #${complaintId}`);
    console.log(`[AI] Response for #${complaintId}:`, responseText);
    
    // Strip any preamble text before JSON
    let cleanedResponse = responseText.trim();
    const jsonStart = cleanedResponse.indexOf('{');
    if (jsonStart > 0) {
      cleanedResponse = cleanedResponse.substring(jsonStart);
    }
    
    // Strip markdown code fences if present
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    // Strip any trailing content after the closing brace
    const jsonEnd = cleanedResponse.lastIndexOf('}');
    if (jsonEnd !== -1) {
      cleanedResponse = cleanedResponse.substring(0, jsonEnd + 1);
    }
    
    // Parse with lenient handling - replace literal newlines with \n
    try {
      const aiResult = JSON.parse(cleanedResponse);
      
      await storage.updateComplaint(complaintId, {
        status: "resolved",
        aiResponse: aiResult.responseText || "Your complaint has been received and filed in the circular bin.",
        complexityScore: aiResult.complexityScore || 5
      });
      console.log(`[AI] Successfully resolved complaint #${complaintId}`);
    } catch (parseError) {
      console.log(`[AI] First parse failed, trying to fix newlines...`);
      // Try fixing newlines in JSON strings
      const fixed = cleanedResponse.replace(/"responseText":\s*"([^"]*)"/g, (match, content) => {
        const escaped = content.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
        return `"responseText": "${escaped}"`;
      });
      const aiResult = JSON.parse(fixed);
      
      await storage.updateComplaint(complaintId, {
        status: "resolved",
        aiResponse: aiResult.responseText || "Your complaint has been received and filed in the circular bin.",
        complexityScore: aiResult.complexityScore || 5
      });
      console.log(`[AI] Successfully resolved complaint #${complaintId} after fixing newlines`);
    }
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
