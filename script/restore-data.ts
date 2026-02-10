#!/usr/bin/env tsx

/**
 * Restore data from backup.sql to DSQL
 */

import { sql } from 'drizzle-orm';
import { getDb, getPool } from '../server/db.js';
import { initializeApp } from '../server/init.js';
import { readFileSync } from 'fs';

async function restoreData() {
  console.log('Loading configuration from SSM...');
  await initializeApp();
  
  console.log('Connecting to DSQL...');
  const db = getDb();
  
  console.log('Restoring data from backup...\n');

  // Admin users data
  const adminUsers = [
    { id: 1, user_id: '12345678', email: 'admin1@example.com', password_hash: null, created_at: '2026-01-25 14:48:07.796437' },
    { id: 2, user_id: null, email: 'admin2@example.com', password_hash: '$2b$10$zfSgJrfk0wklLkOixOP2XeFX7Ua1pJm7FtE.iRYsI.61bNQGTyBiu', created_at: '2026-01-25 16:27:52.057279' }
  ];

  for (const user of adminUsers) {
    await db.execute(sql`
      INSERT INTO admin_users (id, user_id, email, password_hash, created_at)
      VALUES (${user.id}, ${user.user_id}, ${user.email}, ${user.password_hash}, ${user.created_at})
    `);
  }
  console.log(`✓ Restored ${adminUsers.length} admin users`);

  // Read complaints from backup file
  const backup = readFileSync('backup.sql', 'utf-8');
  const complaintsMatch = backup.match(/COPY public\.complaints.*?FROM stdin;\n([\s\S]*?)\n\\\.\n/);
  
  if (!complaintsMatch) {
    console.log('No complaints data found in backup');
    await getPool().end();
    return;
  }

  const complaintsLines = complaintsMatch[1].trim().split('\n');
  let count = 0;

  for (const line of complaintsLines) {
    if (!line.trim()) continue;
    
    const parts = line.split('\t');
    const [id, content, customer_email, status, filing_fee, ai_response, complexity_score, created_at] = parts;
    
    await db.execute(sql`
      INSERT INTO complaints (id, content, customer_email, status, filing_fee, ai_response, complexity_score, created_at)
      VALUES (
        ${parseInt(id)},
        ${content},
        ${customer_email},
        ${status},
        ${parseInt(filing_fee)},
        ${ai_response === '\\N' ? null : ai_response},
        ${complexity_score === '\\N' ? null : parseInt(complexity_score)},
        ${created_at}
      )
    `);
    count++;
  }
  
  console.log(`✓ Restored ${count} complaints`);

  // Read payments from backup file
  const paymentsMatch = backup.match(/COPY public\.payments.*?FROM stdin;\n([\s\S]*?)\n\\\.\n/);
  
  if (paymentsMatch) {
    const paymentsLines = paymentsMatch[1].trim().split('\n');
    let paymentCount = 0;

    for (const line of paymentsLines) {
      if (!line.trim()) continue;
      
      const parts = line.split('\t');
      const [id, complaint_id, amount, status, transaction_id, created_at] = parts;
      
      await db.execute(sql`
        INSERT INTO payments (id, complaint_id, amount, status, transaction_id, created_at)
        VALUES (
          ${parseInt(id)},
          ${parseInt(complaint_id)},
          ${parseInt(amount)},
          ${status},
          ${transaction_id === '\\N' ? null : transaction_id},
          ${created_at}
        )
      `);
      paymentCount++;
    }
    
    console.log(`✓ Restored ${paymentCount} payments`);
  }

  console.log('\n✅ Data restoration complete!');
  
  await getPool().end();
}

restoreData().catch((error) => {
  console.error('❌ Error restoring data:', error);
  process.exit(1);
});
