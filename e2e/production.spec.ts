import { expect, test } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makePdf } from './make-pdf.mjs';

// The production shape: ONE PocketBase process serving the built app and the API from the same origin.
const PORT = 8093;
const BASE = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess;
let dir: string;

test.beforeAll(async () => {
  makePdf('e2e/score.pdf');
  dir = mkdtempSync(join(tmpdir(), 'pb-prod-'));
  proc = spawn('server/bin/pocketbase', ['serve', `--http=127.0.0.1:${PORT}`, '--publicDir=dist', `--dir=${dir}`, '--migrationsDir=server/pb_migrations']);
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('backend did not start');
});
test.afterAll(() => { proc?.kill(); rmSync(dir, { recursive: true, force: true }); });
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'one project is enough'));

test('the built app and the API work from a single server', async ({ page, request }) => {
  await page.goto(BASE);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  await page.getByRole('button', { name: 'New here? Create an account' }).click();
  await page.getByLabel('Email').fill(`prod${Date.now()}@example.com`);
  await page.getByLabel('Password').fill('a-long-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Open PDF')).toBeVisible();

  await page.locator('input[type=file]').setInputFiles('e2e/score.pdf');
  await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
  await page.getByRole('button', { name: 'Auto-detect' }).click();
  await expect(page.locator('.box')).toHaveCount(8);
  await page.waitForTimeout(400);
  await page.getByText('Options').click();
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByText('Up to date')).toBeVisible();

  const token = await page.evaluate(() => JSON.parse(localStorage.getItem('pocketbase_auth')!).token);
  const res = await request.get(`${BASE}/api/collections/pieces/records`, { headers: { Authorization: token } });
  expect((await res.json()).items[0].markup.measures).toHaveLength(8);

  // deep links and the share fragment still resolve to the app (index fallback), and the service worker is registered
  await page.goto(`${BASE}/#share=abc`);
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBeGreaterThan(0);
});
