import { expect, test } from './fixtures';

// Many scanned scores (IMSLP, archive.org) store their pages as JBIG2 images. pdf.js decodes those with a WASM module
// that it only finds when given its URL; without it every page renders blank. The fixture is a 3-page JBIG2 scan.
test('a multi-page JBIG2 scan renders its pages instead of blank paper', async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', (m) => { if (/jbig2|wasm|Unable to decode|Dependent image/i.test(m.text())) warnings.push(m.text()); });
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('e2e/fixtures/jbig2-scan.pdf');
  await expect(page.getByText('1/3')).toBeVisible();
  await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();

  const inkShare = () => page.locator('canvas').evaluate((c) => {
    const { data } = (c as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, (c as HTMLCanvasElement).width, (c as HTMLCanvasElement).height);
    let dark = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] < 128) dark++;
    return dark / (data.length / 4);
  });
  expect(await inkShare()).toBeGreaterThan(0.01); // notation is drawn, the page is not white

  // detection renders the page itself, so it must be able to read these images too
  await page.getByRole('button', { name: 'Auto-detect' }).click();
  await expect.poll(() => page.locator('.box').count()).toBeGreaterThanOrEqual(28);

  for (const n of [2, 3]) { // every page, not just the first
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.getByText(`${n}/3`)).toBeVisible();
    await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
    expect(await inkShare(), `page ${n}`).toBeGreaterThan(0.01);
  }
  expect(warnings).toEqual([]);
});
