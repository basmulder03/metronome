import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { makePdf } from './make-pdf.mjs';

// A pen (an S Pen, say) arrives as pointer events with pointerType "pen"; the browser's debugging protocol can produce them.
test.beforeAll(() => makePdf('e2e/score.pdf'));
test.skip(({ browserName }) => browserName !== 'chromium');

async function pen(page: Page, type: 'mouseMoved' | 'mousePressed' | 'mouseReleased', x: number, y: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: type === 'mouseMoved' ? 0 : 1, pointerType: 'pen' });
  await cdp.detach();
}
async function stroke(page: Page, a: { x: number; y: number }, b: { x: number; y: number }) {
  await pen(page, 'mouseMoved', a.x, a.y);
  await pen(page, 'mousePressed', a.x, a.y);
  for (let i = 1; i <= 6; i++) await pen(page, 'mouseMoved', a.x + ((b.x - a.x) * i) / 6, a.y + ((b.y - a.y) * i) / 6);
  await pen(page, 'mouseReleased', b.x, b.y);
}

async function open(page: Page) {
  await page.goto('/');
  await page.locator('header input[type=file]').setInputFiles('e2e/score.pdf');
  await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
}

test('a pen draws a box without switching to Draw, and pen mode switches itself on', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true');
  const p = (await page.locator('.page').boundingBox())!;
  await stroke(page, { x: p.x + p.width * 0.1, y: p.y + p.height * 0.1 }, { x: p.x + p.width * 0.6, y: p.y + p.height * 0.2 });
  await expect(page.locator('.box')).toHaveCount(1);
  await expect(page.locator('.page')).toHaveClass(/stylus/);
});

test('the pen drags a box and its edge', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Auto-detect' }).click();
  await expect(page.locator('.box')).toHaveCount(8);
  await page.locator('.box').nth(0).click();
  const before = (await page.locator('.box').nth(0).boundingBox())!;
  const c = { x: before.x + before.width / 2, y: before.y + before.height / 2 };
  await stroke(page, c, { x: c.x, y: c.y + 30 });
  const moved = (await page.locator('.box').nth(0).boundingBox())!;
  expect(moved.y).toBeGreaterThan(before.y + 10);
  await expect(page.locator('.box')).toHaveCount(8); // the stroke moved the box, it did not draw another
  const h = (await page.locator('.box.sel .handle.right').boundingBox())!;
  const e = { x: h.x + h.width / 2, y: h.y + h.height / 2 };
  await stroke(page, e, { x: e.x + 40, y: e.y });
  expect((await page.locator('.box').nth(0).boundingBox())!.width).toBeGreaterThan(moved.width + 20);
});
