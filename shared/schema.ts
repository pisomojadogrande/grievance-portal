import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Import Chat Models from Integration
export * from "./models/chat";

// Import Auth Models from Integration (REQUIRED for Replit Auth)
export * from "./models/auth";

// Admin users table - tracks which users have admin access
// Supports both Replit Auth (userId) and email/password auth (passwordHash)
export const adminUsers = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  userId: text("user_id").unique(), // For Replit Auth users (nullable for password-based admins)
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"), // For email/password admins (nullable for Replit Auth admins)
  createdAt: timestamp("created_at").defaultNow(),
});

export type AdminUser = typeof adminUsers.$inferSelect;

// Schema for creating a new admin user with password
export const createAdminSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type CreateAdminRequest = z.infer<typeof createAdminSchema>;

// Schema for admin login
export const adminLoginSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(1, "Password required"),
});

export type AdminLoginRequest = z.infer<typeof adminLoginSchema>;

// Schema for resetting admin password
export const resetAdminPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type ResetAdminPasswordRequest = z.infer<typeof resetAdminPasswordSchema>;

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
export type InsertPayment = z.infer<typeof insertPaymentSchema>;

export type CreateComplaintRequest = InsertComplaint;
export type ProcessPaymentRequest = {
  complaintId: number;
  paymentMethodId: string; // Mock payment method ID (e.g., "pm_card_visa")
};

export type ComplaintResponse = Complaint;
export type PaymentResponse = Payment;
