#!/usr/bin/env tsx

/**
 * Create database tables in Aurora DSQL
 * Uses IAM authentication via AuroraDSQLPool
 */

import { sql } from 'drizzle-orm';
import { getDb, getPool } from '../server/db.js';
import { initializeApp } from '../server/init.js';

async function createTables() {
  console.log('Loading configuration from SSM...');
  await initializeApp();
  
  console.log('Connecting to DSQL...');
  const db = getDb();
  
  console.log('Creating tables...\n');

  // Create sequences for auto-increment IDs
  await db.execute(sql`CREATE SEQUENCE IF NOT EXISTS admin_users_id_seq`);
  await db.execute(sql`CREATE SEQUENCE IF NOT EXISTS complaints_id_seq`);
  await db.execute(sql`CREATE SEQUENCE IF NOT EXISTS payments_id_seq`);

  // Create admin_users table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY DEFAULT nextval('admin_users_id_seq'),
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `);
  console.log('✓ admin_users table created');

  // Create complaints table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY DEFAULT nextval('complaints_id_seq'),
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      complaint TEXT NOT NULL,
      response TEXT,
      status TEXT DEFAULT 'received' NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `);
  console.log('✓ complaints table created');

  // Create payments table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY DEFAULT nextval('payments_id_seq'),
      complaint_id INTEGER NOT NULL,
      stripe_payment_intent_id TEXT NOT NULL UNIQUE,
      amount INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `);
  console.log('✓ payments table created');

  console.log('\n✅ All tables created successfully!');
  
  // Close connection
  await getPool().end();
}

createTables().catch((error) => {
  console.error('❌ Error creating tables:', error);
  process.exit(1);
});
