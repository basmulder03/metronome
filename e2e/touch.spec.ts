import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { makePdf } from './make-pdf.mjs';

// Real touch events (not mouse clicks): what a finger or a stylus does on a tablet.
test.beforeAll(() => makePdf('e2e/score.pdf'));
test.beforeEach(({}, info) => test.skip(!info.project.name.startsWith('tablet'), 'tablet projects only'));

type Pt = { x: number; y: number };
async function swipe(page: Page, from: Pt, to: Pt, steps = 8) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: string, p?: Pt) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y }] : [] });
  await send('touchStart', from);
  for (let i = 1; i <= steps; i++) await send('touchMove', { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps });
  await send('touchEnd');
  await cdp.detach();
}
const centre = async (page: Page, sel: string): Promise<Pt> => { const b = (await page.locator(sel).first().boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };

async function open(page: Page) {
  await page.goto('/');
  await page.locator('header input[type=file]').setInputFiles('e2e/score.pdf');
  await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
}

test('a finger draws a box in Draw mode', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Draw' }).click();
  const page_ = (await page.locator('.page').boundingBox())!;
  await swipe(page, { x: page_.x + page_.width * 0.1, y: page_.y + page_.height * 0.1 }, { x: page_.x + page_.width * 0.5, y: page_.y + page_.height * 0.2 });
  await expect(page.locator('.box:not(.ghost)')).toHaveCount(1);
});

test('tap selects, a finger drags a box and its edge, and Split cuts at a tapped barline', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Auto-detect' }).click();
  await expect(page.locator('.box')).toHaveCount(8);

  await page.locator('.box').nth(0).tap();
  await expect(page.locator('.box.sel')).toHaveCount(1);

  const before = (await page.locator('.box').nth(0).boundingBox())!;
  const c = await centre(page, '.box.sel');
  await swipe(page, c, { x: c.x, y: c.y + 30 });
  const moved = (await page.locator('.box').nth(0).boundingBox())!;
  expect(moved.y).toBeGreaterThan(before.y + 10);

  const edge = await centre(page, '.box.sel .handle.right');
  await swipe(page, edge, { x: edge.x + 40, y: edge.y });
  const wider = (await page.locator('.box').nth(0).boundingBox())!;
  expect(wider.width).toBeGreaterThan(moved.width + 20);

  await page.getByRole('button', { name: 'Split' }).click();
  await page.locator('.box').nth(5).evaluate((el) => el.scrollIntoView({ block: 'center' })); // clear of the bar pinned to the bottom
  await page.waitForTimeout(200); // let the scroll settle before tapping
  const b = (await page.locator('.box').nth(5).boundingBox())!;
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await expect(page.locator('.box')).toHaveCount(9);
});

test('everything a keyboard does has a button: undo, redo, merge, delete, step through measures', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Auto-detect' }).click();
  await expect(page.locator('.box')).toHaveCount(8);
  await page.locator('.box').nth(2).tap();
  await page.getByRole('button', { name: 'Merge with next' }).tap();
  await expect(page.locator('.box')).toHaveCount(7);
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect(page.locator('.box')).toHaveCount(8);
  await page.getByRole('button', { name: 'Redo' }).tap();
  await expect(page.locator('.box')).toHaveCount(7);
  await page.getByRole('button', { name: 'Next measure' }).tap();
  await expect(page.locator('.box').nth(3)).toHaveClass(/sel/);
  await page.getByRole('button', { name: 'Previous measure' }).tap();
  await expect(page.locator('.box').nth(2)).toHaveClass(/sel/);
  await page.getByRole('button', { name: 'Delete box' }).tap();
  await expect(page.locator('.box')).toHaveCount(6);
});

test('the page does not scroll sideways and the settings leave the picked box visible', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Auto-detect' }).click();
  await expect(page.locator('.box')).toHaveCount(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.box').nth(5).tap();
  const sheet = (await page.locator('aside[aria-label="Measure settings"]').boundingBox())!;
  const box = (await page.locator('.box.sel').boundingBox())!;
  if (sheet.width > page.viewportSize()!.width * 0.9) expect(box.y + box.height).toBeLessThanOrEqual(sheet.y + 1); // a bottom sheet (portrait): not hidden behind it
  else expect(box.x + box.width).toBeLessThanOrEqual(sheet.x + 1); // beside the page (landscape): nothing is covered
  const small = await page.locator('header > button, header > label.file, header .grp button, header > details > summary, .tools button').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 36).map((e) => (e.textContent || e.getAttribute('aria-label') || '').trim() + ':' + Math.round(e.getBoundingClientRect().height)));
  expect(small).toEqual([]); // finger-sized targets
});
