import { expect, test } from '@playwright/test';
import { makePdf } from './make-pdf.mjs';
import { createUser, PB, signInContext } from './fixtures';

test.beforeAll(() => makePdf('e2e/score.pdf'));

const fresh = () => `new${Date.now()}${Math.random().toString(36).slice(2, 7)}@example.com`;

test('signed-out visitors only see the sign-in page', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByText('Open PDF')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Library' })).toHaveCount(0);
  await expect(page.getByText('scores themselves never leave your device')).toBeVisible();
});

test('create an account, stay signed in across reloads, then sign out', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New here? Create an account' }).click();
  await page.getByLabel('Email').fill(fresh());
  await page.getByLabel('Password').fill('a-long-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Open PDF')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Open PDF')).toBeVisible();

  await page.getByText('Options').click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('a wrong password is explained and nothing opens', async ({ page }) => {
  const u = await createUser();
  await page.goto('/');
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('incorrect');
  await expect(page.getByText('Open PDF')).toHaveCount(0);
});

test('a short password is rejected on registration', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New here? Create an account' }).click();
  await page.getByLabel('Email').fill(fresh());
  await page.getByLabel('Password').fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Open PDF')).toHaveCount(0); // the browser blocks the form (minlength)
});

test('two accounts in one browser never see each other\'s library', async ({ page }) => {
  const a = await createUser();
  const b = await createUser();
  const signIn = async (u: { email: string; password: string }) => {
    await page.getByLabel('Email').fill(u.email);
    await page.getByLabel('Password').fill(u.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Open PDF')).toBeVisible();
  };
  const signOut = async () => {
    await page.getByText('Options').click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  };

  await page.goto('/');
  await signIn(a);
  await page.locator('input[type=file]').setInputFiles('e2e/score.pdf');
  await expect(page.locator('canvas[data-ready="1"]')).toBeVisible();
  await page.waitForTimeout(300);
  await signOut();

  await signIn(b);
  await page.getByRole('button', { name: 'Library' }).click();
  await expect(page.getByRole('dialog', { name: 'Library' })).toContainText('Nothing saved yet');
  await page.getByRole('button', { name: 'Close' }).click();
  await signOut();

  await signIn(a); // A's piece is still there
  await page.getByRole('button', { name: 'Library' }).click();
  await expect(page.getByRole('dialog', { name: 'Library' }).getByRole('listitem')).toHaveCount(1);
});

test('an account removed on the server is signed out on the next visit', async ({ browser }) => {
  const u = await createUser();
  const ctx = await browser.newContext();
  await signInContext(ctx, u);
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByText('Open PDF')).toBeVisible();

  const su = await (await fetch(`${PB}/api/collections/_superusers/auth-with-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity: 'test@example.com', password: 'test-password-123' }) })).json();
  const id = (u.record as { id: string }).id;
  expect((await fetch(`${PB}/api/collections/users/records/${id}`, { method: 'DELETE', headers: { Authorization: su.token } })).ok).toBe(true);

  await page.reload(); // the saved session is refreshed on start; the server says the account is gone
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await ctx.close();
});

test('a server that cannot be reached does not sign anyone out', async ({ browser }) => {
  const u = await createUser();
  const ctx = await browser.newContext();
  await signInContext(ctx, u);
  const page = await ctx.newPage();
  await page.route('**/api/**', (r) => r.abort('connectionrefused')); // network failure, not a rejection
  await page.goto('/');
  await expect(page.getByText('Open PDF')).toBeVisible();
  await page.waitForTimeout(500); // give the failed refresh time to settle
  await expect(page.getByRole('heading', { name: 'Sign in' })).toHaveCount(0);
  await ctx.close();
});
