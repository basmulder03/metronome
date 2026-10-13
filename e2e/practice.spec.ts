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

test('the tempo trainer starts slow and speeds up lap by lap, and the speed slider slows playback and export', async ({ page }) => {
  await page.goto('/');
  await page.locator('header input[type=file]').setInputFiles('e2e/score.pdf');
  await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
  await page.getByRole('button', { name: 'Auto-detect' }).click();
  await expect(page.locator('.box')).toHaveCount(8);
  await page.locator('.box').nth(0).click();
  await page.getByRole('button', { name: 'Set tempo here' }).click();
  await page.getByLabel('BPM').first().fill('400'); // 0.6 s a bar at full speed
  await page.getByLabel('Rest between (s)').fill('0.5');
  await page.getByLabel('Speed up every lap').check();
  await page.getByLabel('Start at %').fill('100');
  await page.getByLabel('Up to %').fill('200');
  await page.getByLabel('Faster by %').fill('100');
  await page.getByRole('button', { name: /^Practise 1/ }).click();
  await expect(page.getByRole('status')).toContainText('Practising at 100%');
  await expect(page.getByRole('status')).toContainText('Practising at 200%'); // the second lap is twice as fast
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: /^Play( from|$)/ })).toBeVisible();

  // half speed: the exported click track is twice as long
  const seconds = async () => {
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export WAV' }).click();
    const path = await (await dl).path();
    const { statSync } = await import('node:fs');
    return (statSync(path!).size - 44) / 2 / 44100;
  };
  const full = await seconds();
  await page.getByRole('group', { name: 'Playback' }).getByText('Sound', { exact: true }).click();
  await page.locator('.sound input[type=range]').first().fill('50');
  const slow = await seconds();
  expect(slow).toBeGreaterThan(full * 1.8);
});

test('a practice stretch can be saved as a named section, stays with the piece, and practised again', async ({ page }) => {
  await page.goto('/');
  await page.locator('header input[type=file]').setInputFiles('e2e/score.pdf');
  await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
  await page.getByRole('button', { name: 'Auto-detect' }).click();
  await expect(page.locator('.box')).toHaveCount(8);
  await page.locator('.box').nth(0).click();
  await page.getByRole('button', { name: 'Set tempo here' }).click();
  await page.getByLabel('BPM').first().fill('400');
  await page.locator('.box').nth(2).click();
  await page.getByLabel('Loop through measure').fill('4');
  await page.getByLabel('Loop through measure').blur();
  await page.getByLabel('Keep this stretch as a section').fill('The hard run');
  await page.getByRole('button', { name: 'Save section' }).click();
  await expect(page.getByText('The hard run')).toBeVisible();
  await expect(page.getByText('measures 3–4')).toBeVisible();

  await page.waitForTimeout(500);
  await page.reload();
  await page.locator('.box').nth(5).click(); // a different place: the section is listed wherever you are
  await expect(page.getByText('The hard run')).toBeVisible();
  await page.getByRole('button', { name: 'Practise The hard run' }).click();
  await expect(page.locator('.box.playing')).toHaveCount(1);
  await expect.poll(() => page.locator('.box').evaluateAll((els) => els.findIndex((e) => e.classList.contains('playing')))).toBeGreaterThanOrEqual(2);
  await page.getByRole('button', { name: 'Stop' }).click();

  await page.getByRole('button', { name: 'Remove section The hard run' }).click();
  await expect(page.getByText('The hard run')).toHaveCount(0);
});
