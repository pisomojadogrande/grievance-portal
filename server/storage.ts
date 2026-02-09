import { getDb } from "./db";
import { complaints, payments, type Complaint, type InsertComplaint, type Payment, type InsertPayment } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";

// Generate next ID for a table (DSQL doesn't support auto-increment)
async function getNextId(tableName: string): Promise<number> {
  const result = await getDb().execute(sql`
    SELECT COALESCE(MAX(id), 0) + 1 as next_id 
    FROM ${sql.identifier(tableName)}
  `);
  return (result.rows[0] as any).next_id;
}

export interface IStorage {
  // Complaints
  createComplaint(complaint: InsertComplaint): Promise<Complaint>;
  getComplaint(id: number): Promise<Complaint | undefined>;
  updateComplaint(id: number, updates: Partial<Complaint>): Promise<Complaint>;
  getAllComplaints(): Promise<Complaint[]>;
  getDailyComplaintStats(): Promise<{ date: string; count: number }[]>;
  
  // Payments
  createPayment(payment: InsertPayment): Promise<Payment>;
  getPaymentsByComplaintId(complaintId: number): Promise<Payment[]>;
  updatePaymentByComplaintId(complaintId: number, updates: Partial<Payment>): Promise<Payment | undefined>;
}

export class DatabaseStorage implements IStorage {
  async createComplaint(insertComplaint: InsertComplaint): Promise<Complaint> {
    const id = await getNextId('complaints');
    const [complaint] = await getDb().insert(complaints).values({ ...insertComplaint, id }).returning();
    return complaint;
  }

  async getComplaint(id: number): Promise<Complaint | undefined> {
    const [complaint] = await getDb().select().from(complaints).where(eq(complaints.id, id));
    return complaint;
  }

  async updateComplaint(id: number, updates: Partial<Complaint>): Promise<Complaint> {
    const [updated] = await getDb().update(complaints)
      .set(updates)
      .where(eq(complaints.id, id))
      .returning();
    return updated;
  }

  async createPayment(insertPayment: InsertPayment): Promise<Payment> {
    const id = await getNextId('payments');
    const [payment] = await getDb().insert(payments).values({ ...insertPayment, id }).returning();
    return payment;
  }

  async getPaymentsByComplaintId(complaintId: number): Promise<Payment[]> {
    return await getDb().select().from(payments).where(eq(payments.complaintId, complaintId));
  }

  async updatePaymentByComplaintId(complaintId: number, updates: Partial<Payment>): Promise<Payment | undefined> {
    const [updated] = await getDb().update(payments)
      .set(updates)
      .where(eq(payments.complaintId, complaintId))
      .returning();
    return updated;
  }

  async getAllComplaints(): Promise<Complaint[]> {
    return await getDb().select().from(complaints).orderBy(desc(complaints.createdAt));
  }

  async getDailyComplaintStats(): Promise<{ date: string; count: number }[]> {
    const result = await getDb().execute(sql`
      SELECT 
        DATE(created_at) as date,
        COUNT(*)::int as count
      FROM complaints
      WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);
    return result.rows as { date: string; count: number }[];
  }
}

export const storage = new DatabaseStorage();
