import { expect, request, test as base } from '@playwright/test';

export { expect };
export const PB = 'http://127.0.0.1:8094'; // the test backend (see playwright.config.ts)

export type TestUser = { email: string; password: string; token: string; record: unknown };

/** Creates a fresh user on the test backend the way an operator would (the public API no longer allows it). */
export async function createUser(): Promise<TestUser> {
  const email = `u${Date.now()}${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = 'password123';
  const api = await request.newContext({ baseURL: PB });
  const su = await (await api.post('/api/collections/_superusers/auth-with-password', { data: { identity: 'test@example.com', password: 'test-password-123' } })).json();
  const made = await api.post('/api/collections/users/records', { data: { email, password, passwordConfirm: password }, headers: { Authorization: su.token } });
  if (!made.ok()) throw new Error(`could not create a test user: ${await made.text()}`);
  const r = await (await api.post('/api/collections/users/auth-with-password', { data: { identity: email, password } })).json();
  await api.dispose();
  return { email, password, token: r.token, record: r.record };
}

/** Puts a user's session into a browser context, as if they had signed in there. */
export async function signInContext(context: import('@playwright/test').BrowserContext, user: TestUser) {
  await context.addInitScript(([t, r]) => localStorage.setItem('pocketbase_auth', JSON.stringify({ token: t, record: r })), [user.token, user.record] as const);
}

/** Tests get a signed-in browser by default; `user` is the account behind it. */
export const test = base.extend<{ user: TestUser; pageErrors: void }>({
  // an uncaught error in the page fails the test, even if everything the test looks at still works
  pageErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await use();
    expect(errors, 'uncaught errors in the page').toEqual([]);
  }, { auto: true }],
  user: async ({}, use) => use(await createUser()),
  context: async ({ context, user }, use) => {
    await signInContext(context, user);
    await use(context);
  },
});
