import { expect, test } from './fixtures';

// The real score's text layer holds "q =130" above bar 1, the 3/4 digits, and three "molto rall." marks.
test('reads tempo, time signature and rit. marks from a real score and applies them after review', async ({ page }) => {
  await page.goto('/');
  await page.locator('header input[type=file]').setInputFiles('e2e/fixtures/minuet-in-g.pdf');
  await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Read from PDF' })).toBeDisabled(); // needs measures first
  await page.getByRole('button', { name: 'Auto-detect' }).click();
  await expect(page.locator('.box')).toHaveCount(31);

  await page.getByRole('button', { name: 'Read from PDF' }).click();
  const dlg = page.getByRole('dialog', { name: 'Read from PDF' });
  await expect(dlg.getByRole('listitem')).toHaveCount(11); // both pages: 2 at the start, 4 restored tempos, 5 rall. ramps
  const rows = await dlg.getByRole('listitem').allInnerTexts();
  expect(rows.some((r) => /Measure 1 · Time signature: 3\/4/.test(r))).toBe(true);
  expect(rows.some((r) => /Measure 1 · Tempo: ♩ = 130/.test(r))).toBe(true);
  expect(rows.filter((r) => /Accel\.\/rall\./.test(r) && /molto rall\./.test(r)).length).toBe(5); // three on page 1, two on page 2
  // each rall. stops before the tempo mark that restores 130; the one at the bottom of page 1 runs on to the next page's mark
  expect(rows.some((r) => /Measures 15–16 · Accel\.\/rall\./.test(r))).toBe(true);
  expect(rows.some((r) => /Measures 23–24 · Accel\.\/rall\./.test(r))).toBe(true);
  expect(rows.some((r) => /Measures 31–33 · Accel\.\/rall\./.test(r))).toBe(true);
  // guesses start unticked, certainties ticked
  await expect(dlg.getByRole('checkbox', { checked: true })).toHaveCount(6); // the time signature and five tempo marks

  await dlg.getByRole('button', { name: /^Add 6 selected/ }).click();
  await expect(page.getByRole('status')).toContainText('Added 6');
  await expect(page.locator('.box').nth(0)).toContainText('3/4');
  await expect(page.locator('.box').nth(0)).toContainText('=130');
  await expect(page.locator('.box').nth(16)).toContainText('=130');

  // adding again changes nothing: what is already set is kept
  await page.getByRole('button', { name: 'Read from PDF' }).click();
  await page.getByRole('dialog', { name: 'Read from PDF' }).getByRole('button', { name: /^Add 6 selected/ }).click();
  await expect(page.getByRole('status')).toContainText('kept 6 you had already set');
});

test('a PDF without a text layer says so instead of guessing', async ({ page }) => {
  // the synthetic test score only has drawn lines, no text at all
  const { makePdf } = await import('./make-pdf.mjs');
  makePdf('e2e/score.pdf');
  await page.goto('/');
  await page.locator('header input[type=file]').setInputFiles('e2e/score.pdf');
  await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
  await page.getByRole('button', { name: 'Auto-detect' }).click();
  await expect(page.locator('.box')).toHaveCount(8);
  await page.getByRole('button', { name: 'Read from PDF' }).click();
  await expect(page.getByRole('status')).toContainText('no text layer');
  await expect(page.getByRole('dialog', { name: 'Read from PDF' })).toHaveCount(0);
});

test('a scanned PDF can be read with OCR: tempo and molto rall. found, nothing applied until reviewed', async ({ page }) => {
  test.setTimeout(90_000);
  const problems: string[] = [];
  page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(e.message));
  await page.goto('/');
  await page.locator('header input[type=file]').setInputFiles('e2e/fixtures/minuet-scan.pdf');
  await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
  await page.getByRole('button', { name: 'Auto-detect' }).click();
  await expect(page.locator('.box').first()).toBeVisible();
  const boxes = await page.locator('.box').count();
  expect(boxes).toBeGreaterThanOrEqual(28); // detection works on pixels, so a scan is fine

  await page.getByRole('button', { name: 'Read from PDF' }).click();
  await expect(page.getByRole('status')).toContainText('no text layer');
  await page.getByRole('button', { name: /Read with OCR/ }).click();

  const dlg = page.getByRole('dialog', { name: 'Read from PDF' });
  await expect(dlg).toBeVisible({ timeout: 60_000 });
  const rows = await dlg.getByRole('listitem').allInnerTexts();
  console.log(rows.join('\n'));
  expect(rows.some((r) => /Measure 1 · Tempo: .* = 130/.test(r))).toBe(true);
  expect(rows.filter((r) => /molto rall\./.test(r)).length).toBeGreaterThanOrEqual(2);
  expect(rows.some((r) => /Time signature/.test(r))).toBe(false); // OCR cannot read music-font digits
  // OCR guesses the beat unit, so those rows are flagged and start unticked
  await expect(dlg.getByRole('checkbox', { checked: true })).toHaveCount(await dlg.locator('li:not(:has(em))').count());
  expect(problems).toEqual([]);
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.box').first()).not.toContainText('130'); // cancelled: nothing applied
});
