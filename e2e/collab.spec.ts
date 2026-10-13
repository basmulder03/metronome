import { expect, test, createUser, signInContext } from './fixtures';
import type { Page } from '@playwright/test';
import { makePdf } from './make-pdf.mjs';

test.beforeAll(() => makePdf('e2e/score.pdf'));
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'two accounts talking to the server: the screen size does not matter'));

const syncNow = async (page: Page) => {
  await page.getByText('Options', { exact: true }).click();
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByRole('button', { name: 'Sync now' })).toBeEnabled();
  await page.getByText('Options', { exact: true }).click(); // close it again
};

/** The owner makes a piece of 8 measures and gets a link that also lets others edit it. */
async function ownerShares(page: Page) {
  await page.goto('/');
  await page.locator('header input[type=file]').setInputFiles('e2e/score.pdf');
  await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
  await page.getByRole('button', { name: 'Auto-detect' }).click();
  await expect(page.locator('.box')).toHaveCount(8);
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Library' }).click();
  const lib = page.getByRole('dialog', { name: 'Library' });
  await lib.getByLabel(/also let people with an account edit/).check();
  await lib.getByRole('button', { name: 'Share', exact: true }).click();
  const url = await lib.getByLabel('Share link').inputValue();
  expect(url).toMatch(/#s=/);
  await lib.getByRole('button', { name: 'Close' }).click();
  return url;
}

async function joined(browser: import('@playwright/test').Browser, url: string) {
  const ctx = await browser.newContext();
  await signInContext(ctx, await createUser());
  const page = await ctx.newPage();
  await page.goto(url);
  const dlg = page.getByRole('dialog', { name: 'Import shared piece' });
  await expect(dlg).toContainText('lets people with an account edit this piece');
  await dlg.getByRole('button', { name: 'Edit together' }).click();
  await expect(page.locator('.tile')).toHaveCount(8);
  return { ctx, page };
}

test('two people edit the same piece, one of them offline, and both edits end up in both copies', async ({ page, browser }) => {
  const url = await ownerShares(page);
  const { ctx, page: other } = await joined(browser, url);

  // the other person goes offline and sets a tempo on measure 6
  await ctx.setOffline(true);
  await other.locator('.tile').nth(5).click();
  await other.getByRole('button', { name: 'Set tempo here' }).click();
  await other.getByLabel('BPM').first().fill('90');
  await other.waitForTimeout(500);

  // meanwhile the owner puts 3/4 on measure 2 and it reaches the server
  await page.locator('.box').nth(1).click();
  await page.getByRole('button', { name: 'Change time signature here' }).click();
  await page.getByLabel('Beats', { exact: true }).fill('3');
  await page.getByLabel('Note').selectOption('4');
  await page.waitForTimeout(500);
  await syncNow(page);

  // back online: the other person's sync merges instead of overwriting the owner's change
  await ctx.setOffline(false);
  await syncNow(other);
  await expect(other.locator('.tile').nth(1)).toContainText('3/4');
  await expect(other.locator('.tile').nth(5)).toContainText('=90');

  await syncNow(page);
  await expect(page.locator('.box').nth(1)).toContainText('3/4');
  await expect(page.locator('.box').nth(5)).toContainText('=90');
  await ctx.close();
});

test('both add boxes and edit the same measure: nothing is lost, boxes are not doubled', async ({ page, browser }) => {
  const url = await ownerShares(page);
  const { ctx, page: other } = await joined(browser, url);

  await ctx.setOffline(true);
  await other.locator('.tile').nth(2).click();
  await other.getByLabel('Repeat starts here').check(); // a mark on measure 3
  await other.waitForTimeout(500);

  await page.locator('.box').nth(2).click();
  await page.getByLabel('Repeat ends here').check(); // another mark on the same measure
  await page.locator('.box').nth(3).click();
  await page.getByRole('button', { name: 'Delete box' }).click(); // and the owner removes measure 4
  await page.waitForTimeout(500);
  await syncNow(page);

  await ctx.setOffline(false);
  await syncNow(other);
  await syncNow(page);
  for (const p of [page, other]) {
    const boxes = p === page ? p.locator('.box') : p.locator('.tile');
    await expect(boxes).toHaveCount(7); // the removal holds
    await expect(boxes.nth(2)).toContainText('|:'); // both marks on measure 3
    await expect(boxes.nth(2)).toContainText(':|');
  }
  await ctx.close();
});

test('the owner can end editing together, and the other person keeps their own copy', async ({ page, browser }) => {
  const url = await ownerShares(page);
  const { ctx, page: other } = await joined(browser, url);

  await page.getByRole('button', { name: 'Library' }).click();
  await page.getByRole('dialog', { name: 'Library' }).getByRole('button', { name: 'My links' }).click();
  const mine = page.getByRole('dialog', { name: 'My links' });
  await expect(mine).toContainText('Editing together');
  page.once('dialog', (d) => void d.accept());
  await mine.getByRole('button', { name: /^Stop .* editing/ }).click();
  await expect(mine).not.toContainText('Editing together');
  await mine.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('dialog', { name: 'Library' }).getByRole('button', { name: 'Close' }).click();

  await syncNow(other);
  await other.locator('.tile').nth(0).click();
  await other.getByRole('button', { name: 'Set tempo here' }).click();
  await other.getByLabel('BPM').first().fill('77');
  await other.waitForTimeout(500);
  await syncNow(other);
  await syncNow(page);
  await expect(other.locator('.tile').nth(0)).toContainText('=77'); // theirs, still there
  await expect(page.locator('.box').nth(0)).not.toContainText('=77'); // but no longer the owner's piece
  await ctx.close();
});
