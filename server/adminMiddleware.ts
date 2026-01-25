import type { RequestHandler } from "express";
import { db } from "./db";
import { adminUsers } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

// Middleware to check if user is admin (supports both Replit Auth and password-based auth)
export const isAdmin: RequestHandler = async (req: any, res, next) => {
  // Check session-based admin auth first (password-authenticated admins)
  if (req.session?.adminId) {
    const [adminUser] = await db.select().from(adminUsers).where(eq(adminUsers.id, req.session.adminId));
    if (adminUser) {
      req.adminUser = adminUser;
      return next();
    }
  }

  // Check Replit Auth
  const user = req.user as any;
  if (req.isAuthenticated?.() && user?.claims?.sub) {
    const userId = user.claims.sub;
    const [adminUser] = await db.select().from(adminUsers).where(eq(adminUsers.userId, userId));
    if (adminUser) {
      req.adminUser = adminUser;
      return next();
    }
  }

  return res.status(403).json({ message: "Forbidden: Admin access required" });
};

// Middleware to check if user is authenticated (either Replit Auth or password session)
export const isAdminAuthenticated: RequestHandler = async (req: any, res, next) => {
  // Check session-based admin auth
  if (req.session?.adminId) {
    const [adminUser] = await db.select().from(adminUsers).where(eq(adminUsers.id, req.session.adminId));
    if (adminUser) {
      req.adminUser = adminUser;
      return next();
    }
  }

  // Check Replit Auth
  if (req.isAuthenticated?.() && req.user?.claims?.sub) {
    return next();
  }

  return res.status(401).json({ message: "Unauthorized" });
};

// Get or create the first admin (Replit Auth flow)
export async function getOrCreateFirstAdmin(userId: string, email: string): Promise<boolean> {
  const existingAdmins = await db.select().from(adminUsers);
  
  if (existingAdmins.length === 0) {
    await db.insert(adminUsers).values({ userId, email });
    return true;
  }
  
  return existingAdmins.some(admin => admin.userId === userId);
}

// Check if user is admin by Replit userId
export async function isUserAdmin(userId: string): Promise<boolean> {
  const [adminUser] = await db.select().from(adminUsers).where(eq(adminUsers.userId, userId));
  return !!adminUser;
}

// Check if admin exists by ID (for session validation)
export async function isAdminById(adminId: number): Promise<boolean> {
  const [adminUser] = await db.select().from(adminUsers).where(eq(adminUsers.id, adminId));
  return !!adminUser;
}

// Create a new admin with email/password
export async function createAdminWithPassword(email: string, password: string): Promise<{ id: number; email: string }> {
  const passwordHash = await bcrypt.hash(password, 10);
  
  const [newAdmin] = await db.insert(adminUsers).values({
    email,
    passwordHash,
  }).returning({ id: adminUsers.id, email: adminUsers.email });
  
  return newAdmin;
}

// Authenticate admin by email/password
export async function authenticateAdmin(email: string, password: string): Promise<{ id: number; email: string } | null> {
  const [adminUser] = await db.select().from(adminUsers).where(eq(adminUsers.email, email));
  
  if (!adminUser || !adminUser.passwordHash) {
    return null;
  }
  
  const isValidPassword = await bcrypt.compare(password, adminUser.passwordHash);
  if (!isValidPassword) {
    return null;
  }
  
  return { id: adminUser.id, email: adminUser.email };
}

// Get all admin users (for admin management UI)
export async function getAllAdmins(): Promise<Array<{ id: number; email: string; hasPassword: boolean; createdAt: Date | null }>> {
  const admins = await db.select().from(adminUsers);
  return admins.map(admin => ({
    id: admin.id,
    email: admin.email,
    hasPassword: !!admin.passwordHash,
    createdAt: admin.createdAt,
  }));
}
