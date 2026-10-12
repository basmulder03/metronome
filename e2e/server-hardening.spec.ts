import { expect, test } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Own backend on another port with the real migrations (rate limits on), separate from the relaxed test backend.
const PORT = 8092;
const BASE = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess;
let dir: string;

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'pb-hardening-'));
  proc = spawn('server/bin/pocketbase', ['serve', `--http=127.0.0.1:${PORT}`, `--dir=${dir}`, '--migrationsDir=server/pb_migrations']);
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('backend did not start');
});
test.afterAll(() => { proc?.kill(); rmSync(dir, { recursive: true, force: true }); });
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'server-only'));

const post = (path: string, body: unknown) => fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('repeated wrong passwords get rate limited', async () => {
  const codes: number[] = [];
  for (let i = 0; i < 13; i++) codes.push((await post('/api/collections/users/auth-with-password', { identity: 'nobody@example.com', password: 'wrong-password' })).status);
  expect(codes.slice(0, 10).every((c) => c === 400)).toBe(true);
  expect(codes.slice(10)).toEqual([429, 429, 429]);
});

test('account creation is rate limited', async () => {
  const codes: number[] = [];
  for (let i = 0; i < 7; i++) codes.push((await post('/api/collections/users/records', { email: `spam${i}@example.com`, password: 'password123', passwordConfirm: 'password123' })).status);
  expect(codes.filter((c) => c === 429).length).toBeGreaterThanOrEqual(1);
});

test('nothing is readable without an account', async () => {
  const res = await fetch(`${BASE}/api/collections/pieces/records`);
  expect(res.status).toBeLessThan(500);
  const anon = await res.json();
  expect(anon.totalItems ?? 0).toBe(0); // owner-only rules: nothing is visible without an account
});
