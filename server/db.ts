import { drizzle } from "drizzle-orm/node-postgres";
import { AuroraDSQLPool } from "@aws/aurora-dsql-node-postgres-connector";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Parse DSQL endpoint from DATABASE_URL
const url = new URL(process.env.DATABASE_URL);
const host = url.hostname;

export const pool = new AuroraDSQLPool({
  host,
  user: "admin",
  database: "postgres",
  max: 3,
  idleTimeoutMillis: 60000,
});

export const db = drizzle(pool, { schema });
