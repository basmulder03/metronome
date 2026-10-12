import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';
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
      await page.locator('input[type=file]').setInputFiles('e2e/fixtures/minuet-in-g.pdf');
      await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
      await page.getByRole('button', { name: 'Auto-detect' }).click();
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

    test('measure grid without a PDF', async ({ page, browser }) => {
      // build a piece without a PDF by importing a share link
      await page.goto('/');
      await page.locator('input[type=file]').setInputFiles('e2e/score.pdf');
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
