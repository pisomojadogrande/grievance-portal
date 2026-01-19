import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import OpenAI from "openai";
import { registerChatRoutes } from "./replit_integrations/chat";
import { registerImageRoutes } from "./replit_integrations/image";
import { registerAudioRoutes } from "./replit_integrations/audio";

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

  // === Payment Routes ===

  app.post(api.payments.process.path, async (req, res) => {
    try {
      const { complaintId, paymentMethodId, cardLast4 } = api.payments.process.input.parse(req.body);
      
      const complaint = await storage.getComplaint(complaintId);
      if (!complaint) {
        return res.status(404).json({ message: 'Complaint not found' });
      }

      // Simulate payment processing (always succeeds for this demo)
      // In a real app, this would verify with Stripe
      const amount = 500; // $5.00
      
      const payment = await storage.createPayment({
        complaintId,
        amount,
      });

      // Update complaint status
      await storage.updateComplaint(complaintId, { status: "received" });

      // Trigger Bureaucratic AI Analysis (Async)
      // We don't await this so the payment returns quickly
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

// Helper to generate AI response
async function generateBureaucraticResponse(complaintId: number, content: string) {
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

    const aiResult = JSON.parse(response.choices[0].message.content || "{}");
    
    await storage.updateComplaint(complaintId, {
      status: "resolved",
      aiResponse: aiResult.responseText || "Your complaint has been received and filed in the circular bin.",
      complexityScore: aiResult.complexityScore || 5
    });

  } catch (error) {
    console.error("AI Generation Error:", error);
    // Fallback if AI fails
    await storage.updateComplaint(complaintId, {
      status: "resolved",
      aiResponse: "We acknowledge receipt of your correspondence. It is currently being routed through standard processing protocols. Expect a follow-up within 6-8 months.",
      complexityScore: 1
    });
  }
}
