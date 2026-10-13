import { expect, test } from './fixtures';
import { makePdf } from './make-pdf.mjs';

test.beforeAll(() => makePdf('e2e/score.pdf'));

test('repeats, endings and jumps are drawn on the boxes, and the share view does not label rests', async ({ page }) => {
  await page.goto('/');
  await page.locator('header input[type=file]').setInputFiles('e2e/score.pdf');
  await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
  await page.getByRole('button', { name: 'Auto-detect' }).click();
  await expect(page.locator('.box')).toHaveCount(8);

  await page.locator('.box').nth(0).click();
  await page.getByLabel('Repeat starts here').check();
  await page.locator('.box').nth(3).click();
  await page.getByLabel('Repeat ends here').check();
  await page.getByLabel('Plays in total').fill('3');
  await page.getByLabel('Plays in total').blur();
  await page.locator('.box').nth(4).click();
  await page.getByLabel('1st', { exact: true }).check();
  await page.locator('.box').nth(7).click();
  await page.getByLabel('Segno', { exact: true }).check();
  await page.getByLabel('Jump after this measure').selectOption('dc');

  await expect(page.locator('.box').nth(0).locator('.bar.start')).toBeVisible();
  await expect(page.locator('.box').nth(3).locator('.bar.end')).toBeVisible();
  await expect(page.locator('.box').nth(3).locator('.times')).toHaveText('×3');
  await expect(page.locator('.box').nth(4).locator('.volta')).toHaveText('1.');
  await expect(page.locator('.box').nth(7).locator('.chip')).toHaveText(['Segno', 'D.C.']);
  await page.screenshot({ path: 'test-results/marks.png' });

  await page.locator('.box').nth(5).click();
  await page.getByLabel('Bars in this rest').fill('4');
  await page.getByLabel('Bars in this rest').blur();
  await page.getByRole('button', { name: 'See share view' }).click();
  await expect(page.locator('.tile').nth(0).locator('.bar.start')).toBeVisible();
  await expect(page.locator('.strip')).not.toContainText('rest');
  await page.screenshot({ path: 'test-results/marks-strip.png' });
});
