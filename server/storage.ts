import { getDb } from "./db";
import { complaints, payments, subscriptions, departments, type Complaint, type InsertComplaint, type Payment, type InsertPayment, type Subscription, type InsertSubscription, type Department, type InsertDepartment } from "@shared/schema";
import { eq, desc, sql, and, gte, inArray, isNotNull } from "drizzle-orm";

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

  // Subscriptions
  createSubscription(sub: InsertSubscription): Promise<Subscription>;
  getSubscriptionByEmail(email: string): Promise<Subscription | undefined>;
  getSubscriptionByStripeId(stripeSubscriptionId: string): Promise<Subscription | undefined>;
  updateSubscriptionByStripeId(stripeSubscriptionId: string, updates: Partial<Subscription>): Promise<Subscription | undefined>;
  countComplaintsInPeriod(email: string, periodStart: Date): Promise<number>;

  // Departments
  createDepartment(dept: InsertDepartment): Promise<Department>;
  getDepartmentById(id: number): Promise<Department | undefined>;
  getDepartmentBySlug(slug: string): Promise<Department | undefined>;
  getDepartmentByStripeAccountId(accountId: string): Promise<Department | undefined>;
  updateDepartment(id: number, updates: Partial<Department>): Promise<Department>;
  getActiveDepartments(): Promise<Department[]>;
  getComplaintsByDepartmentId(departmentId: number): Promise<Complaint[]>;
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

  async createSubscription(sub: InsertSubscription): Promise<Subscription> {
    const id = await getNextId('subscriptions');
    const [subscription] = await getDb().insert(subscriptions).values({ ...sub, id }).returning();
    return subscription;
  }

  async getSubscriptionByEmail(email: string): Promise<Subscription | undefined> {
    const [subscription] = await getDb().select().from(subscriptions)
      .where(and(eq(subscriptions.customerEmail, email), eq(subscriptions.status, 'active')))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    return subscription;
  }

  async getSubscriptionByStripeId(stripeSubscriptionId: string): Promise<Subscription | undefined> {
    const [subscription] = await getDb().select().from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId));
    return subscription;
  }

  async updateSubscriptionByStripeId(stripeSubscriptionId: string, updates: Partial<Subscription>): Promise<Subscription | undefined> {
    const [updated] = await getDb().update(subscriptions)
      .set(updates)
      .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
      .returning();
    return updated;
  }

  async countComplaintsInPeriod(email: string, periodStart: Date): Promise<number> {
    const result = await getDb().select({ count: sql<number>`COUNT(*)::int` })
      .from(complaints)
      .where(and(
        eq(complaints.customerEmail, email),
        inArray(complaints.status, ['received', 'processing', 'resolved']),
        gte(complaints.createdAt, periodStart),
      ));
    return result[0]?.count ?? 0;
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

  async createDepartment(dept: InsertDepartment): Promise<Department> {
    const id = await getNextId('departments');
    const [department] = await getDb().insert(departments).values({ ...dept, id }).returning();
    return department;
  }

  async getDepartmentById(id: number): Promise<Department | undefined> {
    const [dept] = await getDb().select().from(departments).where(eq(departments.id, id));
    return dept;
  }

  async getDepartmentBySlug(slug: string): Promise<Department | undefined> {
    const [dept] = await getDb().select().from(departments).where(eq(departments.slug, slug));
    return dept;
  }

  async getDepartmentByStripeAccountId(accountId: string): Promise<Department | undefined> {
    const [dept] = await getDb().select().from(departments).where(eq(departments.stripeAccountId, accountId));
    return dept;
  }

  async updateDepartment(id: number, updates: Partial<Department>): Promise<Department> {
    const [updated] = await getDb().update(departments)
      .set(updates)
      .where(eq(departments.id, id))
      .returning();
    return updated;
  }

  async getActiveDepartments(): Promise<Department[]> {
    return await getDb().select().from(departments).where(isNotNull(departments.stripeAccountId));
  }

  async getComplaintsByDepartmentId(departmentId: number): Promise<Complaint[]> {
    return await getDb().select().from(complaints)
      .where(eq(complaints.departmentId, departmentId))
      .orderBy(desc(complaints.createdAt));
  }
}

export const storage = new DatabaseStorage();
