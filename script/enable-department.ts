#!/usr/bin/env tsx

import { initializeApp } from '../server/init.js';
import { getDb, getPool } from '../server/db.js';
import { sql } from 'drizzle-orm';

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: npx tsx script/enable-department.ts <slug>');
  process.exit(1);
}

async function run() {
  console.log('Loading configuration...');
  await initializeApp();

  const result = await getDb().execute(sql`
    UPDATE departments
    SET charges_enabled = true, payouts_enabled = true
    WHERE slug = ${slug}
  `);
  console.log(`✓ Set charges_enabled=true, payouts_enabled=true for department "${slug}"`);

  await getPool().end();
}

run().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
