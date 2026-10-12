import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { makePdf } from './make-pdf.mjs';

const PDF = "e2e/score.pdf";
test.beforeAll(() => makePdf('e2e/score.pdf'));

async function openAndMark(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('input[type=file]').setInputFiles(PDF);
  await expect(page.getByText('1/1')).toBeVisible();
  const score = page.locator('.page');
  await expect.poll(async () => { const r = (await score.boundingBox())!; return Math.round((r.height / r.width) * 100); }).toBe(133); // PDF aspect applied
  const b = (await score.boundingBox())!;
  // page is 600x800 pt; first system spans x 50..550, y 100..140 from top
  const px = (x: number, y: number) => ({ x: b.x + (x / 600) * b.width, y: b.y + (y / 800) * b.height });
  const a = px(50, 100), c = px(550, 140);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(c.x, c.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('.box')).toHaveCount(1);
  await page.getByRole('button', { name: 'Split' }).click();
  for (const x of [175, 300, 425]) {
    const p = px(x, 120);
    // after each split the clicked box is the one containing x
    await page.mouse.click(p.x, p.y);
  }
  await expect(page.locator('.box')).toHaveCount(4);
  await page.getByRole('button', { name: 'Select' }).click();
  return px;
}

test('mark up a PDF, set meter and tempo, labels show on the boxes', async ({ page }) => {
  await openAndMark(page);
  await page.locator('.box').nth(0).click();
  await page.getByRole('button', { name: 'Set tempo here' }).click();
  await page.getByLabel('BPM').first().fill('120');
  await page.getByRole('button', { name: 'Change time signature here' }).click();
  await page.getByLabel('Beats').fill('7');
  await page.getByLabel('Note').selectOption('8');
  await expect(page.getByLabel('Grouping')).toHaveValue('1+1+1+1+1+1+1');
  await page.getByLabel('Grouping').fill('2+2+3');
  await page.getByLabel('Grouping').blur();
  await expect(page.locator('.box').nth(0)).toContainText('7/8');
  await expect(page.locator('.box').nth(0)).toContainText('=120');
  await page.getByLabel('Grouping').fill('2+2+2');
  await page.getByLabel('Grouping').blur();
  await expect(page.getByText('Grouping must add up to 7.')).toBeVisible();
});

test('playback highlights measures and advances', async ({ page }) => {
  await openAndMark(page);
  await page.locator('.box').nth(0).click();
  await page.getByRole('button', { name: 'Set tempo here' }).click();
  await page.getByLabel('BPM').first().fill('240'); // 4 bars = 4 s
  await page.getByRole('button', { name: /^Play/ }).click();
  await expect(page.locator('.box.playing')).toHaveCount(1);
  const seen = new Set<string>();
  const t0 = Date.now();
  while (Date.now() - t0 < 3000) {
    seen.add((await page.locator('.box.playing .n').first().textContent().catch(() => null)) ?? '');
    await page.waitForTimeout(60);
  }
  expect(seen.size).toBeGreaterThanOrEqual(3);
  await expect(page.getByRole('button', { name: 'Stop' })).toBeHidden({ timeout: 4000 }); // auto-stops at the end
});

test('export WAV has correct length', async ({ page }) => {
  await openAndMark(page);
  await page.locator('.box').nth(0).click();
  await page.getByRole('button', { name: 'Set tempo here' }).click();
  await page.getByLabel('BPM').first().fill('120'); // 4 bars of 4/4 = 8 s
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export WAV' }).click();
  const file = await (await dl).path();
  const buf = readFileSync(file!);
  expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
  const seconds = buf.readUInt32LE(40) / 2 / buf.readUInt32LE(24);
  expect(seconds).toBeGreaterThan(8.3);
  expect(seconds).toBeLessThan(8.7);
});

test('accelerando: curve handle drag changes the curve and ramp is tinted', async ({ page }) => {
  await openAndMark(page);
  await page.locator('.box').nth(0).click();
  await page.getByRole('button', { name: 'Set tempo here' }).click();
  await page.getByRole('button', { name: 'Accelerando from here' }).click();
  await expect(page.locator('.box.ramp')).toHaveCount(4);
  await expect(page.locator('.box').nth(0)).toContainText('accel.');
  const svg = page.getByRole('application', { name: 'Tempo curve editor' });
  const d0 = await svg.locator('path').getAttribute('d');
  const h = svg.getByRole('slider').first();
  await h.scrollIntoViewIfNeeded();
  const hb = (await h.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + 60, hb.y - 40, { steps: 5 });
  await page.mouse.up();
  expect(await svg.locator('path').getAttribute('d')).not.toBe(d0);
  await page.getByRole('button', { name: 'linear' }).click();
  await page.getByRole('button', { name: /^Preview/ }).click();
  await expect(page.locator('.box.playing')).toHaveCount(1);
  await page.getByRole('button', { name: 'Stop' }).click();
});

test('inspector is visible in the viewport after selecting a measure', async ({ page }) => {
  await openAndMark(page);
  await page.locator('.box').nth(1).click();
  const h = await page.getByRole('heading', { name: 'Measure 2' }).boundingBox();
  const vh = page.viewportSize()!.height;
  expect(h!.y).toBeGreaterThan(0);
  expect(h!.y + h!.height).toBeLessThan(vh);
});

test('markup persists across reload', async ({ page }) => {
  await openAndMark(page);
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('metronome.piece')!).measures.length)).toBe(4);
});

test('toolbar does not shift the score when a measure is selected', async ({ page }) => {
  const px = await openAndMark(page);
  void px;
  await page.locator('.box').first().click();
  const y0 = (await page.locator('.page').boundingBox())!.y;
  await page.locator('.box').nth(3).click();
  expect((await page.locator('.page').boundingBox())!.y).toBe(y0);
});
