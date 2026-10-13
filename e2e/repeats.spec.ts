import { expect, test } from './fixtures';

// The real public-domain Minuet (fixtures/README.txt) has four repeated sections of 16 bars; "Read from PDF" finds their signs on the page.
test('reading repeat signs from a real score', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'slow, and the reading does not depend on the screen');
  await page.goto('/');
  await page.locator('header input[type=file]').setInputFiles('e2e/fixtures/minuet-in-g.pdf');
  await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
  await page.getByRole('button', { name: 'Auto-detect' }).click();
  await expect(page.locator('.box').first()).toBeVisible();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Read from PDF' }).click();
  const dlg = page.getByRole('dialog', { name: 'Read from PDF' });
  const signs = dlg.getByRole('listitem').filter({ hasText: 'Repeat sign' });
  await expect(signs).toHaveCount(8);
  for (const [n, what] of [[1, 'starts'], [16, 'ends'], [17, 'starts'], [32, 'ends'], [34, 'starts'], [49, 'ends'], [50, 'starts'], [65, 'ends']] as const) {
    await expect(signs.filter({ hasText: `Measure ${n} ·` }).filter({ hasText: `repeat ${what} here` })).toHaveCount(1);
  }
  await dlg.getByRole('button', { name: /^Add \d+ selected/ }).click();
  await page.locator('.box').nth(15).click(); // measure 16
  await expect(page.getByLabel('Repeat ends here')).toBeChecked();
  await page.locator('.box').nth(0).click();
  await expect(page.getByLabel('Repeat starts here')).toBeChecked();
});
