#!/usr/bin/env tsx

import { initializeApp } from '../server/init.js';
import { getDb, getPool } from '../server/db.js';
import { sql } from 'drizzle-orm';

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: npx tsx script/delete-department.ts <slug>');
  process.exit(1);
}

async function run() {
  console.log('Loading configuration...');
  await initializeApp();

  const result = await getDb().execute(sql`DELETE FROM departments WHERE slug = ${slug}`);
  console.log(`✓ Deleted department with slug "${slug}"`);

  await getPool().end();
}

run().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
