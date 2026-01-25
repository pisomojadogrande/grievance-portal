import type { RequestHandler } from "express";
import { isAuthenticated } from "./replit_integrations/auth";
import { db } from "./db";
import { adminUsers } from "@shared/schema";
import { eq } from "drizzle-orm";

export const isAdmin: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user?.claims?.sub) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const userId = user.claims.sub;
  
  const [adminUser] = await db.select().from(adminUsers).where(eq(adminUsers.userId, userId));
  
  if (!adminUser) {
    return res.status(403).json({ message: "Forbidden: Admin access required" });
  }

  next();
};

export async function getOrCreateFirstAdmin(userId: string, email: string): Promise<boolean> {
  const existingAdmins = await db.select().from(adminUsers);
  
  if (existingAdmins.length === 0) {
    await db.insert(adminUsers).values({ userId, email });
    return true;
  }
  
  return existingAdmins.some(admin => admin.userId === userId);
}

export async function isUserAdmin(userId: string): Promise<boolean> {
  const [adminUser] = await db.select().from(adminUsers).where(eq(adminUsers.userId, userId));
  return !!adminUser;
}
