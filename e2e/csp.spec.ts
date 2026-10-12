import { expect, test } from './fixtures';
import { makePdf } from './make-pdf.mjs';

test.beforeAll(() => makePdf('e2e/score.pdf'));

// A Content-Security-Policy limits what a script-injection bug could do with the stored sign-in token.
test('the app runs under its content security policy without violations', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text()); });
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('e2e/fixtures/minuet-in-g.pdf');
  await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
  await page.getByRole('button', { name: 'Auto-detect' }).click();
  await expect(page.locator('.box').first()).toBeVisible();
  await page.locator('.box').first().click();
  await page.getByRole('button', { name: 'Set tempo here' }).click();
  await page.getByRole('button', { name: 'Accelerando from here' }).click();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export WAV' }).click();
  await dl;
  expect(violations).toEqual([]);
});

test('the policy is present and forbids inline scripts and remote origins', async ({ page }) => {
  await page.goto('/');
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-eval'/);
  expect(csp).not.toMatch(/https?:\/\//); // nothing may load from another origin
  // an injected inline script must not run
  const ran = await page.evaluate(() => { const s = document.createElement('script'); s.textContent = 'window.__injected = true'; document.body.append(s); return (window as unknown as { __injected?: boolean }).__injected === true; });
  expect(ran).toBe(false);
});
