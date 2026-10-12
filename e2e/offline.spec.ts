import { expect, test } from './fixtures';
import { makePdf } from './make-pdf.mjs';

test.beforeAll(() => makePdf('e2e/score.pdf'));

test('manifest is valid and installable', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel=manifest]').getAttribute('href');
  const m = await (await request.get(new URL(href!, page.url()).toString())).json();
  expect(m).toMatchObject({ name: 'Metronome', display: 'standalone' });
  for (const icon of m.icons) expect((await request.get(new URL(icon.src, page.url()).toString())).ok()).toBe(true);
  expect(m.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
});

test('the image decoders for scanned scores are available offline', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  // JBIG2 and JPEG 2000 pages cannot be drawn without these; they are small, so they are cached with the app
  for (const file of ['jbig2.wasm', 'openjpeg.wasm']) {
    await expect.poll(() => page.evaluate(async (f) => !!(await caches.match(`/pdfjs/wasm/${f}`, { ignoreSearch: true })), file), { message: file }).toBe(true);
  }
});

test('works offline after the first visit, including a saved piece and its PDF', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });

  await page.locator('input[type=file]').setInputFiles('e2e/score.pdf');
  await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
  await page.getByRole('button', { name: 'Auto-detect' }).click();
  await expect(page.locator('.box')).toHaveCount(8);
  await page.waitForTimeout(400); // autosave

  // make sure the service worker controls the page (it claims clients after activation), then cut the network
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Library' })).toBeVisible();
  await expect(page.locator('.box')).toHaveCount(8);
  await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();

  // and it still plays and exports with no network
  await page.getByRole('button', { name: 'Select' }).click(); // the mode resets to Draw on reload
  await page.locator('.box').first().click();
  await page.getByRole('button', { name: 'Set tempo here' }).click();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export WAV' }).click();
  expect((await dl).suggestedFilename()).toBe('click-track.wav');
});
