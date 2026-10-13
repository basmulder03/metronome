import { expect, test } from './fixtures';
import { makePdf } from './make-pdf.mjs';

test.beforeAll(() => makePdf('e2e/score.pdf'));

test('a practice loop repeats a few measures with a rest in between until stopped', async ({ page }) => {
  await page.goto('/');
  await page.locator('header input[type=file]').setInputFiles('e2e/score.pdf');
  await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
  await page.getByRole('button', { name: 'Auto-detect' }).click();
  await expect(page.locator('.box')).toHaveCount(8);
  await page.locator('.box').nth(0).click();
  await page.getByRole('button', { name: 'Set tempo here' }).click();
  await page.getByLabel('BPM').first().fill('400'); // 0.6 s a bar

  await page.locator('.box').nth(1).click();
  await page.getByLabel('Loop through measure').fill('3');
  await page.getByLabel('Loop through measure').blur();
  await page.getByLabel('Rest between (s)').fill('1.5');
  await page.getByRole('button', { name: 'Practise 2–3' }).click();

  const lit = page.locator('.box.playing');
  const seen: number[] = [];
  const start = Date.now();
  // sample the playing box: bars 2 and 3 light up, then a rest with nothing lit, then bar 2 again
  while (Date.now() - start < 4500) {
    seen.push(await lit.count() ? await page.locator('.box').evaluateAll((els) => els.findIndex((e) => e.classList.contains('playing'))) : -1);
    await page.waitForTimeout(80);
  }
  const icons = new Set(await page.evaluate(() => [document.querySelector<HTMLLinkElement>('link[rel=icon]')!.href.slice(0, 15)]));
  await page.getByRole('button', { name: 'Stop' }).click();
  expect(icons).toEqual(new Set(['data:image/png;'])); // the tab icon beats while playing
  await expect.poll(() => page.evaluate(() => document.querySelector<HTMLLinkElement>('link[rel=icon]')!.href)).toContain('icon.svg');
  const joined = seen.join(',');
  expect(seen).toContain(1);
  expect(seen).toContain(2);
  expect(seen.every((i) => i === -1 || i === 1 || i === 2)).toBe(true); // never leaves the chosen range
  expect(joined).toMatch(/2,(-1,){5,}1/); // a rest of about a second and a half, then round again
});
