import { expect, test, signInContext, PB } from './fixtures';
import type { Browser, Page } from '@playwright/test';
import { makePdf } from './make-pdf.mjs';

test.beforeAll(() => makePdf('e2e/score.pdf'));
// device sync is not layout dependent: one project is enough
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'desktop only'));

const device = async (browser: Browser, user: Parameters<typeof signInContext>[1]) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await signInContext(ctx, user);
  return { ctx, page: await ctx.newPage() };
};

async function syncNow(page: Page) {
  if (!(await page.locator('details.opts[open]').count())) await page.getByText('Options').click();
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByText('Up to date')).toBeVisible();
}

/** Device A: upload the score, detect 8 measures, tempo 100 on measure 1. */
async function createPiece(page: Page) {
  await page.goto('/');
  await page.locator('header input[type=file]').setInputFiles('e2e/score.pdf');
  await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
  await page.getByRole('button', { name: 'Auto-detect' }).click();
  await expect(page.locator('.box')).toHaveCount(8);
  await page.locator('.box').first().click();
  await page.getByRole('button', { name: 'Set tempo here' }).click();
  await page.getByLabel('BPM').first().fill('100');
  await page.waitForTimeout(300);
}

async function openOnB(b: Page) {
  await b.goto('/');
  await b.getByRole('button', { name: 'Library' }).click();
  const dlg = b.getByRole('dialog', { name: 'Library' });
  await expect(dlg.getByRole('listitem')).toHaveCount(1); // pulled automatically at start
  await dlg.getByRole('button', { name: 'Open' }).click();
  await expect(b.getByRole('button', { name: /^Measure \d/ })).toHaveCount(8);
}

test('a piece appears on a second device with its markup but without the PDF', async ({ page, browser, user }) => {
  await createPiece(page);
  await syncNow(page);
  const { ctx, page: b } = await device(browser, user);
  await openOnB(b);
  await expect(b.getByRole('button', { name: 'Measure 1' })).toContainText('=100');
  await expect(b.locator('label.file')).toContainText('Attach PDF'); // the score itself stays on device A
  await ctx.close();
});

test('edits flow both ways and the latest edit wins', async ({ page, browser, user }) => {
  await createPiece(page);
  await syncNow(page);
  const { ctx, page: b } = await device(browser, user);
  await openOnB(b);

  await b.getByRole('button', { name: 'Measure 1' }).click();
  await b.getByLabel('BPM').first().fill('120');
  await b.waitForTimeout(300);
  await syncNow(b);

  await syncNow(page); // A pulls B's edit and shows it on the open piece
  await expect(page.locator('.box').first()).toContainText('=120');

  await page.locator('.box').first().click();
  await page.getByLabel('BPM').first().fill('90'); // A edits last
  await page.waitForTimeout(300);
  await syncNow(page);
  await syncNow(b);
  await expect(b.getByRole('button', { name: 'Measure 1' })).toContainText('=90');
  await ctx.close();
});

test('deleting on one device removes it on the other', async ({ page, browser, user }) => {
  await createPiece(page);
  await syncNow(page);
  const { ctx, page: b } = await device(browser, user);
  await openOnB(b);

  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Library' }).click();
  await page.getByRole('dialog', { name: 'Library' }).getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog', { name: 'Library' }).getByRole('button', { name: 'Close' }).click();
  await syncNow(page);

  await syncNow(b);
  await expect(b.getByText('deleted on another device')).toBeVisible();
  await b.getByRole('button', { name: 'Library' }).click();
  await expect(b.getByRole('dialog', { name: 'Library' })).toContainText('Nothing saved yet');
  // and the deletion sticks: another sync does not bring it back
  await b.getByRole('button', { name: 'Close' }).click();
  await syncNow(b);
  await b.getByRole('button', { name: 'Library' }).click();
  await expect(b.getByRole('dialog', { name: 'Library' })).toContainText('Nothing saved yet');
  await ctx.close();
});

test('playlists sync too', async ({ page, browser, user }) => {
  await createPiece(page);
  await page.getByRole('button', { name: 'Playlists' }).click();
  const dlg = page.getByRole('dialog', { name: 'Playlists' });
  page.once('dialog', (d) => void d.accept('Gig'));
  await dlg.getByRole('button', { name: 'New playlist' }).click();
  await dlg.getByLabel('Add a piece').selectOption({ label: 'score' });
  await expect(dlg.getByRole('listitem')).toHaveCount(1);
  await page.waitForTimeout(300);
  await dlg.getByRole('button', { name: 'Close' }).click();
  await syncNow(page);

  const { ctx, page: b } = await device(browser, user);
  await b.goto('/');
  await b.getByRole('button', { name: 'Playlists' }).click();
  const d2 = b.getByRole('dialog', { name: 'Playlists' });
  await expect(d2.getByLabel('Playlist').locator('option', { hasText: 'Gig' })).toHaveCount(1);
  await d2.getByLabel('Playlist').selectOption({ label: 'Gig' });
  await expect(d2.getByRole('listitem')).toHaveCount(1);
  await expect(d2.getByRole('listitem')).toContainText('score');
  await ctx.close();
});

test('edits made offline sync when the connection returns', async ({ page, browser, user }) => {
  await createPiece(page);
  await syncNow(page);
  const { ctx, page: b } = await device(browser, user);
  await openOnB(b);

  await page.context().setOffline(true);
  await page.locator('.box').first().click();
  await page.getByLabel('BPM').first().fill('77');
  await page.waitForTimeout(300);
  if (!(await page.locator('details.opts[open]').count())) await page.getByText('Options').click();
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByText(/Offline/)).toBeVisible();

  await page.context().setOffline(false); // the browser's online event triggers a sync by itself
  await expect(page.getByText('Up to date')).toBeVisible({ timeout: 10_000 });
  await syncNow(b);
  await expect(b.getByRole('button', { name: 'Measure 1' })).toContainText('=77');
  await ctx.close();
});

test('only markup reaches the server, never the PDF', async ({ page, user, request }) => {
  await createPiece(page);
  await syncNow(page);
  const res = await request.get(`${PB}/api/collections/pieces/records`, { headers: { Authorization: user.token } });
  const body = await res.text();
  const { items } = JSON.parse(body);
  expect(items).toHaveLength(1);
  expect(items[0].markup.measures).toHaveLength(8);
  // exactly the markup fields: nothing that could carry a file
  expect(Object.keys(items[0]).sort()).toEqual(['clientId', 'collectionId', 'collectionName', 'deleted', 'id', 'markup', 'owner', 'title', 'updatedAt'].sort());
  expect(body).not.toContain('JVBERi'); // base64 of "%PDF-1"
  expect(body.length).toBeLessThan(20_000);
});

test('someone else cannot read my pieces', async ({ page, request, user }) => {
  await createPiece(page);
  await syncNow(page);
  const { createUser } = await import('./fixtures');
  const other = await createUser();
  const res = await request.get(`${PB}/api/collections/pieces/records`, { headers: { Authorization: other.token } });
  expect((await res.json()).totalItems).toBe(0);
  const anon = await request.get(`${PB}/api/collections/pieces/records`);
  expect((await anon.json()).totalItems).toBe(0);
  void user;
});
