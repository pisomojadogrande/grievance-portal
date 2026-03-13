#!/usr/bin/env tsx

/**
 * Migrate existing database tables without dropping data.
 * Safe to run multiple times — all operations are idempotent.
 *
 * Migrations applied:
 *   - payments: add `mode` column (test/live)
 *   - subscriptions: create table (new)
 */

import { sql } from 'drizzle-orm';
import { getDb, getPool } from '../server/db.js';
import { initializeApp } from '../server/init.js';

async function migrate() {
  console.log('Loading configuration from SSM...');
  await initializeApp();

  console.log('Connecting to DSQL...');
  const db = getDb();

  console.log('Running migrations...\n');

  // --- payments: add mode column ---
  // DSQL does not support ADD COLUMN with constraints, so add plain then backfill.
  console.log('Adding mode column to payments...');
  await db.execute(sql`
    ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS mode TEXT
  `);
  await db.execute(sql`
    UPDATE payments SET mode = 'test' WHERE mode IS NULL
  `);
  console.log('✓ payments.mode ready');

  // --- subscriptions: create table ---
  console.log('Creating subscriptions table...');
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY,
      customer_email TEXT NOT NULL,
      stripe_customer_id TEXT NOT NULL,
      stripe_subscription_id TEXT NOT NULL UNIQUE,
      stripe_price_id TEXT NOT NULL,
      tier TEXT NOT NULL,
      status TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'test',
      current_period_start TIMESTAMP NOT NULL,
      current_period_end TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `);
  console.log('✓ subscriptions table ready');

  console.log('\n✅ All migrations complete!');

  await getPool().end();
}

migrate().catch((error) => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
