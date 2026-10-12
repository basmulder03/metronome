/**
 * The shared test backend gets a user per test from one IP, so its rate limits are off here (production keeps them), and
 * registration is open so tests can sign up through the form. Tests of invitation-only mode run on backends of their own.
 */
export default async function globalSetup() {
  const base = 'http://127.0.0.1:8094';
  const auth = await fetch(`${base}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: 'test@example.com', password: 'test-password-123' }),
  });
  if (!auth.ok) throw new Error(`could not sign in to the test backend: ${auth.status}`);
  const { token } = await auth.json();
  const res = await fetch(`${base}/api/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({ rateLimits: { enabled: false, rules: [] } }),
  });
  if (!res.ok) throw new Error(`could not relax rate limits on the test backend: ${res.status}`);
  const list = await (await fetch(`${base}/api/collections/app_settings/records`, { headers: { Authorization: token } })).json();
  const open = await fetch(`${base}/api/collections/app_settings/records/${list.items[0].id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: token }, body: JSON.stringify({ registration: 'open' }) });
  if (!open.ok) throw new Error(`could not open registration on the test backend: ${open.status}`);
}
