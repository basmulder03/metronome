import { expect, test } from '@playwright/test';
import { startBackend, type Backend } from './backend';

// Own backend with the real rate limits on (the shared test backend relaxes them).
let pb: Backend;
test.beforeAll(async () => { pb = await startBackend({ port: 8092, relaxLimits: false }); });
test.afterAll(() => pb?.stop());
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'server-only'));

const post = (path: string, body: unknown) => pb.call(path, { method: 'POST', body: JSON.stringify(body) });

test('repeated wrong passwords get rate limited', async () => {
  const codes: number[] = [];
  for (let i = 0; i < 13; i++) codes.push((await post('/api/collections/users/auth-with-password', { identity: 'nobody@example.com', password: 'wrong-password' })).status);
  expect(codes.slice(0, 10).every((c) => c === 400)).toBe(true);
  expect(codes.slice(10)).toEqual([429, 429, 429]);
});

test('registration attempts are rate limited, whatever their outcome', async () => {
  const codes: number[] = [];
  for (let i = 0; i < 7; i++) codes.push((await post('/api/metronome/register', { email: `spam${i}@example.com`, password: 'password123' })).status);
  expect(codes.slice(0, 5).every((c) => c === 403)).toBe(true); // invitation only by default
  expect(codes.slice(5)).toEqual([429, 429]);
});

test('invitation lookups are rate limited so tokens cannot be guessed quickly', async () => {
  const codes: number[] = [];
  for (let i = 0; i < 33; i++) codes.push((await pb.call(`/api/metronome/invite?token=guess${i}`)).status);
  expect(codes.slice(0, 30).every((c) => c === 404)).toBe(true);
  expect(codes.slice(30).every((c) => c === 429)).toBe(true);
});

test('nothing is readable without an account', async () => {
  const anon = await (await pb.call('/api/collections/pieces/records')).json();
  expect(anon.totalItems ?? 0).toBe(0); // owner-only rules
});
