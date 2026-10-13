#!/usr/bin/env tsx
// Manage API keys for the `complaints` CLI. Runs under your own AWS credentials (reads SSM, talks to DSQL).
//
//   npx tsx script/cli-keys.ts create [--label <text>] [--max-uses 50]
//   npx tsx script/cli-keys.ts list
//   npx tsx script/cli-keys.ts add-uses <id> <n>
//   npx tsx script/cli-keys.ts revoke <id>
//
// The plaintext key is printed exactly once at creation; only its SHA-256 hash is stored.

import { initializeApp } from '../server/init.js';
import { getPool } from '../server/db.js';
import { storage } from '../server/storage.js';
import { generateCliApiKey, hashCliApiKey, DEFAULT_CLI_KEY_MAX_USES } from '../server/cliKeys.js';

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function usage(): never {
  console.error('Usage: npx tsx script/cli-keys.ts <create [--label L] [--max-uses N] | list | add-uses <id> <n> | revoke <id>>');
  process.exit(1);
}

async function run() {
  const [command, ...args] = process.argv.slice(2);
  if (!command) usage();
  await initializeApp();

  switch (command) {
    case 'create': {
      const maxUses = Number(flag(args, 'max-uses') ?? DEFAULT_CLI_KEY_MAX_USES);
      if (!Number.isInteger(maxUses) || maxUses < 1) usage();
      const key = generateCliApiKey();
      const row = await storage.createCliApiKey(hashCliApiKey(key), flag(args, 'label') ?? 'unlabeled', maxUses);
      console.log(`Created key #${row.id} (${row.label}), ${row.maxUses} invocations.`);
      console.log('\nSave this now — it cannot be shown again:\n');
      console.log(`  ${key}\n`);
      console.log('Then on the machine using the CLI:  complaints config set-key <key>');
      break;
    }
    case 'list': {
      const rows = await storage.listCliApiKeys();
      if (!rows.length) console.log('No keys.');
      for (const r of rows) {
        console.log(`#${r.id}\t${r.label}\t${r.uses}/${r.maxUses} used\t${r.revoked ? 'REVOKED' : 'active'}\tlast used: ${r.lastUsedAt?.toISOString() ?? 'never'}`);
      }
      break;
    }
    case 'add-uses': {
      const id = Number(args[0]);
      const n = Number(args[1]);
      if (!Number.isInteger(id) || !Number.isInteger(n) || n < 1) usage();
      const existing = (await storage.listCliApiKeys()).find(k => k.id === id);
      if (!existing) { console.error(`No key #${id}`); process.exit(1); }
      const row = await storage.updateCliApiKey(id, { maxUses: existing.maxUses + n });
      console.log(`Key #${id} now allows ${row!.maxUses} invocations (${row!.uses} used).`);
      break;
    }
    case 'revoke': {
      const id = Number(args[0]);
      if (!Number.isInteger(id)) usage();
      const row = await storage.updateCliApiKey(id, { revoked: true });
      console.log(row ? `Key #${id} revoked.` : `No key #${id}`);
      break;
    }
    default:
      usage();
  }
  await getPool().end();
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
