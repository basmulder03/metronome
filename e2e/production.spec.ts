import { expect, test } from '@playwright/test';
import { makePdf } from './make-pdf.mjs';
import { startBackend, type Backend } from './backend';

// The production shape: ONE PocketBase process serving the built app and the API from the same origin.
let pb: Backend;
test.beforeAll(async () => {
  makePdf('e2e/score.pdf');
  pb = await startBackend({ port: 8093, publicDir: 'dist' });
  await pb.setRegistration('open'); // this test signs up through the form
});
test.afterAll(() => pb?.stop());
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'one project is enough'));

test('the built app and the API work from a single server', async ({ page, request }) => {
  await page.goto(pb.base);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  await page.getByRole('button', { name: 'New here? Create an account' }).click();
  await page.getByLabel('Email').fill(`prod${Date.now()}@example.com`);
  await page.getByLabel('Password').fill('a-long-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Open PDF')).toBeVisible();

  await page.locator('header input[type=file]').setInputFiles('e2e/score.pdf');
  await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
  await page.getByRole('button', { name: 'Auto-detect' }).click();
  await expect(page.locator('.box')).toHaveCount(8);
  await page.waitForTimeout(400);
  await page.getByText('Options').click();
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByText('Up to date')).toBeVisible();

  const token = await page.evaluate(() => JSON.parse(localStorage.getItem('pocketbase_auth')!).token);
  const res = await request.get(`${pb.base}/api/collections/pieces/records`, { headers: { Authorization: token } });
  expect((await res.json()).items[0].markup.measures).toHaveLength(8);

  // deep links and the share fragment still resolve to the app (index fallback), and the service worker is registered
  await page.goto(`${pb.base}/#share=abc`);
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBeGreaterThan(0);
});
