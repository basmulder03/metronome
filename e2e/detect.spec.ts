import { expect, test } from '@playwright/test';

test('auto-detect on a real score finds the first system as 6 measures and plays from a picked one', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('input[type=file]').setInputFiles('e2e/fixtures/minuet-in-g.pdf');
  const score = page.locator('.page');
  await expect.poll(async () => { const r = (await score.boundingBox())!; return Math.round((r.height / r.width) * 100); }).toBe(141);
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Auto-detect' }).click();
  await expect(page.getByRole('status')).toContainText('Found');
  const boxes = await page.locator('.box').evaluateAll((els) => els.map((e) => ({ top: (e as HTMLElement).style.top, n: e.querySelector('.n')?.textContent })));
  console.log(JSON.stringify(boxes.map((b) => `${b.n}@${parseFloat(b.top).toFixed(0)}`)));
  const first = boxes.filter((b) => b.top === boxes[0].top);
  expect(first).toHaveLength(6);
  expect(boxes.length).toBeGreaterThanOrEqual(30);
  await page.locator('.box').nth(2).click(); // auto-detect leaves the app in Select mode
  await page.getByRole('button', { name: 'Set tempo here' }).click();
  await page.getByRole('button', { name: /^Play from 3/ }).click();
  await expect(page.locator('.box.playing')).toHaveCount(1);
  await page.getByRole('button', { name: 'Stop' }).click();
});
