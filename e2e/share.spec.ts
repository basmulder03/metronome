import { expect, test, createUser, signInContext } from './fixtures';
import type { Page } from '@playwright/test';
import { makePdf } from './make-pdf.mjs';

test.beforeAll(() => makePdf('e2e/score.pdf'));

/** The owner uploads a PDF, detects 8 measures, sets tempo 88 and a repeat, and returns a share link. */
async function shareLink(page: Page) {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('e2e/score.pdf');
  const score = page.locator('.page');
  await expect.poll(async () => { const r = (await score.boundingBox())!; return Math.round((r.height / r.width) * 100); }).toBe(133);
  await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
  await page.getByRole('button', { name: 'Auto-detect' }).click();
  await expect(page.locator('.box')).toHaveCount(8);
  await page.locator('.box').nth(0).click();
  await page.getByRole('button', { name: 'Set tempo here' }).click();
  await page.getByLabel('BPM').first().fill('88');
  await page.locator('.box').nth(3).click();
  await page.getByLabel('Repeat ends here').check();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Library' }).click();
  const dlg = page.getByRole('dialog', { name: 'Library' });
  await dlg.getByRole('button', { name: 'Share' }).click();
  const url = await dlg.getByLabel('Share link').inputValue();
  expect(url).toContain('#share=');
  expect(url.length).toBeLessThan(2000);
  await expect(dlg).toContainText('markup only');
  return url;
}

test('a signed-out guest can play a shared link read-only, with their own PDF', async ({ page, browser }) => {
  const url = await shareLink(page);

  const guestCtx = await browser.newContext(); // no session: a guest
  const g = await guestCtx.newPage();
  await g.goto(url);
  await expect(g.getByText('shared with you · 8 measures')).toBeVisible();
  // read-only: no editor, no library, no sign-in form
  for (const name of ['Library', 'Auto-detect', 'Playlists']) await expect(g.getByRole('button', { name })).toHaveCount(0);
  await expect(g.getByRole('heading', { name: 'Sign in' })).toHaveCount(0);

  await expect(g.getByRole('button', { name: /^Measure \d/ })).toHaveCount(8);
  await expect(g.getByRole('button', { name: 'Measure 1' })).toContainText('=88');
  await expect(g.getByRole('button', { name: 'Measure 4' })).toContainText(':|');
  await g.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(g.locator('.tile.playing')).toHaveCount(1);
  await g.getByRole('button', { name: 'Stop' }).click();

  const dl = g.waitForEvent('download');
  await g.getByRole('button', { name: 'Export WAV' }).click();
  expect((await dl).suggestedFilename()).toContain('.wav');

  await g.locator('input[type=file]').setInputFiles('e2e/score.pdf'); // their own copy of the score
  await expect(g.locator('.box')).toHaveCount(8);
  await expect(g.locator('.box').nth(0)).toContainText('=88');
  await guestCtx.close();
});

test('signing in from a shared link offers to import it, without a PDF', async ({ page, browser }) => {
  const url = await shareLink(page);
  const guestCtx = await browser.newContext();
  const g = await guestCtx.newPage();
  await g.goto(url);
  await g.getByRole('button', { name: 'Sign in to save a copy' }).click();
  await expect(g.getByText('Sign in to save a copy of')).toBeVisible();

  const other = await createUser();
  await g.getByLabel('Email').fill(other.email);
  await g.getByLabel('Password').fill(other.password);
  await g.getByRole('button', { name: 'Sign in' }).click();

  const imp = g.getByRole('dialog', { name: 'Import shared piece' });
  await expect(imp).toContainText('8 measures');
  await imp.getByRole('button', { name: 'Import' }).click();
  await expect(g.getByRole('button', { name: /^Measure \d/ })).toHaveCount(8);
  await expect(g.locator('label.file')).toContainText('Attach PDF');
  expect(g.url()).not.toContain('#share');
  await guestCtx.close();
});

test('a guest with a broken link lands on sign-in with an explanation', async ({ browser }) => {
  const ctx = await browser.newContext();
  const g = await ctx.newPage();
  await g.goto('/#share=this-is-not-valid');
  await expect(g.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(g.getByText('That share link is not valid.')).toBeVisible();
  await ctx.close();
});

test('invalid share links are rejected without importing anything', async ({ page }) => {
  await page.goto('/#share=this-is-not-valid');
  await expect(page.getByRole('status')).toContainText('not valid');
  await expect(page.getByRole('dialog', { name: 'Import shared piece' })).toBeHidden();
  await page.getByRole('button', { name: 'Library' }).click();
  await expect(page.getByRole('dialog', { name: 'Library' })).toContainText('Nothing saved yet');
});

test('cancelling an import leaves the library untouched', async ({ page, browser }) => {
  const url = await shareLink(page);
  const ctx = await browser.newContext();
  await signInContext(ctx, await createUser());
  const p2 = await ctx.newPage();
  await p2.goto(url);
  await p2.getByRole('dialog', { name: 'Import shared piece' }).getByRole('button', { name: 'Cancel' }).click();
  await p2.getByRole('button', { name: 'Library' }).click();
  await expect(p2.getByRole('dialog', { name: 'Library' })).toContainText('Nothing saved yet');
  await ctx.close();
});
