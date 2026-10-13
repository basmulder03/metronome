import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { makePdf } from './make-pdf.mjs';

test.beforeAll(() => makePdf('e2e/score.pdf'));

/** 8 detected measures at 400 bpm (0.6 s a bar) with two named parts: "Intro" (1-4) and "Main theme" (5-8). */
async function twoParts(page: Page) {
  await page.goto('/');
  await page.locator('header input[type=file]').setInputFiles('e2e/score.pdf');
  await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
  await page.getByRole('button', { name: 'Auto-detect' }).click();
  await expect(page.locator('.box')).toHaveCount(8);
  await page.locator('.box').nth(0).click();
  await page.getByRole('button', { name: 'Set tempo here' }).click();
  await page.getByLabel('BPM').first().fill('400');
  await page.getByLabel('BPM').first().blur();
  await startPart(page, 0, 'Intro');
  await startPart(page, 4, 'Main theme');
}
async function startPart(page: Page, measure: number, name: string) {
  await page.locator('.box').nth(measure).click();
  await page.getByLabel('A new part starts at this measure').check();
  await page.getByLabel('Name of the part').fill(name);
  await page.getByLabel('Name of the part').blur();
}
async function setAfterPart(page: Page, mode: 'continue' | 'stop') {
  if (!(await page.locator('details.opts[open]').count())) await page.getByText('Options').click();
  await page.getByLabel('At the end of a part').selectOption(mode);
}
/** The measures that light up while playing, in order, without repeats of the same one. */
async function played(page: Page, ms: number) {
  const seen: string[] = [];
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const n = await page.locator('.box.playing .n').first().textContent({ timeout: 100 }).catch(() => null);
    if (n && seen.at(-1) !== n) seen.push(n);
    await page.waitForTimeout(25);
  }
  return seen.join('');
}
async function selectMeasure(page: Page, measure: number) {
  await page.locator('.box').nth(measure).click(); // the box keeps focus: Space still plays
}
async function wavSeconds(page: Page, trigger: () => Promise<void>) {
  const dl = page.waitForEvent('download');
  await trigger();
  const d = await dl;
  const buf = readFileSync((await d.path())!);
  return { seconds: buf.readUInt32LE(40) / 2 / buf.readUInt32LE(24), name: d.suggestedFilename() };
}

test('parts are marked on the sheet, named, and listed by name', async ({ page }) => {
  await twoParts(page);
  await expect(page.locator('.box').nth(0).locator('.tag')).toContainText('[Intro]');
  await expect(page.locator('.box').nth(4).locator('.tag')).toContainText('[Main theme]');
  const picker = page.getByLabel('Go to part');
  await expect(picker.locator('option')).toHaveText(['Intro', 'Main theme']);

  await picker.selectOption({ label: 'Main theme' });
  await expect(page.getByRole('heading', { name: 'Measure 5' })).toBeVisible();

  // renaming is just editing the name; a blank name falls back to a numbered one
  await page.getByLabel('Name of the part').fill('Theme and variations');
  await expect(picker.locator('option')).toHaveText(['Intro', 'Theme and variations']);
  await page.getByLabel('Name of the part').fill('');
  await expect(picker.locator('option')).toHaveText(['Intro', 'Part 2']);
});

test('a default name is offered, numbered by place among the parts', async ({ page }) => {
  await page.goto('/');
  await page.locator('header input[type=file]').setInputFiles('e2e/score.pdf');
  await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
  await page.getByRole('button', { name: 'Auto-detect' }).click();
  await page.locator('.box').nth(4).click();
  await page.getByLabel('A new part starts at this measure').check();
  await expect(page.getByLabel('Name of the part')).toHaveValue('Part 2'); // measures 1-4 are an unmarked Part 1
});

test('by default playback runs straight through every part', async ({ page }) => {
  await twoParts(page);
  await selectMeasure(page, 0);
  await page.keyboard.press(' ');
  expect(await played(page, 5600)).toBe('12345678');
  await expect(page.getByText(/End of “/)).toHaveCount(0); // it did not stop anywhere
});

test('set to stop after each part: it stops, announces the next part and continues on Space', async ({ page }) => {
  await twoParts(page);
  await setAfterPart(page, 'stop');
  await selectMeasure(page, 1); // start in the middle of the Intro
  await page.keyboard.press(' ');
  expect(await played(page, 2800)).toBe('234'); // to the end of the Intro and no further
  await expect(page.getByRole('status')).toContainText('End of “Intro”. Press Space or Play to carry on with “Main theme”.');
  await expect(page.getByRole('heading', { name: 'Measure 5' })).toBeVisible(); // the next part is ready

  await page.keyboard.press(' ');
  expect(await played(page, 3000)).toBe('5678'); // the last part runs to the end of the sheet
  await expect(page.getByRole('status')).not.toContainText('End of “Main theme”');
});

test('a part flagged to pause stops even when the sheet plays straight through', async ({ page }) => {
  await twoParts(page);
  await page.locator('.box').nth(0).click();
  await page.getByLabel('Always stop after this part').check();
  await expect(page.locator('.box').nth(0).locator('.tag')).toContainText('⏸');
  await selectMeasure(page, 0);
  await page.keyboard.press(' ');
  expect(await played(page, 3200)).toBe('1234');
  await expect(page.getByRole('status')).toContainText('End of “Intro”');
});

test('one part can be exported on its own, named after it', async ({ page }) => {
  await twoParts(page);
  await page.getByLabel('Go to part').selectOption({ label: 'Main theme' });
  const main = await wavSeconds(page, () => page.getByRole('button', { name: 'Export this part' }).click());
  expect(main.seconds).toBeCloseTo(4 * 0.6 + 0.5, 1);
  expect(main.name).toBe('score - Main theme.wav');
  await page.getByLabel('Go to part').selectOption({ label: 'Intro' });
  const intro = await wavSeconds(page, () => page.getByRole('button', { name: 'Export this part' }).click());
  expect(intro.name).toBe('score - Intro.wav');
  const whole = await wavSeconds(page, () => page.getByRole('button', { name: 'Export WAV' }).click());
  expect(whole.seconds).toBeCloseTo(8 * 0.6 + 0.5, 1); // the plain export is still the whole sheet
});

test('each part gets its own count-in when exported', async ({ page }) => {
  await twoParts(page);
  await page.getByText('Options').click();
  await page.getByLabel('Count-in').selectOption('1'); // one bar of 0.6 s
  await page.getByText('Options').click(); // close the panel: it floats over the title bar
  await page.getByLabel('Go to part').selectOption({ label: 'Main theme' });
  const main = await wavSeconds(page, () => page.getByRole('button', { name: 'Export this part' }).click());
  expect(main.seconds).toBeCloseTo(0.6 + 4 * 0.6 + 0.5, 1);
});

test('parts and the stop setting survive a reload', async ({ page }) => {
  await twoParts(page);
  await setAfterPart(page, 'stop');
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator('.box').nth(4).locator('.tag')).toContainText('[Main theme]');
  await page.getByText('Options').click();
  await expect(page.getByLabel('At the end of a part')).toHaveValue('stop');
});

test('a sheet without parts shows no part controls', async ({ page }) => {
  await page.goto('/');
  await page.locator('header input[type=file]').setInputFiles('e2e/score.pdf');
  await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
  await page.getByRole('button', { name: 'Auto-detect' }).click();
  await expect(page.getByLabel('Go to part')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export this part' })).toHaveCount(0);
  await page.getByText('Options').click();
  await expect(page.getByLabel('At the end of a part')).toHaveCount(0);
});
