import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { copyFileSync, readFileSync } from 'node:fs';
import { makePdf } from './make-pdf.mjs';

test.beforeAll(() => { makePdf('e2e/score.pdf'); copyFileSync('e2e/score.pdf', 'e2e/score-b.pdf'); });

/** A piece of 8 detected measures at 400 bpm (0.6 s per bar, 4.8 s total). */
async function addPiece(page: Page, file: string) {
  const before = (await page.locator('main').getAttribute('data-piece')) ?? '';
  await page.locator('header input[type=file]').setInputFiles(file);
  await expect(page.locator('main')).not.toHaveAttribute('data-piece', before); // the new piece is open
  const score = page.locator('.page');
  await expect.poll(async () => { const r = (await score.boundingBox())!; return Math.round((r.height / r.width) * 100); }).toBe(133);
  await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
  await page.getByRole('button', { name: 'Auto-detect' }).click();
  await expect(page.locator('.box')).toHaveCount(8);
  await page.locator('.box').first().click();
  await page.getByRole('button', { name: 'Set tempo here' }).click();
  await page.getByLabel('BPM').first().fill('400');
  await page.waitForTimeout(400);
}

async function buildPlaylist(page: Page) {
  await page.goto('/');
  await addPiece(page, 'e2e/score.pdf'); // titled "score"
  await addPiece(page, 'e2e/score-b.pdf'); // titled "score-b"
  await page.getByRole('button', { name: 'Playlists' }).click();
  const dlg = page.getByRole('dialog', { name: 'Playlists' });
  page.once('dialog', (d) => void d.accept('Gig'));
  await dlg.getByRole('button', { name: 'New playlist' }).click();
  await dlg.getByLabel('Add a piece').selectOption({ label: 'score' });
  await dlg.getByLabel('Add a piece').selectOption({ label: 'score-b' });
  await expect(dlg.getByRole('listitem')).toHaveCount(2);
  await dlg.getByRole('listitem').nth(1).getByRole('button', { name: 'Move up' }).click(); // score-b first
  await expect(dlg.getByRole('listitem').first()).toContainText('score-b');
  await dlg.getByLabel('Gap between pieces').fill('1');
  await dlg.getByLabel('Gap between pieces').blur();
  return dlg;
}

test('playlist plays pieces in order with a gap and shows what is playing', async ({ page }) => {
  const dlg = await buildPlaylist(page);
  await dlg.getByRole('button', { name: 'Play playlist' }).click();
  const status = dlg.getByRole('status');
  await expect(status).toContainText('Playing 1 of 2');
  await expect(status).toContainText('score-b');
  await expect(status).toContainText(/Measure \d/);
  await expect(status).toContainText('Between pieces', { timeout: 9000 });
  await expect(status).toContainText('Next: score');
  await expect(status).toContainText('Playing 2 of 2', { timeout: 4000 });
  await expect(dlg.getByRole('button', { name: 'Play playlist' })).toBeVisible({ timeout: 9000 }); // finished by itself
});

test('stopping mid-playlist returns to the editor and plays nothing more', async ({ page }) => {
  const dlg = await buildPlaylist(page);
  await dlg.getByRole('button', { name: 'Play playlist' }).click();
  await expect(dlg.getByRole('status')).toContainText('Playing 1 of 2');
  await dlg.getByRole('button', { name: 'Stop' }).click();
  await expect(dlg.getByRole('button', { name: 'Play playlist' })).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(dlg.getByRole('status')).toHaveCount(0);
});

test('one WAV for the whole playlist is the pieces plus the gap', async ({ page }) => {
  const dlg = await buildPlaylist(page);
  const dl = page.waitForEvent('download');
  await dlg.getByRole('button', { name: 'Export one WAV' }).click();
  const download = await dl;
  expect(download.suggestedFilename()).toBe('Gig.wav');
  const buf = readFileSync((await download.path())!);
  const seconds = buf.readUInt32LE(40) / 2 / buf.readUInt32LE(24);
  expect(seconds).toBeCloseTo(2 * (4.8 + 0.5) + 1, 0); // two pieces with a 0.5 s tail each, 1 s gap
});

test('a deleted piece is skipped and shown as deleted', async ({ page }) => {
  const dlg = await buildPlaylist(page);
  await dlg.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Library' }).click();
  const lib = page.getByRole('dialog', { name: 'Library' });
  page.once('dialog', (d) => void d.accept());
  await lib.getByRole('listitem').filter({ hasText: 'score-b' }).getByRole('button', { name: 'Delete' }).click();
  await lib.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Playlists' }).click();
  await expect(dlg.getByRole('listitem').first()).toContainText('(deleted piece)');
  const dl = page.waitForEvent('download');
  await dlg.getByRole('button', { name: 'Export one WAV' }).click();
  const buf = readFileSync((await (await dl).path())!);
  expect(buf.readUInt32LE(40) / 2 / buf.readUInt32LE(24)).toBeCloseTo(4.8 + 0.5, 0); // only the surviving piece
});
