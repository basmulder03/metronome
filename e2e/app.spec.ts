import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { makePdf } from './make-pdf.mjs';
// (structure tests below reuse openAndMark)

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
  await page.getByLabel('Beats', { exact: true }).fill('7');
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
  await page.getByRole('button', { name: /^Play( from \d+)?$/ }).click();
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

test('markup persists across reload, together with the PDF', async ({ page }) => {
  await openAndMark(page);
  await page.waitForTimeout(400); // autosave debounce
  await page.reload();
  await expect(page.locator('.box')).toHaveCount(4);
  await expect(page.getByText('1/1')).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
});

test('toolbar does not shift the score when a measure is selected', async ({ page }) => {
  const px = await openAndMark(page);
  void px;
  await page.locator('.box').first().click();
  const y0 = (await page.locator('.page').boundingBox())!.y;
  await page.locator('.box').nth(3).click();
  expect((await page.locator('.page').boundingBox())!.y).toBe(y0);
});

async function wavSeconds(page: Page) {
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export WAV' }).click();
  const buf = readFileSync((await (await dl).path())!);
  return buf.readUInt32LE(40) / 2 / buf.readUInt32LE(24);
}

async function setTempo(page: Page, bpm: string) {
  await page.locator('.box').nth(0).click();
  await page.getByRole('button', { name: 'Set tempo here' }).click();
  await page.getByLabel('BPM').first().fill(bpm);
}

test('repeat sign doubles the exported click track and shows on the score', async ({ page }) => {
  await openAndMark(page);
  await setTempo(page, '120'); // 4 bars = 8 s
  await page.locator('.box').nth(3).click();
  await page.getByLabel('Repeat ends here').check();
  await expect(page.locator('.box').nth(3)).toContainText(':|');
  expect(await wavSeconds(page)).toBeCloseTo(16.5, 0); // 8 s x 2 + 0.5 s tail
  await page.getByLabel('Plays in total').fill('3');
  await page.getByLabel('Plays in total').blur();
  expect(await wavSeconds(page)).toBeCloseTo(24.5, 0);
});

test('D.C. al Fine ends at the Fine measure', async ({ page }) => {
  await openAndMark(page);
  await setTempo(page, '120');
  await page.locator('.box').nth(1).click();
  await page.getByLabel('Fine', { exact: true }).check();
  await page.locator('.box').nth(3).click();
  await page.getByLabel('Jump after this measure').selectOption('dc');
  await expect(page.locator('.box').nth(3)).toContainText('D.C.');
  expect(await wavSeconds(page)).toBeCloseTo(12.5, 0); // bars 1-4 then 1-2 = 6 bars x 2 s + tail
});

test('playhead follows the played order through a repeat', async ({ page }) => {
  await openAndMark(page);
  await setTempo(page, '400'); // 0.6 s per bar
  await page.locator('.box').nth(3).click();
  await page.getByLabel('Repeat ends here').check();
  await page.locator('.box').nth(0).click();
  await page.getByRole('button', { name: /^Play( from \d+)?$/ }).click();
  const seq: string[] = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 5400) {
    const n = await page.locator('.box.playing .n').first().textContent({ timeout: 200 }).catch(() => null);
    if (n && seq.at(-1) !== n) seq.push(n);
    await page.waitForTimeout(30);
  }
  expect(seq.join('')).toContain('12341234');
});

test('structure marks survive a reload', async ({ page }) => {
  await openAndMark(page);
  await page.locator('.box').nth(2).click();
  await page.getByLabel('Segno', { exact: true }).check();
  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.locator('.box').nth(2)).toContainText('segno');
});

test('count-in adds bars to playback and export', async ({ page }) => {
  await openAndMark(page);
  await setTempo(page, '120'); // 4 bars = 8 s
  await page.getByText('Options').click();
  await page.getByLabel('Count-in').selectOption('1');
  expect(await wavSeconds(page)).toBeCloseTo(10.5, 0); // 2 s count-in + 8 s + tail
  await page.getByLabel('Count-in').selectOption('2');
  expect(await wavSeconds(page)).toBeCloseTo(12.5, 0);
});

test('pickup shortens the first bar and a fermata stretches a beat', async ({ page }) => {
  await openAndMark(page);
  await setTempo(page, '120');
  await page.locator('.box').nth(0).click();
  await page.getByLabel('Beats in this measure (pickup)').fill('1');
  await page.getByLabel('Beats in this measure (pickup)').blur();
  await expect(page.locator('.box').nth(0)).toContainText('pickup 1');
  expect(await wavSeconds(page)).toBeCloseTo(7, 1); // 0.5 s pickup + 3 bars x 2 s + 0.5 s tail
  await page.locator('.box').nth(3).click();
  await page.getByLabel('Fermata').check();
  await page.getByLabel('On beat').fill('4');
  await page.getByLabel('On beat').blur();
  await page.getByLabel('Hold ×').fill('3');
  await page.getByLabel('Hold ×').blur();
  expect(await wavSeconds(page)).toBeCloseTo(8, 1); // fermata x3 adds two beats (1 s)
});

test('tap tempo sets the BPM from the tapping speed', async ({ page }) => {
  await openAndMark(page);
  await page.locator('.box').first().click();
  await page.getByRole('button', { name: 'Set tempo here' }).click();
  const tap = page.getByRole('button', { name: 'Tap tempo' });
  for (let i = 0; i < 6; i++) { await tap.click(); await page.waitForTimeout(500); }
  const bpm = +(await page.getByLabel('BPM').first().inputValue());
  expect(bpm).toBeGreaterThan(105); // 500 ms apart is 120, with test timing jitter
  expect(bpm).toBeLessThan(135);
});
