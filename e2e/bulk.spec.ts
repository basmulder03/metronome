import { expect, test } from './fixtures';
import { makePdf } from './make-pdf.mjs';

test.beforeAll(() => makePdf('e2e/score.pdf'));

test('Shift+click selects a run of measures that are edited together', async ({ page }) => {
  await page.goto('/');
  await page.locator('header input[type=file]').setInputFiles('e2e/score.pdf');
  await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
  await page.getByRole('button', { name: 'Auto-detect' }).click();
  await expect(page.locator('.box')).toHaveCount(8);

  await page.locator('.box').nth(1).click();
  await page.locator('.box').nth(4).click({ modifiers: ['Shift'] });
  await expect(page.locator('.box.range')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Measures 2–5' })).toBeVisible();

  await page.getByLabel('Beats').fill('3');
  await page.getByRole('button', { name: 'Apply to these measures' }).first().click();
  await expect(page.locator('.box').nth(1)).toContainText('3/4');
  await expect(page.locator('.box').nth(5)).toContainText('4/4'); // the bar after the run is back to what it was
  await page.getByRole('button', { name: '1st ending' }).click();
  await expect(page.locator('.box').nth(3).locator('.volta')).toHaveText('1.');
  await expect(page.locator('.box').nth(5).locator('.volta')).toHaveCount(0);

  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: /Delete these 4 boxes/ }).click();
  await expect(page.locator('.box')).toHaveCount(4);
});

test('a run can also be picked with a number, for touch screens', async ({ page }) => {
  await page.goto('/');
  await page.locator('header input[type=file]').setInputFiles('e2e/score.pdf');
  await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
  await page.getByRole('button', { name: 'Auto-detect' }).click();
  await expect(page.locator('.box')).toHaveCount(8);
  await page.locator('.box').nth(2).click();
  await page.getByLabel('Edit several: through measure').fill('5');
  await page.getByLabel('Edit several: through measure').blur();
  await expect(page.locator('.box.range')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Measures 3–5' })).toBeVisible();
  await page.getByRole('button', { name: 'Just the first' }).click();
  await expect(page.getByRole('heading', { name: 'Measure 3' })).toBeVisible();
});
