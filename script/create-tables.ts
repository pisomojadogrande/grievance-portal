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

  // Drop existing tables (in reverse order due to potential references)
  console.log('Dropping existing tables if they exist...');
  await db.execute(sql`DROP TABLE IF EXISTS payments CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS complaints CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS admin_users CASCADE`);
  console.log('✓ Old tables dropped\n');

  // Create admin_users table with INTEGER id (manual management)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY,
      user_id TEXT UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `);
  console.log('✓ admin_users table created');

  // Create complaints table with INTEGER id (manual management)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY,
      content TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      status TEXT DEFAULT 'pending_payment' NOT NULL,
      filing_fee INTEGER DEFAULT 500 NOT NULL,
      ai_response TEXT,
      complexity_score INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `);
  console.log('✓ complaints table created');

  // Create payments table with INTEGER id (manual management)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY,
      complaint_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      status TEXT DEFAULT 'pending' NOT NULL,
      transaction_id TEXT,
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
