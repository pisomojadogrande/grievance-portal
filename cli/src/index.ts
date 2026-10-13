#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { ApiError, request, type ApiOptions } from './api.js';
import { loadConfig, resolveApiKey, resolveApiUrl, saveConfig, configPath } from './config.js';
import { isStripeTestCard } from './testCards.js';

const HELP = `The Complaints Department — CLI (sandbox / Stripe test mode only)

Usage:
  complaints complain   --content <text> --email <addr> [--test-cc <number>] [--dept <slug>]
  complaints subscribe  (--registered | --pro) --email <addr> --test-cc <number>
  complaints case       <id>
  complaints status     <email>          Subscription tier and complaint allowance
  complaints departments
  complaints config     set-key <key> | set-url <url> | show

Common options:
  --api-url <url>   Override API base URL (or COMPLAINTS_API_URL)
  --json            Machine-readable output
  --exp <MM/YYYY>   Test card expiry (default 12/2034)
  --cvc <digits>    Test card CVC (default 123)
  -h, --help

Auth: set COMPLAINTS_API_KEY or run \`complaints config set-key <key>\`.
Only Stripe test card numbers are accepted (https://docs.stripe.com/testing).
If the email has an active subscription with allowance left, --test-cc is not needed.
`;

const options = {
  content: { type: 'string' },
  email: { type: 'string' },
  user: { type: 'string' }, // alias for --email
  'test-cc': { type: 'string' },
  dept: { type: 'string' },
  registered: { type: 'boolean' },
  pro: { type: 'boolean' },
  exp: { type: 'string' },
  cvc: { type: 'string' },
  'api-url': { type: 'string' },
  json: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
} as const;

class UsageError extends Error {}

type Values = ReturnType<typeof parseArgs<{ options: typeof options; allowPositionals: true }>>['values'];

function buildCard(v: Values) {
  const number = v['test-cc'];
  if (!number) return undefined;
  if (!isStripeTestCard(number)) {
    throw new UsageError('Refusing to send that card number: only Stripe test cards are accepted (https://docs.stripe.com/testing). This tool is sandbox-only.');
  }
  const card: Record<string, unknown> = { number };
  if (v.exp) {
    const m = /^(\d{1,2})\/(\d{4})$/.exec(v.exp);
    if (!m) throw new UsageError('--exp must look like MM/YYYY');
    card.expMonth = Number(m[1]);
    card.expYear = Number(m[2]);
  }
  if (v.cvc) card.cvc = v.cvc;
  return card;
}

function api(v: Values, needsKey: boolean, timeoutMs?: number): ApiOptions {
  const apiKey = resolveApiKey();
  if (needsKey && !apiKey) throw new UsageError('No API key. Set COMPLAINTS_API_KEY or run: complaints config set-key <key>');
  return { baseUrl: resolveApiUrl(v['api-url']), apiKey, timeoutMs };
}

function out(v: Values, data: unknown, human: () => string) {
  console.log(v.json ? JSON.stringify(data, null, 2) : human());
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function describeAllowance(a: any): string {
  if (!a) return 'No active subscription';
  const tier = a.tier === 'pro_complainant' ? 'Pro Complainant' : 'Registered Complainant';
  const left = a.allowed === null ? 'unlimited complaints' : `${a.used}/${a.allowed} complaints used this period`;
  return `${tier} — ${left} (renews ${a.periodEnd.slice(0, 10)})`;
}

function formatComplaint(c: any, extra: { department?: string; paymentMethod?: string; allowance?: any } = {}): string {
  const lines = [
    `Complaint #${c.id} — ${c.status}`,
    ...(extra.department ? [`Department: ${extra.department}`] : []),
    ...(extra.paymentMethod ? [`Paid via: ${extra.paymentMethod === 'subscription' ? 'subscription allowance' : `test card (${dollars(c.filingFee)})`}`] : []),
    ...(c.complexityScore != null ? [`Complexity score: ${c.complexityScore}/10`] : []),
  ];
  if (c.aiResponse) lines.push('', c.aiResponse);
  else lines.push('', 'No response has been generated yet. Check back with: complaints case ' + c.id);
  if (extra.allowance) lines.push('', describeAllowance(extra.allowance));
  return lines.join('\n');
}

async function pollComplaint(opts: ApiOptions, id: number, deadlineMs = 90_000): Promise<any> {
  const start = Date.now();
  for (;;) {
    const c = await request<any>(opts, 'GET', `api/complaints/${id}`);
    if (c.status === 'resolved' || Date.now() - start > deadlineMs) return c;
    await new Promise(r => setTimeout(r, 2000));
  }
}

async function cmdComplain(v: Values) {
  const email = v.email ?? v.user;
  if (!v.content || !email) throw new UsageError('complain requires --content and --email');
  const card = buildCard(v);
  const opts = api(v, true, 120_000);
  let res: any;
  try {
    res = await request<any>(opts, 'POST', 'api/cli/complain', {
      content: v.content, email, departmentSlug: v.dept, testCard: card,
    });
  } catch (err) {
    // API Gateway cuts requests off at ~29s; the Lambda keeps going, so we can't recover the id here.
    if (err instanceof ApiError && err.status === 504) {
      throw new ApiError(504, 'The department took too long to respond (gateway timeout). Your complaint may still have been filed; check your email address against: complaints status <email>', err.body);
    }
    throw err;
  }
  let complaint = res.complaint;
  if (complaint.status !== 'resolved') complaint = await pollComplaint(opts, complaint.id);
  out(v, { ...res, complaint }, () => formatComplaint(complaint, {
    department: res.department?.name, paymentMethod: res.paymentMethod, allowance: res.allowance,
  }));
  if (complaint.status !== 'resolved') process.exitCode = 2;
}

async function cmdSubscribe(v: Values) {
  if (!!v.registered === !!v.pro) throw new UsageError('subscribe requires exactly one of --registered or --pro');
  if (!v.email && !v.user) throw new UsageError('subscribe requires --email');
  const card = buildCard(v);
  if (!card) throw new UsageError('subscribe requires --test-cc');
  const res = await request<any>(api(v, true), 'POST', 'api/cli/subscribe', {
    email: v.email ?? v.user, tier: v.pro ? 'pro_complainant' : 'registered_complainant', testCard: card,
  });
  out(v, res, () => `Subscribed: ${describeAllowance(res.allowance)}`);
}

async function cmdCase(v: Values, positionals: string[]) {
  const id = Number(positionals[0]);
  if (!Number.isInteger(id)) throw new UsageError('usage: complaints case <id>');
  const c = await request<any>(api(v, false), 'GET', `api/complaints/${id}`);
  out(v, c, () => formatComplaint(c));
}

async function cmdStatus(v: Values, positionals: string[]) {
  const email = positionals[0] ?? v.email ?? v.user;
  if (!email) throw new UsageError('usage: complaints status <email>');
  const s = await request<any>(api(v, false), 'GET', `api/subscriptions/status?email=${encodeURIComponent(email)}`);
  out(v, s, () => s.active
    ? describeAllowance({ tier: s.tier, used: s.complaintsUsed, allowed: s.complaintsAllowed, periodEnd: s.currentPeriodEnd })
    : 'No active subscription');
}

async function cmdDepartments(v: Values) {
  const depts = await request<any[]>(api(v, false), 'GET', 'api/departments');
  out(v, depts, () => depts.length
    ? depts.map(d => `${d.slug.padEnd(28)} ${d.name}${d.description ? ` — ${d.description}` : ''}`).join('\n')
    : 'No departments are currently accepting complaints.');
}

function cmdConfig(positionals: string[]) {
  const [action, value] = positionals;
  const cfg = loadConfig();
  if (action === 'set-key' && value) { saveConfig({ ...cfg, apiKey: value }); console.log(`API key saved to ${configPath()}`); }
  else if (action === 'set-url' && value) { saveConfig({ ...cfg, apiUrl: value }); console.log('API URL saved'); }
  else if (action === 'show') {
    console.log(`config file: ${configPath()}`);
    console.log(`api url:     ${resolveApiUrl()}`);
    const key = resolveApiKey();
    console.log(`api key:     ${key ? key.slice(0, 8) + '…' : '(not set)'}`);
  } else throw new UsageError('usage: complaints config set-key <key> | set-url <url> | show');
}

async function main() {
  const { values, positionals } = parseArgs({ options, allowPositionals: true });
  const [command, ...rest] = positionals;
  if (values.help || !command) { console.log(HELP); return; }
  switch (command) {
    case 'complain': return cmdComplain(values);
    case 'subscribe': return cmdSubscribe(values);
    case 'case': return cmdCase(values, rest);
    case 'status': return cmdStatus(values, rest);
    case 'departments': return cmdDepartments(values);
    case 'config': return cmdConfig(rest);
    default: throw new UsageError(`Unknown command "${command}"\n\n${HELP}`);
  }
}

main().catch(err => {
  if (err instanceof UsageError) console.error(err.message);
  else if (err instanceof ApiError) console.error(`Error${err.status ? ` (${err.status})` : ''}: ${err.message}`);
  else console.error(`Error: ${err?.message ?? err}`);
  process.exitCode = 1;
});
