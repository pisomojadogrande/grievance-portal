import type { RequestHandler } from "express";
import { getDb } from "./db";
import { adminUsers } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

// Middleware to check if user is admin (supports both Replit Auth and password-based auth)
export const isAdmin: RequestHandler = async (req: any, res, next) => {
  // Check session-based admin auth first (password-authenticated admins)
  if (req.session?.adminId) {
    const [adminUser] = await getDb().select().from(adminUsers).where(eq(adminUsers.id, req.session.adminId));
    if (adminUser) {
      req.adminUser = adminUser;
      return next();
    }
  }

  // Check Replit Auth
  const user = req.user as any;
  if (req.isAuthenticated?.() && user?.claims?.sub) {
    const userId = user.claims.sub;
    const [adminUser] = await getDb().select().from(adminUsers).where(eq(adminUsers.userId, userId));
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
    const [adminUser] = await getDb().select().from(adminUsers).where(eq(adminUsers.id, req.session.adminId));
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
  const existingAdmins = await getDb().select().from(adminUsers);
  
  if (existingAdmins.length === 0) {
    await getDb().insert(adminUsers).values({ userId, email });
    return true;
  }
  
  return existingAdmins.some(admin => admin.userId === userId);
}

// Check if user is admin by Replit userId
export async function isUserAdmin(userId: string): Promise<boolean> {
  const [adminUser] = await getDb().select().from(adminUsers).where(eq(adminUsers.userId, userId));
  return !!adminUser;
}

// Check if admin exists by ID (for session validation)
export async function isAdminById(adminId: number): Promise<boolean> {
  const [adminUser] = await getDb().select().from(adminUsers).where(eq(adminUsers.id, adminId));
  return !!adminUser;
}

// Create a new admin with email/password
export async function createAdminWithPassword(email: string, password: string): Promise<{ id: number; email: string }> {
  const passwordHash = await bcrypt.hash(password, 10);
  
  const [newAdmin] = await getDb().insert(adminUsers).values({
    email,
    passwordHash,
  }).returning({ id: adminUsers.id, email: adminUsers.email });
  
  return newAdmin;
}

// Authenticate admin by email/password
export async function authenticateAdmin(email: string, password: string): Promise<{ id: number; email: string } | null> {
  const [adminUser] = await getDb().select().from(adminUsers).where(eq(adminUsers.email, email));
  
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
  const admins = await getDb().select().from(adminUsers);
  return admins.map(admin => ({
    id: admin.id,
    email: admin.email,
    hasPassword: !!admin.passwordHash,
    createdAt: admin.createdAt,
  }));
}

// Get the first admin (lowest ID - the original admin)
export async function getFirstAdmin(): Promise<{ id: number; email: string } | null> {
  const admins = await getDb().select().from(adminUsers).orderBy(adminUsers.id).limit(1);
  return admins.length > 0 ? { id: admins[0].id, email: admins[0].email } : null;
}

// Check if a given admin ID is the first (primary) admin
export async function isFirstAdmin(adminId: number): Promise<boolean> {
  const firstAdmin = await getFirstAdmin();
  return firstAdmin !== null && firstAdmin.id === adminId;
}

// Reset password for an admin (only first admin can do this)
export async function resetAdminPassword(adminId: number, newPassword: string): Promise<boolean> {
  const passwordHash = await bcrypt.hash(newPassword, 10);
  const result = await getDb().update(adminUsers)
    .set({ passwordHash })
    .where(eq(adminUsers.id, adminId))
    .returning({ id: adminUsers.id });
  return result.length > 0;
}

// Delete an admin user (only first admin can do this, cannot delete self)
export async function deleteAdmin(adminId: number): Promise<boolean> {
  const result = await getDb().delete(adminUsers)
    .where(eq(adminUsers.id, adminId))
    .returning({ id: adminUsers.id });
  return result.length > 0;
}
