import AxeBuilder from '@axe-core/playwright';
import { expect, test, PB, signInContext } from './fixtures';
import { ADMIN } from './backend';
import type { Page } from '@playwright/test';
import { makePdf } from './make-pdf.mjs';

test.beforeAll(() => makePdf('e2e/score.pdf'));
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'run once per theme below'));

const audit = async (page: Page, label: string) => {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const summary = violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help} → ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
  expect(summary, `${label}: accessibility violations`).toEqual([]);
};

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.use({ colorScheme: scheme });

    test('sign-in page', async ({ browser }) => {
      const ctx = await browser.newContext({ colorScheme: scheme });
      const page = await ctx.newPage();
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
      await audit(page, 'sign-in');
      await ctx.close();
    });

    test('editor with a piece selected, inspector open', async ({ page }) => {
      await page.goto('/');
      await page.locator('header input[type=file]').setInputFiles('e2e/fixtures/minuet-in-g.pdf');
      await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
      await page.getByRole('button', { name: 'Auto-detect' }).click();
      await expect(page.getByRole('status').first()).toContainText('Found'); // detection has finished: it clears the selection when it ends, so wait before picking a box
      await page.locator('.box').nth(2).click();
      await page.getByRole('button', { name: 'Set tempo here' }).click();
      await page.getByRole('button', { name: 'Accelerando from here' }).click();
      await audit(page, 'editor');
      await page.getByRole('button', { name: 'Read from PDF' }).click();
      await expect(page.getByRole('dialog', { name: 'Read from PDF' })).toBeVisible();
      await audit(page, 'read from PDF dialog');
    });

    test('dialogs and the options panel', async ({ page }) => {
      await page.goto('/');
      await page.getByText('Options').click();
      await audit(page, 'options');
      await page.getByText('Options').click();
      await page.getByRole('button', { name: 'Library' }).click();
      await audit(page, 'library');
      await page.getByRole('button', { name: 'Close' }).click();
      await page.getByRole('button', { name: 'Playlists' }).click();
      await audit(page, 'playlists');
    });

    test('admin panel (every tab, with an invitation QR open) and the invitation page', async ({ browser }) => {
      const login = await (await fetch(`${PB}/api/collections/users/auth-with-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity: ADMIN.email, password: ADMIN.password }) })).json();
      const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 1280, height: 900 } });
      await signInContext(ctx, { email: ADMIN.email, password: ADMIN.password, token: login.token, record: login.record });
      const page = await ctx.newPage();
      await page.goto('/');
      await page.getByRole('button', { name: 'Admin' }).click();
      const panel = page.getByRole('dialog', { name: 'Administration' });
      await panel.getByLabel('Name').fill('Axe');
      await panel.getByRole('button', { name: 'Create invitation' }).click();
      await expect(panel.getByRole('img', { name: /QR code/ }).locator('svg')).toBeVisible();
      const link = await panel.getByLabel('Invitation link for Axe').inputValue();
      await audit(page, 'admin: invitations');
      await panel.getByRole('button', { name: 'Users' }).click();
      await expect(panel.getByRole('listitem').first()).toBeVisible();
      await audit(page, 'admin: users');
      await panel.getByRole('button', { name: 'Settings' }).click();
      await audit(page, 'admin: settings');
      await ctx.close();

      const g = await browser.newContext({ colorScheme: scheme });
      const gp = await g.newPage();
      await gp.goto(link.replace(/^https?:\/\/[^/]+/, `http://localhost:5175`));
      await expect(gp.getByRole('heading', { name: 'Join Metronome' })).toBeVisible();
      await audit(gp, 'invitation page');
      await g.close();
    });

    test('measure grid without a PDF', async ({ page, browser }) => {
      // build a piece without a PDF by importing a share link
      await page.goto('/');
      await page.locator('header input[type=file]').setInputFiles('e2e/score.pdf');
      await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
      await page.getByRole('button', { name: 'Auto-detect' }).click();
      await page.locator('.box').first().click();
      await page.getByRole('button', { name: 'Set tempo here' }).click();
      await page.waitForTimeout(300);
      await page.getByRole('button', { name: 'Library' }).click();
      await page.getByRole('dialog', { name: 'Library' }).getByRole('button', { name: 'Share' }).click();
      const url = await page.getByLabel('Share link').inputValue();
      const ctx = await browser.newContext({ colorScheme: scheme });
      const g = await ctx.newPage();
      await g.goto(url);
      await expect(g.getByText('shared with you')).toBeVisible();
      await audit(g, 'guest view');
      await ctx.close();
    });
  });
}
