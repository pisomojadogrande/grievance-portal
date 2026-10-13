import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const entry = join(dirname(fileURLToPath(import.meta.url)), '..', 'index.js');
let server: Server;
let base: string;
const seen: { url?: string; key?: string; body?: any }[] = [];

before(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', c => (raw += c));
    req.on('end', () => {
      seen.push({ url: req.url, key: req.headers['x-api-key'] as string, body: raw ? JSON.parse(raw) : undefined });
      res.setHeader('content-type', 'application/json');
      if (req.url === '/api/cli/complain') {
        res.statusCode = 201;
        res.end(JSON.stringify({
          complaint: { id: 7, status: 'resolved', filingFee: 500, complexityScore: 4, aiResponse: 'Dear Complainant, noted.' },
          department: { name: 'Dept of Strife', slug: 'strife' }, paymentMethod: 'card', allowance: null,
        }));
      } else if (req.url === '/api/cli/subscribe') {
        res.statusCode = 402;
        res.end(JSON.stringify({ message: 'Your card was declined.' }));
      } else { res.statusCode = 404; res.end('{}'); }
    });
  });
  await new Promise<void>(r => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
after(() => server.close());

function run(args: string[], env: Record<string, string> = {}) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>(resolve => {
    const p = spawn(process.execPath, [entry, ...args, '--api-url', base], {
      env: { ...process.env, XDG_CONFIG_HOME: '/nonexistent', COMPLAINTS_API_KEY: '', ...env },
    });
    let stdout = '', stderr = '';
    p.stdout.on('data', d => (stdout += d));
    p.stderr.on('data', d => (stderr += d));
    p.on('close', code => resolve({ code, stdout, stderr }));
  });
}

test('complain sends key + card and prints the response', async () => {
  const r = await run(['complain', '--content', 'It is too hot in here', '--user', 'a@example.com', '--test-cc', '4242424242424242', '--dept', 'strife'],
    { COMPLAINTS_API_KEY: 'cmp_test' });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /Complaint #7 — resolved/);
  assert.match(r.stdout, /Dear Complainant/);
  const sent = seen.at(-1)!;
  assert.equal(sent.key, 'cmp_test');
  assert.equal(sent.body.email, 'a@example.com');
  assert.equal(sent.body.departmentSlug, 'strife');
  assert.equal(sent.body.testCard.number, '4242424242424242');
});

test('real card numbers are refused client-side, nothing is sent', async () => {
  const before = seen.length;
  const r = await run(['complain', '--content', 'It is too hot in here', '--email', 'a@example.com', '--test-cc', '4111111111111111'],
    { COMPLAINTS_API_KEY: 'cmp_test' });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /only Stripe test cards/);
  assert.equal(seen.length, before);
});

test('missing API key is a clear error', async () => {
  const r = await run(['complain', '--content', 'It is too hot in here', '--email', 'a@example.com']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /No API key/);
});

test('server errors surface with exit code 1', async () => {
  const r = await run(['subscribe', '--pro', '--email', 'a@example.com', '--test-cc', '4000000000000002'], { COMPLAINTS_API_KEY: 'cmp_test' });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Error \(402\): Your card was declined/);
});

test('subscribe requires exactly one tier', async () => {
  const r = await run(['subscribe', '--email', 'a@example.com', '--test-cc', '4242424242424242'], { COMPLAINTS_API_KEY: 'cmp_test' });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /exactly one of/);
});
