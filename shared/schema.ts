import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Import Chat Models from Integration
export * from "./models/chat";

// === TABLE DEFINITIONS ===
export const complaints = pgTable("complaints", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  customerEmail: text("customer_email").notNull(),
  status: text("status", { enum: ["pending_payment", "received", "processing", "resolved"] }).default("pending_payment").notNull(),
  filingFee: integer("filing_fee").default(500).notNull(), // in cents, default $5.00
  aiResponse: text("ai_response"),
  complexityScore: integer("complexity_score"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  complaintId: integer("complaint_id").notNull(),
  amount: integer("amount").notNull(), // in cents
  status: text("status", { enum: ["pending", "succeeded", "failed"] }).default("pending").notNull(),
  transactionId: text("transaction_id"), // Mock transaction ID
  createdAt: timestamp("created_at").defaultNow(),
});

// === SCHEMAS ===
export const insertComplaintSchema = createInsertSchema(complaints).omit({ 
  id: true, 
  status: true, 
  filingFee: true, 
  aiResponse: true, 
  complexityScore: true, 
  createdAt: true 
}).extend({
  content: z.string().min(10, "Complaint must be at least 10 characters long. We need details."),
  customerEmail: z.string().email("Please provide a valid email for official correspondence."),
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  status: true,
  transactionId: true,
  createdAt: true
});

// === EXPLICIT API CONTRACT TYPES ===
export type Complaint = typeof complaints.$inferSelect;
export type InsertComplaint = z.infer<typeof insertComplaintSchema>;
export type Payment = typeof payments.$inferSelect;

export type CreateComplaintRequest = InsertComplaint;
export type ProcessPaymentRequest = {
  complaintId: number;
  paymentMethodId: string; // Mock payment method ID (e.g., "pm_card_visa")
};

export type ComplaintResponse = Complaint;
export type PaymentResponse = Payment;
