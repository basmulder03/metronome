import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { makePdf } from './make-pdf.mjs';

test.beforeAll(() => makePdf('e2e/score.pdf'));

async function detected(page: Page) {
  await page.goto('/');
  await page.locator('header input[type=file]').setInputFiles('e2e/score.pdf');
  await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
  await page.getByRole('button', { name: 'Auto-detect' }).click();
  await expect(page.locator('.box')).toHaveCount(8);
}

test('the app opens in Select mode', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true');
});

test('the playback bar is always at the bottom and its slider picks the measure', async ({ page }) => {
  await page.goto('/');
  const bar = page.getByRole('group', { name: 'Playback' });
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('No measures yet');

  await detected(page);
  const b = (await bar.boundingBox())!;
  expect(b.y + b.height).toBeCloseTo(page.viewportSize()!.height, 0); // pinned to the bottom edge
  await expect(bar).toContainText('Measure 1 of 8');
  await page.getByLabel('Position in the piece').fill('5');
  await expect(page.locator('.box').nth(5)).toHaveClass(/sel/);
  await expect(bar).toContainText('Measure 6 of 8');
});

test('while playing, the bar follows the click, and dragging it moves playback', async ({ page }) => {
  await detected(page);
  await page.locator('.box').nth(0).click();
  await page.getByRole('button', { name: 'Set tempo here' }).click();
  await page.getByLabel('BPM').first().fill('400'); // 0.6 s a bar
  await page.getByRole('button', { name: /^Play( from|$)/ }).click();
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Playback' })).toContainText(/Measure [3-8] of 8/);
  await page.getByLabel('Position in the piece').fill('6');
  await expect(page.locator('.box.playing')).toHaveCount(1);
  await expect(page.getByRole('group', { name: 'Playback' })).toContainText(/Measure [67] of 8/);
  await page.getByRole('button', { name: 'Stop' }).click();
});

test('click pattern, sound and volume are chosen in the bar and remembered', async ({ page }) => {
  await detected(page);
  await page.getByRole('group', { name: 'Playback' }).getByText('Sound', { exact: true }).click();
  await page.locator('.sound select').first().selectOption('all');
  await page.locator('.sound select').nth(1).selectOption('wood');
  await page.locator('.sound select').nth(2).selectOption('alternate');
  await page.locator('.sound input[type=range]').last().fill('0.5');
  await page.locator('.sound input[type=range]').last().dispatchEvent('change');
  await page.reload();
  await page.getByRole('group', { name: 'Playback' }).getByText('Sound', { exact: true }).click();
  await expect(page.locator('.sound select').first()).toHaveValue('all');
  await expect(page.locator('.sound select').nth(1)).toHaveValue('wood');
  await expect(page.locator('.sound select').nth(2)).toHaveValue('alternate');
  await expect(page.locator('.sound input[type=range]').last()).toHaveValue('0.5');
});
