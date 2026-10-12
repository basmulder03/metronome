import { expect, test, type Page } from '@playwright/test';
import { makePdf } from './make-pdf.mjs';

test.beforeAll(() => makePdf('e2e/score.pdf'));

async function markUp(page: Page) {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('e2e/score.pdf');
  const score = page.locator('.page');
  await expect.poll(async () => { const r = (await score.boundingBox())!; return Math.round((r.height / r.width) * 100); }).toBe(133);
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Auto-detect' }).click();
  await expect(page.locator('.box')).toHaveCount(8);
  await page.locator('.box').nth(0).click();
  await page.getByRole('button', { name: 'Set tempo here' }).click();
  await page.getByLabel('BPM').first().fill('88');
  await page.locator('.box').nth(3).click();
  await page.getByLabel('Repeat ends here').check();
  await page.waitForTimeout(400);
}

test('share link carries markup only; recipient attaches their own PDF', async ({ page, browser }) => {
  await markUp(page);
  await page.getByRole('button', { name: 'Library' }).click();
  const dlg = page.getByRole('dialog', { name: 'Library' });
  await dlg.getByRole('button', { name: 'Share' }).click();
  const url = await dlg.getByLabel('Share link').inputValue();
  expect(url).toContain('#share=');
  expect(url.length).toBeLessThan(2000);
  await expect(dlg).toContainText('markup only');

  // a different browser context = another person's device
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await p2.goto(url);
  const imp = p2.getByRole('dialog', { name: 'Import shared piece' });
  await expect(imp).toContainText('8 measures');
  await imp.getByRole('button', { name: 'Import' }).click();

  // no PDF yet: measure grid with labels, and the hash is gone so a reload does not re-import
  await expect(p2.getByRole('button', { name: /^Measure \d/ })).toHaveCount(8);
  await expect(p2.getByRole('button', { name: 'Measure 1' })).toContainText('=88');
  await expect(p2.getByRole('button', { name: 'Measure 4' })).toContainText(':|');
  expect(p2.url()).not.toContain('#share');
  await p2.getByRole('button', { name: 'Play' }).click();
  await expect(p2.locator('.tile.playing')).toHaveCount(1);
  await p2.getByRole('button', { name: 'Stop' }).click();

  // attach their own copy: score view appears with the same markup on top
  await p2.locator('input[type=file]').setInputFiles('e2e/score.pdf');
  await expect(p2.locator('.box')).toHaveCount(8);
  await expect(p2.locator('.box').nth(0)).toContainText('=88');
  await other.close();
});

test('invalid share links are rejected without importing anything', async ({ page }) => {
  await page.goto('/#share=this-is-not-valid');
  await expect(page.getByRole('status')).toContainText('not valid');
  await expect(page.getByRole('dialog', { name: 'Import shared piece' })).toBeHidden();
  await page.getByRole('button', { name: 'Library' }).click();
  await expect(page.getByRole('dialog', { name: 'Library' })).toContainText('Nothing saved yet');
});

test('cancelling an import leaves the library untouched', async ({ page, browser }) => {
  await markUp(page);
  await page.getByRole('button', { name: 'Library' }).click();
  await page.getByRole('dialog', { name: 'Library' }).getByRole('button', { name: 'Share' }).click();
  const url = await page.getByLabel('Share link').inputValue();
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await p2.goto(url);
  await p2.getByRole('dialog', { name: 'Import shared piece' }).getByRole('button', { name: 'Cancel' }).click();
  await p2.getByRole('button', { name: 'Library' }).click();
  await expect(p2.getByRole('dialog', { name: 'Library' })).toContainText('Nothing saved yet');
  await other.close();
});
