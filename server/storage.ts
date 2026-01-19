import { db } from "./db";
import { complaints, payments, type Complaint, type InsertComplaint, type Payment, type InsertPayment } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  // Complaints
  createComplaint(complaint: InsertComplaint): Promise<Complaint>;
  getComplaint(id: number): Promise<Complaint | undefined>;
  updateComplaint(id: number, updates: Partial<Complaint>): Promise<Complaint>;
  
  // Payments
  createPayment(payment: InsertPayment): Promise<Payment>;
  getPaymentsByComplaintId(complaintId: number): Promise<Payment[]>;
}

export class DatabaseStorage implements IStorage {
  async createComplaint(insertComplaint: InsertComplaint): Promise<Complaint> {
    const [complaint] = await db.insert(complaints).values(insertComplaint).returning();
    return complaint;
  }

  async getComplaint(id: number): Promise<Complaint | undefined> {
    const [complaint] = await db.select().from(complaints).where(eq(complaints.id, id));
    return complaint;
  }

  async updateComplaint(id: number, updates: Partial<Complaint>): Promise<Complaint> {
    const [updated] = await db.update(complaints)
      .set(updates)
      .where(eq(complaints.id, id))
      .returning();
    return updated;
  }

  async createPayment(insertPayment: InsertPayment): Promise<Payment> {
    const [payment] = await db.insert(payments).values(insertPayment).returning();
    return payment;
  }

  async getPaymentsByComplaintId(complaintId: number): Promise<Payment[]> {
    return await db.select().from(payments).where(eq(payments.complaintId, complaintId));
  }
}

export const storage = new DatabaseStorage();
