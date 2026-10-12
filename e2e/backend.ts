import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BIN = 'server/bin/pocketbase';
export const SUPERUSER = { email: 'test@example.com', password: 'test-password-123' };
export const ADMIN = { email: 'admin@example.com', password: 'admin-password-123' };

export type Backend = Awaited<ReturnType<typeof startBackend>>;

/**
 * A throw-away PocketBase on its own port, set up the way production is (migrations, hooks, an administrator).
 * `publicDir` makes it serve the built app too. `relaxLimits` switches rate limiting off unless the test is about it.
 */
export async function startBackend({ port, publicDir, relaxLimits = true }: { port: number; publicDir?: string; relaxLimits?: boolean }) {
  const dir = mkdtempSync(join(tmpdir(), `pb-${port}-`));
  const flags = [`--dir=${dir}`, '--migrationsDir=server/pb_migrations', '--hooksDir=server/pb_hooks'];
  for (const args of [['migrate', 'up'], ['superuser', 'upsert', SUPERUSER.email, SUPERUSER.password], ['make-admin', ADMIN.email, ADMIN.password]]) {
    const r = spawnSync(BIN, [...args, ...flags], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`pocketbase ${args[0]} failed: ${r.stderr || r.stdout}`);
  }
  const proc: ChildProcess = spawn(BIN, ['serve', `--http=127.0.0.1:${port}`, ...(publicDir ? [`--publicDir=${publicDir}`] : []), ...flags]);
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* not up yet */ }
    if (i > 60) throw new Error('backend did not start');
    await new Promise((r) => setTimeout(r, 200));
  }

  const json = { 'Content-Type': 'application/json' };
  const call = async (path: string, init: RequestInit = {}) => fetch(`${base}${path}`, { ...init, headers: { ...json, ...(init.headers as object) } });
  let superToken = '';
  const su = async () => (superToken ||= (await (await call('/api/collections/_superusers/auth-with-password', { method: 'POST', body: JSON.stringify({ identity: SUPERUSER.email, password: SUPERUSER.password }) })).json()).token);
  const asSuper = async (path: string, init: RequestInit = {}) => call(path, { ...init, headers: { Authorization: await su(), ...(init.headers as object) } });

  if (relaxLimits) await asSuper('/api/settings', { method: 'PATCH', body: JSON.stringify({ rateLimits: { enabled: false, rules: [] } }) });

  return {
    base,
    dir,
    call,
    asSuper,
    /** Sign in through the API; returns the token and record. */
    async login(email: string, password: string) {
      const r = await call('/api/collections/users/auth-with-password', { method: 'POST', body: JSON.stringify({ identity: email, password }) });
      return { status: r.status, ...(await r.json()) } as { status: number; token: string; record: { id: string } };
    },
    async setRegistration(mode: 'open' | 'invite') {
      const list = await (await asSuper('/api/collections/app_settings/records')).json();
      await asSuper(`/api/collections/app_settings/records/${list.items[0].id}`, { method: 'PATCH', body: JSON.stringify({ registration: mode }) });
    },
    /** Create a user the way an operator can (the public API refuses). */
    async createUser(email: string, password = 'password123') {
      const r = await asSuper('/api/collections/users/records', { method: 'POST', body: JSON.stringify({ email, password, passwordConfirm: password }) });
      if (!r.ok) throw new Error(`could not create ${email}: ${await r.text()}`);
      return { email, password, ...(await this.login(email, password)) };
    },
    stop() { proc.kill(); rmSync(dir, { recursive: true, force: true }); },
  };
}
