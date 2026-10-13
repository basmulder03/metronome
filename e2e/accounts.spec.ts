import { expect, test as base, type Browser, type Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { ADMIN, startBackend, type Backend } from './backend';
import { signInContext } from './fixtures';

// A backend of its own (serving the built app) because these tests change the registration mode.
// Serial and desktop-only: the tests share that one backend's state.
const test = base;
test.describe.configure({ mode: 'serial' });
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'shared backend state'));

let pb: Backend;
let adminToken: string;
test.beforeAll(async () => {
  pb = await startBackend({ port: 8097, publicDir: 'dist' });
  adminToken = (await pb.login(ADMIN.email, ADMIN.password)).token;
});
test.afterAll(() => pb?.stop());

const fresh = (p = 'user') => `${p}${Date.now()}${Math.random().toString(36).slice(2, 6)}@example.com`;
const admin = (path: string, method = 'GET', body?: unknown, token = adminToken) =>
  pb.call(`/api/metronome/admin/${path}`, { method, headers: { Authorization: token }, ...(body ? { body: JSON.stringify(body) } : {}) });
const post = (path: string, body: unknown) => pb.call(path, { method: 'POST', body: JSON.stringify(body) });
const makeInvite = async (name = 'Anna', extra: object = {}) => (await (await admin('invites', 'POST', { name, ...extra })).json()) as { id: string; token: string; status: string };
const register = (email: string, invite?: string, password = 'password123') => post('/api/metronome/register', { email, password, ...(invite ? { invite } : {}) });

test.describe('the rules (API)', () => {
  test('invitation only is the default: registering without an invitation is refused', async () => {
    expect((await (await pb.call('/api/metronome/config')).json()).registration).toBe('invite');
    const r = await register(fresh());
    expect(r.status).toBe(403);
    expect((await r.json()).message).toContain('invitation');
  });

  test('accounts cannot be created or promoted around the register route', async () => {
    const direct = await pb.call('/api/collections/users/records', { method: 'POST', body: JSON.stringify({ email: fresh(), password: 'password123', passwordConfirm: 'password123' }) });
    expect(direct.status).toBe(403);
    const u = await pb.createUser(fresh());
    for (const patch of [{ role: 'admin' }, { blocked: false }, { blockReason: 'x' }]) {
      const r = await pb.call(`/api/collections/users/records/${u.record.id}`, { method: 'PATCH', headers: { Authorization: u.token }, body: JSON.stringify(patch) });
      expect(r.ok, `PATCH ${JSON.stringify(patch)} must not work`).toBe(false);
    }
    expect((await pb.call(`/api/collections/users/records/${u.record.id}`, { method: 'DELETE', headers: { Authorization: u.token } })).ok).toBe(false);
  });

  test('every admin route: anonymous gets 401, a normal user 403, an admin is let in', async () => {
    const user = await pb.createUser(fresh());
    const routes: [string, string, unknown?][] = [
      ['GET', 'settings'], ['PUT', 'settings', { registration: 'invite' }], ['GET', 'invites'], ['POST', 'invites', { name: 'x' }],
      ['DELETE', 'invites/aaaaaaaaaaaaaaa'], ['GET', 'users'], ['POST', 'users/aaaaaaaaaaaaaaa/block', {}], ['POST', 'users/aaaaaaaaaaaaaaa/unblock'],
      ['POST', 'users/aaaaaaaaaaaaaaa/role', { role: 'admin' }], ['DELETE', 'users/aaaaaaaaaaaaaaa'],
    ];
    for (const [method, path, body] of routes) {
      const opts = { method, ...(body ? { body: JSON.stringify(body) } : {}) };
      expect((await pb.call(`/api/metronome/admin/${path}`, opts)).status, `anonymous ${method} ${path}`).toBe(401);
      expect((await pb.call(`/api/metronome/admin/${path}`, { ...opts, headers: { Authorization: user.token } })).status, `user ${method} ${path}`).toBe(403);
      const asAdmin = (await pb.call(`/api/metronome/admin/${path}`, { ...opts, headers: { Authorization: adminToken } })).status;
      expect(asAdmin, `admin ${method} ${path}`).not.toBe(401);
      expect(asAdmin, `admin ${method} ${path}`).not.toBe(403);
    }
  });

  test('an invitation works exactly once and cannot be forged', async () => {
    const inv = await makeInvite('Anna');
    expect(inv.status).toBe('pending');
    expect(await (await pb.call(`/api/metronome/invite?token=${inv.token}`)).json()).toMatchObject({ name: 'Anna' });

    const [id, exp, sig] = inv.token.split('.');
    const forged = [`${id}.${exp}.${sig.slice(0, -1)}${sig.endsWith('0') ? '1' : '0'}`, `${id}.${Number(exp) + 86400}.${sig}`, `aaaaaaaaaaaaaaa.${exp}.${sig}`, `${id}.${exp}`, 'nonsense', ''];
    for (const t of forged) {
      expect((await pb.call(`/api/metronome/invite?token=${t}`)).status, `forged ${t}`).toBe(404);
      expect((await register(fresh(), t)).status, `register with forged ${t}`).toBe(t === '' ? 403 : 400); // an empty token is simply no invitation
    }

    const email = fresh('anna');
    expect((await register(email, inv.token)).status).toBe(200);
    expect((await pb.login(email, 'password123')).status).toBe(200);
    expect((await register(fresh(), inv.token)).status).toBe(400); // used
    expect((await pb.call(`/api/metronome/invite?token=${inv.token}`)).status).toBe(404);
    const list = (await (await admin('invites')).json()).invites;
    expect(list.find((i: { id: string }) => i.id === inv.id)).toMatchObject({ status: 'used', token: '' }); // no link kept for used ones
  });

  test('two people using one link at the same moment: only one account is made', async () => {
    const inv = await makeInvite('Race');
    const results = await Promise.all([register(fresh('a'), inv.token), register(fresh('b'), inv.token), register(fresh('c'), inv.token)]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
  });

  test('an invitation tied to an email only works for that address', async () => {
    const email = fresh('locked');
    const inv = await makeInvite('Locked', { email });
    expect((await (await pb.call(`/api/metronome/invite?token=${inv.token}`)).json()).email).toBe(email);
    expect((await register(fresh('other'), inv.token)).status).toBe(400);
    expect((await register(email.toUpperCase(), inv.token)).status).toBe(200); // case does not matter
  });

  test('revoked and re-dated invitations stop working', async () => {
    const revoked = await makeInvite('Revoked');
    expect((await admin(`invites/${revoked.id}`, 'DELETE')).ok).toBe(true);
    expect((await pb.call(`/api/metronome/invite?token=${revoked.token}`)).status).toBe(404);
    expect((await register(fresh(), revoked.token)).status).toBe(400);

    const moved = await makeInvite('Moved');
    await pb.asSuper(`/api/collections/invites/records/${moved.id}`, { method: 'PATCH', body: JSON.stringify({ expiresAt: 1 }) }); // expired
    expect((await pb.call(`/api/metronome/invite?token=${moved.token}`)).status).toBe(404);
  });

  test('open registration lets people join, closing it stops them, invitations work in both modes', async () => {
    expect((await admin('settings', 'PUT', { registration: 'open' })).ok).toBe(true);
    expect((await (await pb.call('/api/metronome/config')).json()).registration).toBe('open');
    expect((await register(fresh('self'))).status).toBe(200);
    const inv = await makeInvite('InOpen');
    expect((await register(fresh('invited'), inv.token)).status).toBe(200);

    expect((await admin('settings', 'PUT', { registration: 'invite' })).ok).toBe(true);
    expect((await register(fresh('late'))).status).toBe(403);
    expect((await register(fresh('invited2'), (await makeInvite('InClosed')).token)).status).toBe(200);
    expect((await admin('settings', 'PUT', { registration: 'nonsense' })).status).toBe(400);
  });

  test('sign-up input is validated and gives no hints about other accounts', async () => {
    const inv1 = (await makeInvite('V1')).token;
    expect((await register('not-an-email', inv1)).status).toBe(400);
    expect((await register(fresh(), inv1, 'short')).status).toBe(400);
    expect((await register(fresh(), inv1, 'x'.repeat(73))).status).toBe(400);
    const taken = fresh('taken');
    await pb.createUser(taken);
    const r = await register(taken, (await makeInvite('V2')).token);
    expect(r.status).toBe(400);
    expect((await r.json()).message).toBe('This email address cannot be used.'); // same words for taken or otherwise unusable
  });

  test('blocking ends sessions at once, denies sign-in, hides nothing from the wrong password, and unblocking restores', async () => {
    const u = await pb.createUser(fresh('abuser'));
    const piece = await pb.call('/api/collections/pieces/records', { method: 'POST', headers: { Authorization: u.token }, body: JSON.stringify({ owner: u.record.id, clientId: 'p1', title: 't', markup: {}, updatedAt: 1 }) });
    expect(piece.ok).toBe(true);
    const refresh = () => pb.call('/api/collections/users/auth-refresh', { method: 'POST', headers: { Authorization: u.token } });
    expect((await refresh()).status).toBe(200);

    expect((await admin(`users/${u.record.id}/block`, 'POST', { reason: 'spam' })).ok).toBe(true);
    expect((await refresh()).status).toBe(401); // the old session is dead immediately
    const right = await pb.login(u.email, 'password123');
    expect(right.status).toBe(403);
    expect((right as unknown as { message: string }).message).toContain('blocked');
    expect((await pb.login(u.email, 'wrong-password')).status).toBe(400); // wrong password: same answer as for anyone
    const row = ((await (await admin('users')).json()).users as { id: string; blocked: boolean; blockReason: string }[]).find((x) => x.id === u.record.id)!;
    expect(row).toMatchObject({ blocked: true, blockReason: 'spam' });

    expect((await admin(`users/${u.record.id}/unblock`, 'POST')).ok).toBe(true);
    expect((await pb.login(u.email, 'password123')).status).toBe(200);
  });

  test('an administrator cannot lock themselves out, and roles can be changed', async () => {
    const me = ((await (await admin('users')).json()).users as { id: string; email: string }[]).find((x) => x.email === ADMIN.email)!;
    for (const [path, body] of [[`users/${me.id}/block`, {}], [`users/${me.id}/role`, { role: 'user' }]] as const) {
      expect((await admin(path, 'POST', body)).status, path).toBe(400);
    }
    expect((await admin(`users/${me.id}`, 'DELETE')).status).toBe(400);

    const other = await pb.createUser(fresh('promoted'));
    expect((await admin(`users/${other.record.id}/role`, 'POST', { role: 'admin' })).ok).toBe(true);
    expect((await admin('users', 'GET', undefined, (await pb.login(other.email, 'password123')).token)).status).toBe(200); // the new admin can administer
    expect((await admin(`users/${other.record.id}/role`, 'POST', { role: 'user' })).ok).toBe(true);
    expect((await admin('users', 'GET', undefined, (await pb.login(other.email, 'password123')).token)).status).toBe(403);
  });

  test('a blocked administrator loses admin access', async () => {
    const boss2 = await pb.createUser(fresh('boss2'));
    await admin(`users/${boss2.record.id}/role`, 'POST', { role: 'admin' });
    const t = (await pb.login(boss2.email, 'password123')).token;
    expect((await admin('users', 'GET', undefined, t)).status).toBe(200);
    await admin(`users/${boss2.record.id}/block`, 'POST', { reason: 'rogue' });
    expect((await admin('users', 'GET', undefined, t)).status).toBe(401);
    expect((await pb.login(boss2.email, 'password123')).status).toBe(403);
  });

  test('deleting a user deletes their data', async () => {
    const u = await pb.createUser(fresh('gone'));
    await pb.call('/api/collections/pieces/records', { method: 'POST', headers: { Authorization: u.token }, body: JSON.stringify({ owner: u.record.id, clientId: 'p1', title: 't', markup: {}, updatedAt: 1 }) });
    expect((await admin(`users/${u.record.id}`, 'DELETE')).ok).toBe(true);
    const left = await (await pb.asSuper(`/api/collections/pieces/records?filter=${encodeURIComponent(`owner="${u.record.id}"`)}`)).json();
    expect(left.totalItems).toBe(0);
    expect((await pb.login(u.email, 'password123')).status).toBe(400);
  });

  test('make-admin promotes an existing account from the command line', async () => {
    const u = await pb.createUser(fresh('cli'));
    expect((await admin('users', 'GET', undefined, u.token)).status).toBe(403);
    const r = spawnSync('server/bin/pocketbase', ['make-admin', u.email, `--dir=${(pb as unknown as { dir: string }).dir}`, '--migrationsDir=server/pb_migrations', '--hooksDir=server/pb_hooks'], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    expect((await admin('users', 'GET', undefined, (await pb.login(u.email, 'password123')).token)).status).toBe(200);
  });
});

test.describe('in the browser', () => {
  const adminPage = async (browser: Browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const a = await pb.login(ADMIN.email, ADMIN.password);
    await signInContext(ctx, { email: ADMIN.email, password: ADMIN.password, token: a.token, record: a.record });
    const page = await ctx.newPage();
    await page.goto(pb.base);
    await page.getByRole('button', { name: 'Admin' }).click();
    return { ctx, page, panel: page.getByRole('dialog', { name: 'Administration' }) };
  };
  const guest = async (browser: Browser, url = pb.base) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(url);
    return { ctx, page };
  };
  const createInvite = async (panel: ReturnType<Page['getByRole']>, name: string, email = '') => {
    await panel.getByLabel('Name').fill(name);
    if (email) await panel.getByLabel('Email (optional)').fill(email);
    await panel.getByRole('button', { name: 'Create invitation' }).click();
    const link = panel.getByLabel(`Invitation link for ${name}`);
    await expect(link).toBeVisible();
    return link.inputValue();
  };

  test('in invitation-only mode a stranger can only sign in, and is told how to get an account', async ({ browser }) => {
    await pb.setRegistration('invite');
    const { ctx, page } = await guest(browser);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByText('You need an invitation to make an account')).toBeVisible();
    await expect(page.getByRole('button', { name: /Create an account/ })).toHaveCount(0);
    await ctx.close();
  });

  test('an invitation with a QR code and link lets one person join, once', async ({ browser }) => {
    const { ctx: actx, panel } = await adminPage(browser);
    const link = await createInvite(panel, 'Bea');
    expect(link).toContain('#invite=');
    const qr = panel.getByRole('img', { name: 'QR code of the invitation for Bea' });
    await expect(qr.locator('svg')).toBeVisible();
    expect(await qr.locator('svg rect, svg path').count()).toBeGreaterThan(0);
    await expect(panel.getByRole('listitem').filter({ hasText: 'Bea' }).getByText('Waiting')).toBeVisible();

    const { ctx, page } = await guest(browser, link);
    await expect(page.getByRole('heading', { name: 'Join Metronome' })).toBeVisible();
    await expect(page.getByText('Hi Bea, you have been invited')).toBeVisible();
    await page.getByLabel('Email').fill(fresh('bea'));
    await page.getByLabel('Password').fill('a-long-password');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Open PDF')).toBeVisible();
    expect(page.url()).not.toContain('#invite');
    await ctx.close();

    const second = await guest(browser, link); // the same link again
    await expect(second.page.getByRole('alert').first()).toContainText('not valid');
    await expect(second.page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await second.ctx.close();

    await panel.getByRole('button', { name: 'Close' }).click();
    await actx.close();
  });

  test('an invitation tied to an email fills it in and does not let it be changed', async ({ browser }) => {
    const { ctx: actx, panel } = await adminPage(browser);
    const email = fresh('locked');
    const link = await createInvite(panel, 'Cor', email);
    const { ctx, page } = await guest(browser, link);
    await expect(page.getByLabel('Email')).toHaveValue(email);
    await expect(page.getByLabel('Email')).toHaveAttribute('readonly', '');
    await ctx.close();
    await actx.close();
  });

  test('switching to open registration in Settings shows a sign-up option; switching back removes it', async ({ browser }) => {
    const { ctx: actx, page: apage, panel } = await adminPage(browser);
    await panel.getByRole('button', { name: 'Settings' }).click();
    await panel.getByLabel('Anyone can register').check();
    await expect.poll(async () => (await (await pb.call('/api/metronome/config')).json()).registration).toBe('open');

    let g = await guest(browser);
    await expect(g.page.getByRole('button', { name: 'New here? Create an account' })).toBeVisible();
    await g.page.getByRole('button', { name: 'New here? Create an account' }).click();
    await g.page.getByLabel('Email').fill(fresh('self'));
    await g.page.getByLabel('Password').fill('a-long-password');
    await g.page.getByRole('button', { name: 'Create account' }).click();
    await expect(g.page.getByText('Open PDF')).toBeVisible();
    await g.ctx.close();

    await panel.getByLabel('Invitation only').check();
    await expect.poll(async () => (await (await pb.call('/api/metronome/config')).json()).registration).toBe('invite');
    g = await guest(browser);
    await expect(g.page.getByRole('button', { name: /Create an account/ })).toHaveCount(0);
    await g.ctx.close();
    void apage;
    await actx.close();
  });

  test('blocking a signed-in user signs them out, and they are told why they cannot return', async ({ browser }) => {
    const u = await pb.createUser(fresh('rogue'));
    const uctx = await browser.newContext();
    await signInContext(uctx, { email: u.email, password: 'password123', token: u.token, record: u.record });
    const upage = await uctx.newPage();
    await upage.goto(pb.base);
    await expect(upage.getByText('Open PDF')).toBeVisible();
    await expect(upage.getByRole('button', { name: 'Admin' })).toHaveCount(0); // not an admin: no panel offered

    const { ctx: actx, page: apage, panel } = await adminPage(browser);
    await panel.getByRole('button', { name: 'Users' }).click();
    apage.once('dialog', (d) => void d.accept('spamming'));
    await panel.getByRole('button', { name: `Block ${u.email}` }).click();
    await expect(panel.getByRole('listitem').filter({ hasText: u.email }).getByText('Blocked')).toBeVisible();
    await expect(panel.getByText('Reason: spamming')).toBeVisible();

    await upage.reload(); // the saved session is refreshed on start and the server refuses
    await expect(upage.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(upage.getByText('You were signed out')).toBeVisible();
    await upage.getByLabel('Email').fill(u.email);
    await upage.getByLabel('Password').fill('password123');
    await upage.getByRole('button', { name: 'Sign in' }).click();
    await expect(upage.getByRole('alert')).toContainText('blocked');

    await panel.getByRole('button', { name: `Unblock ${u.email}` }).click();
    await expect(panel.getByRole('button', { name: `Block ${u.email}` })).toBeVisible();
    await upage.getByRole('button', { name: 'Sign in' }).click();
    await expect(upage.getByRole('button', { name: 'Library' })).toBeVisible();
    await uctx.close();
    await actx.close();
  });

  test('an administrator sees no controls to act on their own account', async ({ browser }) => {
    const { ctx, panel } = await adminPage(browser);
    await panel.getByRole('button', { name: 'Users' }).click();
    const own = panel.getByRole('listitem').filter({ hasText: ADMIN.email });
    await expect(own).toContainText('(you)');
    await expect(own.getByRole('button')).toHaveCount(0);
    await ctx.close();
  });
});
