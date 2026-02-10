import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { createChatCompletion } from "./aws/bedrock";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { getParameter } from "./aws/ssm";
import { isAdmin, isAdminAuthenticated, getOrCreateFirstAdmin, isUserAdmin, isAdminById, createAdminWithPassword, authenticateAdmin, getAllAdmins, isFirstAdmin, resetAdminPassword, deleteAdmin } from "./adminMiddleware";
import { createAdminSchema, adminLoginSchema, resetAdminPasswordSchema } from "@shared/schema";

// Temporary stub for authentication - will be replaced with Cognito
const isAuthenticated = (req: any, res: any, next: any) => {
  // TODO: Implement Cognito authentication
  req.user = { claims: { sub: 'temp-user-id', email: 'temp@example.com' } };
  next();
};

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
      
      // Get frontend URL from SSM parameter (CloudFront URL)
      const frontendUrl = process.env.FRONTEND_URL || (await getParameter('/grievance-portal/frontend/url'));
      const baseUrl = frontendUrl || `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;

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

  // === Admin Routes ===

  app.get('/api/admin/check', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const email = req.user.claims.email || '';
      
      const isFirstAdmin = await getOrCreateFirstAdmin(userId, email);
      const adminStatus = await isUserAdmin(userId);
      
      res.json({ 
        isAdmin: adminStatus,
        wasFirstAdmin: isFirstAdmin && adminStatus
      });
    } catch (err) {
      console.error('Error checking admin status:', err);
      res.status(500).json({ message: 'Failed to check admin status' });
    }
  });

  app.get('/api/admin/complaints', isAdminAuthenticated, isAdmin, async (req, res) => {
    try {
      const complaints = await storage.getAllComplaints();
      res.json(complaints);
    } catch (err) {
      console.error('Error fetching complaints:', err);
      res.status(500).json({ message: 'Failed to fetch complaints' });
    }
  });

  app.get('/api/admin/stats/daily', isAdminAuthenticated, isAdmin, async (req, res) => {
    try {
      const stats = await storage.getDailyComplaintStats();
      res.json(stats);
    } catch (err) {
      console.error('Error fetching daily stats:', err);
      res.status(500).json({ message: 'Failed to fetch stats' });
    }
  });

  // === Password-based Admin Auth Routes ===

  // Login with email/password
  app.post('/api/admin/login', async (req: any, res) => {
    try {
      const input = adminLoginSchema.parse(req.body);
      const admin = await authenticateAdmin(input.email, input.password);
      
      if (!admin) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }
      
      // Regenerate session for security (prevent session fixation)
      req.session.regenerate((err: any) => {
        if (err) {
          console.error('Session regeneration error:', err);
          // Continue anyway - set session fields
        }
        
        // Set session
        req.session.adminId = admin.id;
        req.session.adminEmail = admin.email;
        
        res.json({ success: true, email: admin.email });
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error('Login error:', err);
      res.status(500).json({ message: 'Login failed' });
    }
  });

  // Logout (password-based session) - properly destroy session
  app.post('/api/admin/logout', (req: any, res) => {
    req.session.destroy((err: any) => {
      if (err) {
        console.error('Session destroy error:', err);
        // Fall back to clearing fields
        req.session.adminId = null;
        req.session.adminEmail = null;
      }
      res.json({ success: true });
    });
  });

  // Check auth status (works for both Replit Auth and password auth)
  app.get('/api/admin/auth-status', async (req: any, res) => {
    // Check password-based session first - validate against DB
    if (req.session?.adminId) {
      const adminValid = await isAdminById(req.session.adminId);
      if (adminValid) {
        const isPrimary = await isFirstAdmin(req.session.adminId);
        return res.json({ 
          authenticated: true, 
          authType: 'password',
          email: req.session.adminEmail,
          isAdmin: true,
          isFirstAdmin: isPrimary
        });
      } else {
        // Invalid session - clear it
        req.session.adminId = null;
        req.session.adminEmail = null;
      }
    }
    
    // Check Replit Auth
    if (req.isAuthenticated?.() && req.user?.claims?.sub) {
      const userId = req.user.claims.sub;
      const email = req.user.claims.email || '';
      
      // Auto-create first admin if none exist
      await getOrCreateFirstAdmin(userId, email);
      const adminStatus = await isUserAdmin(userId);
      
      // Get admin ID to check if first admin
      const { getDb } = await import('./db');
      const { adminUsers } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');
      const [adminUser] = await getDb().select().from(adminUsers).where(eq(adminUsers.userId, userId));
      const isPrimary = adminUser ? await isFirstAdmin(adminUser.id) : false;
      
      return res.json({ 
        authenticated: true, 
        authType: 'replit',
        email: email,
        isAdmin: adminStatus,
        isFirstAdmin: isPrimary
      });
    }
    
    res.json({ authenticated: false, isAdmin: false, isFirstAdmin: false });
  });

  // Create new admin user (only the first/primary admin can do this)
  app.post('/api/admin/users', isAdminAuthenticated, isAdmin, async (req: any, res) => {
    try {
      // Get the current admin's ID
      let currentAdminId: number | null = null;
      
      if (req.session?.adminId) {
        currentAdminId = req.session.adminId;
      } else if (req.adminUser?.id) {
        currentAdminId = req.adminUser.id;
      }
      
      // Only the first admin can create other admins
      if (!currentAdminId || !(await isFirstAdmin(currentAdminId))) {
        return res.status(403).json({ message: 'Only the primary administrator can add other admins' });
      }
      
      const input = createAdminSchema.parse(req.body);
      const newAdmin = await createAdminWithPassword(input.email, input.password);
      res.status(201).json({ id: newAdmin.id, email: newAdmin.email });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      // Check for duplicate email
      if (err.code === '23505') {
        return res.status(400).json({ message: 'An admin with this email already exists' });
      }
      console.error('Error creating admin:', err);
      res.status(500).json({ message: 'Failed to create admin user' });
    }
  });

  // Get all admin users (for admin management)
  app.get('/api/admin/users', isAdminAuthenticated, isAdmin, async (req, res) => {
    try {
      const admins = await getAllAdmins();
      res.json(admins);
    } catch (err) {
      console.error('Error fetching admins:', err);
      res.status(500).json({ message: 'Failed to fetch admin users' });
    }
  });

  // Reset admin password (only first admin can do this)
  app.patch('/api/admin/users/:id/password', isAdminAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const targetAdminId = Number(req.params.id);
      
      // Get the current admin's ID
      let currentAdminId: number | null = null;
      if (req.session?.adminId) {
        currentAdminId = req.session.adminId;
      } else if (req.adminUser?.id) {
        currentAdminId = req.adminUser.id;
      }
      
      // Only the first admin can reset passwords
      if (!currentAdminId || !(await isFirstAdmin(currentAdminId))) {
        return res.status(403).json({ message: 'Only the primary administrator can reset passwords' });
      }
      
      // Cannot reset password of the first admin (they should use their own method)
      if (await isFirstAdmin(targetAdminId)) {
        return res.status(403).json({ message: 'Cannot reset password of the primary administrator' });
      }
      
      const input = resetAdminPasswordSchema.parse(req.body);
      const success = await resetAdminPassword(targetAdminId, input.password);
      
      if (!success) {
        return res.status(404).json({ message: 'Admin user not found' });
      }
      
      res.json({ message: 'Password reset successfully' });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error('Error resetting admin password:', err);
      res.status(500).json({ message: 'Failed to reset password' });
    }
  });

  // Delete admin user (only first admin can do this)
  app.delete('/api/admin/users/:id', isAdminAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const targetAdminId = Number(req.params.id);
      
      // Get the current admin's ID
      let currentAdminId: number | null = null;
      if (req.session?.adminId) {
        currentAdminId = req.session.adminId;
      } else if (req.adminUser?.id) {
        currentAdminId = req.adminUser.id;
      }
      
      // Only the first admin can delete other admins
      if (!currentAdminId || !(await isFirstAdmin(currentAdminId))) {
        return res.status(403).json({ message: 'Only the primary administrator can delete admins' });
      }
      
      // Cannot delete the first admin
      if (await isFirstAdmin(targetAdminId)) {
        return res.status(403).json({ message: 'Cannot delete the primary administrator' });
      }
      
      const success = await deleteAdmin(targetAdminId);
      
      if (!success) {
        return res.status(404).json({ message: 'Admin user not found' });
      }
      
      res.json({ message: 'Admin user deleted successfully' });
    } catch (err) {
      console.error('Error deleting admin:', err);
      res.status(500).json({ message: 'Failed to delete admin user' });
    }
  });

  return httpServer;
}

// Helper to generate AI response - exported for webhook handler
export async function generateBureaucraticResponse(complaintId: number, content: string) {
  console.log(`[AI] Starting analysis for complaint #${complaintId}`);
  try {
    const systemPrompt = `You are a highly bureaucratic government official at the Department of Complaints. Your job is to analyze complaints and provide extremely verbose, formal, multi-paragraph responses that are polite yet ultimately non-committal and unactionable.

CRITICAL REQUIREMENTS:
- Write 4-8 substantial paragraphs (minimum 300 words total)
- Use extensive bureaucratic jargon: "stakeholder alignment," "procedural review," "bandwidth constraints," "optimization vectors," "multi-tiered assessment," "cross-functional consultation," "non-binding recommendations"
- Acknowledge the complaint in exhaustive detail
- Explain multiple procedural steps that will be taken (all non-committal)
- Offer theoretical suggestions that require no action from the Department
- Conclude by thanking them while making it clear nothing will actually be done
- Maintain a tone that is simultaneously sympathetic and completely unhelpful
- Assign a "Complexity Score" from 1 to 10 based on how annoying or difficult this complaint seems

STYLE EXAMPLES:
- "At the outset, please be assured that..."
- "Subject to bandwidth constraints and prioritization matrices..."
- "While we are not positioned at this time to..."
- "Your feedback will be incorporated into our ongoing, multi-phase procedural review..."
- "No further action is required on your part at this time..."

CRITICAL: Return ONLY valid JSON with properly escaped strings. Use \\n for newlines within the responseText string.

Return your response in JSON format with two fields:
- responseText: The bureaucratic letter (4-8 paragraphs, very verbose, with \\n for paragraph breaks)
- complexityScore: The integer score (1-10)`;

    const userPrompt = `Complaint: "${content}"`;
    
    const responseText = await createChatCompletion({
      messages: [
        { role: 'user', content: `${systemPrompt}\n\n${userPrompt}` }
      ],
      max_tokens: 4096,
      temperature: 1.0,
    });

    console.log(`[AI] Response for #${complaintId}:`, responseText);
    
    // Strip markdown code fences if present
    let cleanedResponse = responseText.trim();
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    const aiResult = JSON.parse(cleanedResponse);
    
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
