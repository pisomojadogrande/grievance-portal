import { Pool } from 'pg';

export type StripeMode = 'test' | 'live';

let sandboxPool: Pool | null = null;
let livePool: Pool | null = null;

function createPool(mode: StripeMode): Pool {
  const envName = mode === 'test' ? 'SUPABASE_URL_SBX' : 'SUPABASE_URL_LIVE';
  const connectionString = process.env[envName];

  if (!connectionString || connectionString === 'PLACEHOLDER' || connectionString === 'undefined') {
    throw new Error(`[Stripe Sync][${mode}] ${envName} is not configured`);
  }

  const pool = new Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 10_000,
    application_name: `grievance-portal-stripe-sync-${mode}`,
  });

  pool.on('error', (error) => {
    console.error(`[Stripe Sync][${mode}] Unexpected idle database connection error:`, error);
  });

  return pool;
}

export function getSyncDb(mode: StripeMode): Pool {
  if (mode === 'test') {
    sandboxPool ??= createPool(mode);
    return sandboxPool;
  }

  livePool ??= createPool(mode);
  return livePool;
}
