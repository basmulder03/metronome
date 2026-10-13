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
    await expect(page.getByRole('heading', { name: /^Measures? \d/ })).toHaveCount(0); // the settings close with the selection (a wide screen keeps an empty panel)
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
    await page.keyboard.down('Alt'); // no snapping: this test is about plain movement
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 12, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up('Alt');
    const after = await rect(page, 5);
    expect(after.x).toBeGreaterThan(before.x);
    expect(after.y).toBeGreaterThan(before.y);
    expect(after.w).toBeCloseTo(before.w, 6);
    await page.keyboard.press('Control+z'); // the whole drag is one undo step
    expect((await rect(page, 5)).x).toBeCloseTo(before.x, 4);
  });

  test('a drag that starts on an unselected box selects it', async ({ page }) => {
    await detected(page);
    await page.locator('.box').nth(6).scrollIntoViewIfNeeded(); // the page is wider without a side panel, so this box starts below the fold
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
  await expect.poll(async () => { // the page scrolls once the settings are drawn
    const box = (await page.locator('.box.sel').boundingBox())!;
    const sheet = (await page.locator('aside').boundingBox())!;
    return sheet.y + 1 - (box.y + box.height);
  }).toBeGreaterThanOrEqual(0); // not hidden behind the sheet
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

  test('the grid view for a piece without a PDF shows a rest as one plain tile, numbered like the printed bars', async ({ page, browser, user }) => {
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
    await expect(page.getByRole('button', { name: /^Measure \d/ })).toHaveCount(8); // one tile per box: the rest is not spelled out
    await expect(page.getByRole('button', { name: 'Measure 2', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Measure 5', exact: true })).toBeVisible(); // the bar after the 3-bar rest skips ahead, like the print
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

test.describe('outlining', () => {
  /** Draw a box by dragging, in fractions of the page. The synthetic page is blank where we draw, so nothing is detected. */
  async function drawBox(page: Page, x0: number, y0: number, x1: number, y1: number) {
    await page.getByRole('button', { name: 'Draw' }).click(); // the app opens in Select mode
    const b = (await page.locator('.page').boundingBox())!;
    await page.mouse.move(b.x + b.width * x0, b.y + b.height * y0);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * x1, b.y + b.height * y1, { steps: 4 });
    await page.mouse.up();
  }
  async function blankPage(page: Page) {
    await page.goto('/');
    await page.locator('header input[type=file]').setInputFiles('e2e/score.pdf');
    await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
  }
  /** Three sloppily drawn bars in one row: different tops and heights, small gaps and overlaps between them. */
  async function sloppyRow(page: Page) {
    await drawBox(page, 0.10, 0.20, 0.30, 0.30);
    await drawBox(page, 0.306, 0.215, 0.50, 0.285);
    await drawBox(page, 0.492, 0.19, 0.70, 0.31);
  }

  test('a drawn box takes the height of its row and connects to the barline beside it', async ({ page }) => {
    await blankPage(page);
    await sloppyRow(page);
    await expect(page.locator('.box')).toHaveCount(3);
    const [a, b, c] = [await rect(page, 0), await rect(page, 1), await rect(page, 2)];
    expect([b.y, c.y]).toEqual([a.y, a.y]); // the same top
    expect([b.h, c.h]).toEqual([a.h, a.h]); // the same height
    expect(a.x + a.w).toBeCloseTo(b.x, 6); // the sides are connected
    expect(b.x + b.w).toBeCloseTo(c.x, 6);
  });

  test('only a box in the same row takes its height, and only a close edge is pulled onto a barline', async ({ page }) => {
    await blankPage(page);
    await drawBox(page, 0.10, 0.20, 0.30, 0.30);
    await drawBox(page, 0.12, 0.33, 0.45, 0.43); // a different row (kept within the visible window)
    await drawBox(page, 0.60, 0.205, 0.80, 0.29); // the same row but 0.3 away from the barline
    // boxes are kept in reading order: the far one is second in the first row, the lower row comes last
    const [far, low] = [await rect(page, 1), await rect(page, 2)];
    expect(low.h).toBeCloseTo(0.10, 2); // another row: exactly as drawn
    expect(far.x).toBeCloseTo(0.60, 2); // nowhere near a barline: its position is left alone
    expect(far.h).toBeCloseTo(0.10, 3); // but it is in the first row, so it has that row's height
    expect(far.y).toBeCloseTo(0.20, 3);
  });

  test('it can be switched off in Options, remembers that, and Alt skips it for one box', async ({ page }) => {
    await blankPage(page);
    await page.getByText('Options').click();
    await page.getByLabel('Line boxes up with their neighbours').uncheck();
    await page.getByText('Options').click();
    await drawBox(page, 0.10, 0.20, 0.30, 0.30);
    await drawBox(page, 0.306, 0.215, 0.50, 0.285);
    expect((await rect(page, 1)).h).toBeCloseTo(0.07, 2); // as drawn
    expect((await rect(page, 1)).x).toBeCloseTo(0.306, 2);

    await page.waitForTimeout(400);
    await page.reload();
    await expect(page.locator('.box')).toHaveCount(2); // the piece is back
    await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
    await page.getByText('Options').click();
    await expect(page.getByLabel('Line boxes up with their neighbours')).not.toBeChecked();
    await page.getByLabel('Line boxes up with their neighbours').check();
    await page.getByText('Options').click();

    await page.keyboard.down('Alt'); // on, but held off for this gesture
    await drawBox(page, 0.52, 0.215, 0.70, 0.285);
    await page.keyboard.up('Alt');
    expect((await rect(page, 2)).h).toBeCloseTo(0.07, 2);
  });

  test('after a drag a box settles onto its neighbours, unless Alt is held', async ({ page }) => {
    await detected(page);
    const peerY = (await rect(page, 0)).y;
    await page.locator('.box').nth(2).click();
    const drag = async (alt: boolean) => {
      const box = (await page.locator('.box').nth(2).boundingBox())!;
      if (alt) await page.keyboard.down('Alt');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 4, { steps: 4 }); // a few pixels down: within reach of the row
      await page.mouse.up();
      if (alt) await page.keyboard.up('Alt');
    };
    await drag(false);
    expect((await rect(page, 2)).y).toBeCloseTo(peerY, 6); // dropped slightly off, it settled into line with the row
    await drag(true);
    expect((await rect(page, 2)).y).toBeGreaterThan(peerY + 0.002); // with Alt it stays where it was dropped
  });

  test('T tidies the whole row: same top and height, bars connected', async ({ page }) => {
    await detected(page);
    await page.locator('.box').nth(1).click();
    for (let i = 0; i < 5; i++) await page.keyboard.press('Alt+Shift+ArrowDown'); // taller than the rest
    for (let i = 0; i < 4; i++) await page.keyboard.press('Alt+ArrowDown'); // and lower
    await page.keyboard.press('Alt+ArrowLeft');
    const mangled = await rect(page, 1);
    const tidyRef = await rect(page, 0);
    expect(mangled.h).not.toBeCloseTo(tidyRef.h, 3);

    await page.keyboard.press('t');
    await expect(page.getByRole('status')).toContainText('Tidied');
    const row = [await rect(page, 0), await rect(page, 1), await rect(page, 2), await rect(page, 3)];
    expect(new Set(row.map((r) => r.y)).size).toBe(1);
    expect(new Set(row.map((r) => r.h)).size).toBe(1);
    for (let k = 0; k < 3; k++) expect(row[k].x + row[k].w).toBeCloseTo(row[k + 1].x, 6);
    const second = await rect(page, 4); // the other row did not move
    expect(second.y).toBeGreaterThan(row[0].y + 0.2);

    await page.keyboard.press('t');
    await expect(page.getByRole('status')).toContainText('already tidy');
  });

  test('the Tidy row button does the same and is undoable', async ({ page }) => {
    await detected(page);
    await page.locator('.box').nth(1).click();
    for (let i = 0; i < 5; i++) await page.keyboard.press('Alt+Shift+ArrowDown');
    const mangled = await rect(page, 1);
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Tidy row' }).click();
    expect((await rect(page, 1)).h).toBeLessThan(mangled.h);
    await page.keyboard.press('Control+z');
    expect((await rect(page, 1)).h).toBeCloseTo(mangled.h, 6);
  });
});
