import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

const rgb = (s: string) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
const lum = ([r, g, b]: number[]) => {
  const f = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const colors = (page: Page, sel: string) =>
  page.locator(sel).first().evaluate((e) => ({ fg: getComputedStyle(e).color, bg: getComputedStyle(e).backgroundColor }));

test('follows the OS colour scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(255, 255, 255)');
  await page.emulateMedia({ colorScheme: 'dark' });
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(22, 22, 26)');
});

for (const scheme of ['light', 'dark'] as const) {
  test(`text and primary button meet WCAG AA contrast in ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const body = await colors(page, 'body');
    expect(contrast(body.fg, body.bg)).toBeGreaterThan(4.5);
    const primary = await colors(page, 'button.primary');
    expect(contrast(primary.fg, primary.bg)).toBeGreaterThan(4.5);
    const muted = await page.locator('aside .mut').first().evaluate((e) => ({ fg: getComputedStyle(e).color, bg: getComputedStyle(document.body).backgroundColor }));
    expect(contrast(muted.fg, muted.bg)).toBeGreaterThan(4.5);
  });
}

test('theme toggle overrides the OS, persists, and returns to system', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByText('Options').click();
  const toggle = page.getByRole('button', { name: /^Theme:/ });
  await expect(toggle).toHaveAccessibleName('Theme: system');
  await toggle.click(); // light
  await toggle.click(); // dark
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(22, 22, 26)'); // OS says light, override wins
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByText('Options').click();
  await expect(page.getByRole('button', { name: /^Theme:/ })).toHaveAccessibleName('Theme: dark');
  await page.getByRole('button', { name: /^Theme:/ }).click(); // system
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
});

test('score page stays white in dark mode so notation remains legible', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('header input[type=file]').setInputFiles('e2e/fixtures/minuet-in-g.pdf');
  expect(await page.locator('.page').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)');
});
