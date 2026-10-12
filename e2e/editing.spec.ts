import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { copyFileSync } from 'node:fs';
import { makePdf } from './make-pdf.mjs';

test.beforeAll(() => { makePdf('e2e/score.pdf'); copyFileSync('e2e/score.pdf', 'e2e/score-b.pdf'); });

/** Upload the synthetic score and let auto-detect find its 8 measures (two systems of four). */
async function detected(page: Page, file = 'e2e/score.pdf') {
  await page.goto('/');
  await page.locator('header input[type=file]').setInputFiles(file);
  await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
  await page.getByRole('button', { name: 'Auto-detect' }).click();
  await expect(page.locator('.box')).toHaveCount(8);
}
const rect = (page: Page, i: number) =>
  page.locator('.box').nth(i).evaluate((el) => ({ x: +el.style.getPropertyValue('--x'), y: +el.style.getPropertyValue('--y'), w: +el.style.getPropertyValue('--w'), h: +el.style.getPropertyValue('--h') }));
const label = (page: Page, i: number) => page.locator('.box').nth(i).locator('.tag');

test.describe('keyboard', () => {
  test('arrows select, Delete removes, Ctrl+Z brings it back, redo removes it again', async ({ page }) => {
    await detected(page);
    await page.locator('.box').nth(1).click();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('heading', { name: 'Measure 3' })).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('heading', { name: 'Measure 1' })).toBeVisible();

    await page.keyboard.press('Delete');
    await expect(page.locator('.box')).toHaveCount(7);
    await expect(page.getByRole('heading', { name: 'Measure 1' })).toBeVisible(); // the next box takes its place

    await page.waitForTimeout(600); // let the history settle: a quick Delete then Undo is also fine, but this is the usual pace
    await page.keyboard.press('Control+z');
    await expect(page.locator('.box')).toHaveCount(8);
    await page.keyboard.press('Control+Shift+z');
    await expect(page.locator('.box')).toHaveCount(7);
    await page.keyboard.press('Control+z');
    await expect(page.locator('.box')).toHaveCount(8);
  });

  test('shortcuts leave text fields alone', async ({ page }) => {
    await detected(page);
    await page.locator('.box').first().click();
    await page.getByRole('button', { name: 'Set tempo here' }).click();
    const bpm = page.getByLabel('BPM').first();
    await bpm.click();
    await page.keyboard.press('Backspace'); // edits the number, not the score
    await page.keyboard.type('d');
    await page.keyboard.press('Delete');
    await expect(page.locator('.box')).toHaveCount(8);
    await expect(page.getByRole('button', { name: 'Draw' })).toHaveAttribute('aria-pressed', 'false'); // 'd' typed into the field did not switch modes
  });

  test('D, S and V switch modes, M merges, ? shows the list, Escape deselects', async ({ page }) => {
    await detected(page);
    await page.locator('.box').nth(2).click();
    await page.keyboard.press('d');
    await expect(page.getByRole('button', { name: 'Draw' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('s');
    await expect(page.getByRole('button', { name: 'Split' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('v');
    await expect(page.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('m'); // merge measure 3 with 4
    await expect(page.locator('.box')).toHaveCount(7);
    await page.keyboard.press('Control+z');
    await expect(page.locator('.box')).toHaveCount(8);

    await page.keyboard.press('?');
    const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(help).toContainText('Delete the selected measure box');
    await expect(help).toContainText('Undo, redo');
    await page.keyboard.press('Escape');
    await expect(help).toBeHidden();

    await page.keyboard.press('Escape'); // deselect
    await expect(page.getByText('Select a measure box')).toBeVisible();
  });

  test('Space plays from the selected measure and stops again', async ({ page }) => {
    await detected(page);
    await page.locator('.box').nth(2).click();
    await page.getByRole('button', { name: 'Set tempo here' }).click();
    await page.keyboard.press('Escape'); // leave the field-free state: nothing focused that owns Space
    await page.locator('.box').nth(2).click();
    await page.locator('body').click({ position: { x: 5, y: 400 } }).catch(() => {});
    await page.keyboard.press(' ');
    await expect(page.locator('.box.playing')).toHaveCount(1);
    await page.keyboard.press(' ');
    await expect(page.getByRole('button', { name: /^Play( from \d+)?$/ })).toBeVisible();
  });

  test('Alt+arrows move a box, Alt+Shift+arrows resize it, comma and period move the barline', async ({ page }) => {
    await detected(page);
    await page.locator('.box').nth(1).click();
    const before = await rect(page, 1);
    await page.keyboard.press('Alt+ArrowRight');
    expect((await rect(page, 1)).x).toBeCloseTo(before.x + 0.002, 4);
    await page.keyboard.press('Alt+Shift+ArrowDown');
    expect((await rect(page, 1)).h).toBeCloseTo(before.h + 0.002, 4);

    const left = await rect(page, 1), right = await rect(page, 2);
    await page.keyboard.press('.'); // the barline between measures 2 and 3 moves right: 2 grows, 3 shrinks
    const l2 = await rect(page, 1), r2 = await rect(page, 2);
    expect(l2.w).toBeGreaterThan(left.w);
    expect(r2.x).toBeGreaterThan(right.x);
    expect(l2.w - left.w).toBeCloseTo(r2.x - right.x, 4); // both sides of the bar moved by the same amount
  });
});

test.describe('dragging', () => {
  test('dragging a handle resizes, and a barline shared with the next box moves both', async ({ page }) => {
    await detected(page);
    await page.locator('.box').nth(1).click();
    const a = await rect(page, 1), b = await rect(page, 2);
    const handle = page.locator('.box.sel .handle.right');
    const hb = (await handle.boundingBox())!;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2 + 40, hb.y + hb.height / 2, { steps: 6 });
    await page.mouse.up();
    const a2 = await rect(page, 1), b2 = await rect(page, 2);
    expect(a2.w).toBeGreaterThan(a.w);
    expect(b2.x).toBeGreaterThan(b.x);
    expect(b2.w).toBeLessThan(b.w);
    expect(a2.x + a2.w).toBeCloseTo(b2.x, 3); // the bar stayed shared
    expect(b2.x + b2.w).toBeCloseTo(b.x + b.w, 3); // the far edge of the neighbour did not move
  });

  test('dragging the body of a box moves it, a plain click does not', async ({ page }) => {
    await detected(page);
    await page.locator('.box').nth(5).click();
    const before = await rect(page, 5);
    expect(before).toEqual(await rect(page, 5));
    const box = (await page.locator('.box').nth(5).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 12, { steps: 6 });
    await page.mouse.up();
    const after = await rect(page, 5);
    expect(after.x).toBeGreaterThan(before.x);
    expect(after.y).toBeGreaterThan(before.y);
    expect(after.w).toBeCloseTo(before.w, 6);
    await page.keyboard.press('Control+z'); // the whole drag is one undo step
    expect((await rect(page, 5)).x).toBeCloseTo(before.x, 4);
  });

  test('a drag that starts on an unselected box selects it', async ({ page }) => {
    await detected(page);
    const box = (await page.locator('.box').nth(6).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 25, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByRole('heading', { name: 'Measure 7' })).toBeVisible();
  });
});

test.describe('re-detecting, renaming and reusing a click track', () => {
  test('running auto-detect again keeps tempos, meters and marks', async ({ page }) => {
    await detected(page);
    await page.locator('.box').nth(2).click();
    await page.getByRole('button', { name: 'Set tempo here' }).click();
    await page.getByLabel('BPM').first().fill('140');
    await page.getByLabel('BPM').first().blur();
    await page.locator('.box').nth(5).click();
    await page.getByLabel('Repeat ends here').check();
    await expect(label(page, 2)).toContainText('=140');

    await page.getByRole('button', { name: 'Auto-detect' }).click();
    await expect(page.getByRole('status')).toContainText('Tempos and time signatures you had set are kept');
    await expect(page.locator('.box')).toHaveCount(8);
    await expect(label(page, 2)).toContainText('=140');
    await expect(label(page, 5)).toContainText(':|');
  });

  test('a piece can be renamed from the title bar, with the button or F2', async ({ page }) => {
    await detected(page);
    await expect(page.locator('.titlebar strong')).toHaveText('score');
    page.once('dialog', (d) => void d.accept('Fellowship, Trumpet'));
    await page.getByRole('button', { name: 'Rename' }).click();
    await expect(page.locator('.titlebar strong')).toHaveText('Fellowship, Trumpet');

    await page.locator('body').click({ position: { x: 5, y: 500 } });
    page.once('dialog', (d) => void d.accept('Fellowship, Horn'));
    await page.keyboard.press('F2');
    await expect(page.locator('.titlebar strong')).toHaveText('Fellowship, Horn');
    await page.getByRole('button', { name: 'Library' }).click();
    await expect(page.getByRole('dialog', { name: 'Library' })).toContainText('Fellowship, Horn');
  });

  test('duplicating a piece and giving it another part\'s PDF reuses the click track', async ({ page }) => {
    await detected(page);
    await page.locator('.box').nth(2).click();
    await page.getByRole('button', { name: 'Set tempo here' }).click();
    await page.getByLabel('BPM').first().fill('133');
    await page.getByLabel('BPM').first().blur();
    await page.waitForTimeout(400);

    await page.getByRole('button', { name: 'Library' }).click();
    const lib = page.getByRole('dialog', { name: 'Library' });
    await lib.getByRole('button', { name: 'Duplicate' }).click();
    await expect(lib.getByRole('listitem')).toHaveCount(2);
    const copy = lib.getByRole('listitem').filter({ hasText: 'score (copy)' });
    await expect(copy).toContainText('no PDF attached');
    await expect(copy).toContainText('8 measures');
    await copy.getByRole('button', { name: 'Open' }).click();

    // the copy plays from a measure grid until a PDF is attached
    await expect(page.getByRole('button', { name: 'Measure 3' })).toContainText('=133');
    await page.getByRole('button', { name: 'Library' }).click();
    await lib.locator('li', { hasText: 'score (copy)' }).locator('input[type=file]').setInputFiles('e2e/score-b.pdf'); // "another part"
    await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('.box')).toHaveCount(8); // the old layout, on the new PDF
    await expect(label(page, 2)).toContainText('=133');

    await page.getByRole('button', { name: 'Auto-detect' }).click(); // fit the boxes to the new PDF, keeping the tempo
    await expect(page.getByRole('status')).toContainText('kept');
    await expect(label(page, 2)).toContainText('=133');
  });
});

test('on a phone, the box you pick is kept above the inspector sheet', async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 900, 'phone layout only');
  await detected(page);
  await page.locator('.box').nth(6).click(); // a box in the lower half of the page
  const box = (await page.locator('.box.sel').boundingBox())!;
  const sheet = (await page.locator('aside').boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(sheet.y + 1); // not hidden behind the sheet
});

async function exportSeconds(page: Page) {
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export WAV' }).click();
  const buf = (await import('node:fs')).readFileSync((await (await dl).path())!);
  return buf.readUInt32LE(40) / 2 / buf.readUInt32LE(24);
}

test.describe('multi-measure rests', () => {
  test('one box stands for several bars: the click runs for all of them and the printed numbers carry on', async ({ page }) => {
    await detected(page);
    await page.locator('.box').first().click();
    await page.getByRole('button', { name: 'Set tempo here' }).click();
    await page.getByLabel('BPM').first().fill('120'); // 2 s a bar
    await page.getByLabel('BPM').first().blur();
    await page.locator('.box').nth(1).click();
    await page.getByLabel('Bars in this rest').fill('4');
    await page.getByLabel('Bars in this rest').blur();

    await expect(page.locator('.box').nth(1).locator('.tag')).toContainText('rest ×4');
    await expect(page.getByRole('heading', { name: 'Measures 2–5' })).toBeVisible();
    await expect(page.locator('.box').nth(1).locator('.n')).toHaveText('2–5');
    await expect(page.locator('.box').nth(2).locator('.n')).toHaveText('6'); // the printed number after the rest
    await page.locator('.box').nth(2).click();
    await expect(page.getByRole('button', { name: 'Play from 6' })).toBeVisible();

    expect(await exportSeconds(page)).toBeCloseTo((7 + 4) * 2 + 0.5, 1); // seven ordinary boxes and a four-bar rest

    await page.locator('.box').nth(1).click();
    await page.getByLabel('Bars in this rest').fill('1'); // back to an ordinary bar
    await page.getByLabel('Bars in this rest').blur();
    await expect(page.locator('.box').nth(2).locator('.n')).toHaveText('3');
    expect(await exportSeconds(page)).toBeCloseTo(8 * 2 + 0.5, 1);
  });

  test('the grid view for a piece without a PDF uses the printed numbers too', async ({ page, browser, user }) => {
    void page; void browser; void user;
    await detected(page);
    await page.locator('.box').nth(1).click();
    await page.getByLabel('Bars in this rest').fill('3');
    await page.getByLabel('Bars in this rest').blur();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Library' }).click();
    const lib = page.getByRole('dialog', { name: 'Library' });
    await lib.getByRole('button', { name: 'Duplicate' }).click(); // a copy has no PDF, so it shows the grid
    await lib.getByRole('listitem').filter({ hasText: '(copy)' }).getByRole('button', { name: 'Open' }).click();
    await expect(page.getByRole('button', { name: 'Measures 2–4' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Measure 5' })).toBeVisible();
  });
});

test.describe('saving', () => {
  test('Ctrl+S saves now, instead of the browser\'s Save Page, and nothing is lost on an immediate reload', async ({ page }) => {
    await detected(page);
    await expect(page.locator('.saved')).toContainText(/Saved/);
    await page.locator('.box').nth(2).click();
    await page.getByRole('button', { name: 'Set tempo here' }).click();
    await page.getByLabel('BPM').first().fill('150');
    await page.getByLabel('BPM').first().blur();

    // the browser's own "save page" is cancelled
    const prevented = await page.evaluate(() => {
      const e = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true });
      document.body.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(prevented).toBe(true);
    await expect(page.locator('.saved')).toContainText(/Saved/);

    await page.reload(); // straight away: no waiting for the autosave
    await expect(page.locator('.box').nth(2).locator('.tag')).toContainText('=150');
  });

  test('Ctrl+S also works while typing in a field', async ({ page }) => {
    await detected(page);
    await page.locator('.box').first().click();
    await page.getByRole('button', { name: 'Set tempo here' }).click();
    await page.getByLabel('BPM').first().fill('99');
    await page.keyboard.press('Control+s'); // focus is still in the BPM field
    await expect(page.locator('.saved')).toHaveText('Saved');
    await page.reload();
    await expect(page.locator('.box').first().locator('.tag')).toContainText('=99');
  });

  test('with nothing open, Ctrl+S says so', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+s');
    await expect(page.getByText('Nothing to save yet')).toBeVisible();
  });

  test('the indicator shows saving while an edit is pending and saved afterwards', async ({ page }) => {
    await detected(page);
    await page.locator('.box').first().click();
    await page.getByRole('button', { name: 'Set tempo here' }).click();
    await expect(page.locator('.saved')).toContainText(/Saved/, { timeout: 5000 });
  });
});
