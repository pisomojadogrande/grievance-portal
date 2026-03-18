#!/usr/bin/env tsx

import { initializeApp } from '../server/init.js';
import { getDb, getPool } from '../server/db.js';
import { sql } from 'drizzle-orm';

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: npx tsx script/show-department.ts <slug>');
  process.exit(1);
}

async function run() {
  await initializeApp();
  const rows = await getDb().execute(sql`SELECT * FROM departments WHERE slug = ${slug}`);
  if (rows.rows.length === 0) {
    console.log(`No department found with slug "${slug}"`);
  } else {
    console.log(JSON.stringify(rows.rows[0], null, 2));
  }
  await getPool().end();
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
