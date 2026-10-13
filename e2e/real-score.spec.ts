import { expect, test } from './fixtures';
import { readFileSync } from 'node:fs';

// Real public-domain score (see fixtures/README.txt): 3/4, quarter=130, first system has 6 measures.
test('real score: mark first system, set 3/4 at 130, export matches 6 bars', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('header input[type=file]').setInputFiles('e2e/fixtures/minuet-in-g.pdf');
  const score = page.locator('.page');
  await expect.poll(async () => { const r = (await score.boundingBox())!; return Math.round((r.height / r.width) * 100) - 141; }).toBeLessThanOrEqual(1); // A4, give or take a pixel
  await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
  await page.getByRole('button', { name: 'Draw' }).click(); // the app opens in Select mode
  const b = (await score.boundingBox())!;
  const at = (fx: number, fy: number) => ({ x: b.x + fx * b.width, y: b.y + fy * b.height });
  const a = at(0.184, 0.164), c = at(0.94, 0.252);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(c.x, c.y, { steps: 5 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Split' }).click();
  for (const fx of [0.343, 0.446, 0.576, 0.679, 0.81]) {
    const p = at(fx, 0.2);
    await page.mouse.click(p.x, p.y);
  }
  await expect(page.locator('.box')).toHaveCount(6);
  await page.getByRole('button', { name: 'Select' }).click();
  await page.locator('.box').first().click();
  await page.getByRole('button', { name: 'Change time signature here' }).click();
  await page.getByLabel('Beats', { exact: true }).fill('3');
  await page.getByLabel('Note').selectOption('4');
  await page.getByRole('button', { name: 'Set tempo here' }).click();
  await page.getByLabel('BPM').first().fill('130');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export WAV' }).click();
  const buf = readFileSync((await (await dl).path())!);
  const seconds = buf.readUInt32LE(40) / 2 / buf.readUInt32LE(24);
  const expected = (6 * 3 * 60) / 130 + 0.5; // 6 bars x 3 beats + 0.5 s tail
  expect(seconds).toBeGreaterThan(expected - 0.05);
  expect(seconds).toBeLessThan(expected + 0.05);
});
