import { expect, test } from './fixtures';
import { readFileSync } from 'node:fs';
import { makePdf } from './make-pdf.mjs';

test.beforeAll(() => makePdf('e2e/score.pdf'));

const open = (page: import('@playwright/test').Page, file: string) => page.locator('header input[type=file]').setInputFiles(file);

async function drawOne(page: import('@playwright/test').Page) {
  const score = page.locator('.page');
  await expect.poll(async () => { const r = (await score.boundingBox())!; return r.height > 0; }).toBe(true);
  await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
  const b = (await score.boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.1, b.y + b.height * 0.13);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.9, b.y + b.height * 0.17, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('.box')).toHaveCount(1);
}

test('library keeps separate pieces and switches between them', async ({ page }) => {
  await page.goto('/');
  await open(page, 'e2e/score.pdf');
  await drawOne(page); // piece A: 1 measure
  await page.waitForTimeout(300);
  const before = (await page.locator('main').getAttribute('data-piece')) ?? '';
  await open(page, 'e2e/fixtures/minuet-in-g.pdf'); // piece B
  await expect(page.locator('main')).not.toHaveAttribute('data-piece', before);
  await expect(page.locator('.box')).toHaveCount(0);
  await page.getByRole('button', { name: 'Auto-detect' }).click();
  await expect(page.locator('.box')).toHaveCount(31);
  await page.waitForTimeout(300);

  await page.getByRole('button', { name: 'Library' }).click();
  const dlg = page.getByRole('dialog', { name: 'Library' });
  await expect(dlg.getByRole('listitem')).toHaveCount(2);
  await expect(dlg).toContainText('1 measures');
  await expect(dlg).toContainText('65 measures'); // both pages of the score
  await dlg.getByRole('listitem').filter({ hasText: /\b1 measures/ }).getByRole('button', { name: 'Open' }).click();
  await expect(page.locator('.box')).toHaveCount(1);
  await expect(page.getByText('1/1')).toBeVisible(); // piece A's PDF is a single page
});

test('rename and delete from the library', async ({ page }) => {
  await page.goto('/');
  await open(page, 'e2e/score.pdf');
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Library' }).click();
  const dlg = page.getByRole('dialog', { name: 'Library' });
  page.once('dialog', (d) => void d.accept('My etude'));
  await dlg.getByRole('button', { name: 'Rename' }).click();
  await expect(dlg).toContainText('My etude');
  page.once('dialog', (d) => { expect(d.message()).toContain('from all your devices'); void d.accept(); }); // sync makes deleting global
  await dlg.getByRole('button', { name: 'Delete' }).click();
  await expect(dlg).toContainText('Nothing saved yet');
});

test('several pieces can be added to a playlist or deleted together', async ({ page }) => {
  await page.goto('/');
  for (const name of ['one', 'two', 'three']) {
    const before = (await page.locator('main').getAttribute('data-piece')) ?? '';
    await page.locator('header input[type=file]').setInputFiles({ name: `${name}.pdf`, mimeType: 'application/pdf', buffer: readFileSync('e2e/score.pdf') });
    await expect(page.locator('main')).not.toHaveAttribute('data-piece', before);
  }
  await page.getByRole('button', { name: 'Playlists' }).click();
  const pls = page.getByRole('dialog', { name: 'Playlists' });
  page.once('dialog', (d) => void d.accept('Batch'));
  await pls.getByRole('button', { name: 'New playlist' }).click();
  await pls.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'Library' }).click();
  const lib = page.getByRole('dialog', { name: 'Library' });
  await lib.getByLabel('Select one', { exact: true }).check();
  await lib.getByLabel('Select two', { exact: true }).check();
  await lib.getByLabel('Add selected to playlist').selectOption({ label: 'Batch' });
  await expect(lib).toContainText('Added 2 pieces to “Batch”');
  await lib.getByLabel('Select three', { exact: true }).check();
  page.once('dialog', (d) => void d.accept());
  await lib.getByRole('button', { name: 'Delete selected' }).click();
  await expect(lib.getByRole('listitem')).toHaveCount(2);
  await expect(lib).not.toContainText('three');
});
