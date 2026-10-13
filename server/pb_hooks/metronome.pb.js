/// <reference path="../pb_data/types.d.ts" />

// ---------- who may sign in ----------
// Checked after the password, so the message does not reveal which addresses are blocked to people who do not know the password.
onRecordAuthWithPasswordRequest((e) => {
  if (e.record && e.record.getBool('blocked') && e.record.validatePassword(e.password)) {
    throw new ForbiddenError('This account has been blocked.');
  }
  e.next();
}, 'users');

onRecordAuthRefreshRequest((e) => {
  if (e.record.getBool('blocked')) throw new ForbiddenError('This account has been blocked.');
  e.next();
}, 'users');

// ---------- public: how can people register? ----------
routerAdd('GET', '/api/metronome/config', (e) => {
  const { settings } = require(`${__hooks}/lib.js`);
  return e.json(200, { registration: settings().getString('registration') });
});

routerAdd('GET', '/api/metronome/invite', (e) => {
  const { verifyInvite } = require(`${__hooks}/lib.js`);
  const invite = verifyInvite(e.request.url.query().get('token'));
  if (!invite) throw new NotFoundError('This invitation is not valid, has expired or was already used.');
  return e.json(200, { name: invite.getString('name'), email: invite.getString('email') });
});

// ---------- public: register (the only way to create an account) ----------
routerAdd('POST', '/api/metronome/register', (e) => {
  const { settings, verifyInvite, now, isEmail } = require(`${__hooks}/lib.js`);
  const body = e.requestInfo().body;
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const token = String(body.invite || '');
  if (!isEmail(email)) throw new BadRequestError('Enter a valid email address.');
  if (password.length < 8 || password.length > 72) throw new BadRequestError('Use a password of 8 to 72 characters.');

  let invite = null;
  if (token) {
    invite = verifyInvite(token);
    if (!invite) throw new BadRequestError('This invitation is not valid, has expired or was already used.');
    const reserved = invite.getString('email').toLowerCase();
    if (reserved && reserved !== email) throw new BadRequestError('This invitation is for a different email address.');
  } else if (settings().getString('registration') !== 'open') {
    throw new ForbiddenError('Registration is by invitation only.');
  }

  try {
    $app.runInTransaction((tx) => {
      let fresh = null;
      if (invite) {
        // re-read inside the transaction: two people using one link at the same moment must not both succeed
        fresh = tx.findRecordById('invites', invite.id);
        if (fresh.getBool('revoked') || fresh.getInt('usedAt')) throw new BadRequestError('This invitation is not valid, has expired or was already used.');
      }
      const user = new Record(tx.findCollectionByNameOrId('users'));
      user.set('email', email);
      user.set('role', 'user');
      user.setPassword(password);
      tx.save(user);
      if (fresh) {
        fresh.set('usedAt', now());
        fresh.set('usedBy', user.id);
        tx.save(fresh);
      }
    });
  } catch (err) {
    if (err instanceof BadRequestError) throw err;
    throw new BadRequestError('This email address cannot be used.'); // taken, or otherwise invalid; one message either way
  }
  return e.json(200, { ok: true });
});

// ---------- share links: markup in, short code out (never a PDF) ----------
routerAdd('POST', '/api/metronome/share', (e) => {
  const body = e.requestInfo().body;
  const kind = String(body.kind || '');
  const data = String(body.data || '');
  const title = String(body.title || '').slice(0, 200);
  const days = Math.min(365, Math.max(0, parseInt(body.days, 10) || 0)); // 0: the link never expires
  if (kind !== 'piece' && kind !== 'playlist') throw new BadRequestError('Unknown kind of share.');
  // the payload is the client's compressed, URL-safe encoding; anything else is not a share
  if (!/^[A-Za-z0-9_-]{1,600000}$/.test(data)) throw new BadRequestError('That is not a valid share.');
  const owner = e.auth;
  if (owner.getBool('blocked')) throw new ForbiddenError('This account has been blocked.');
  const expires = days ? Math.floor(Date.now() / 1000) + days * 86400 : 0;

  // a link that lets people with an account edit the piece: only for a piece of one's own that is already on the server
  const pieceId = body.editable && kind === 'piece' ? String(body.pieceId || '').slice(0, 64) : '';
  if (pieceId) {
    let own = null;
    try { own = $app.findFirstRecordByFilter('pieces', 'owner = {:o} && clientId = {:c} && deleted = false', { o: owner.id, c: pieceId }); } catch (_) { /* below */ }
    if (!own) throw new BadRequestError('Save and sync the piece first, then share it for editing.');
  }

  const hash = $security.sha256(pieceId ? `${kind}.${pieceId}.${data}` : `${kind}.${data}`);
  try { // sharing the same thing again gives the same link (with the new lifetime)
    const same = $app.findFirstRecordByFilter('shares', 'owner = {:o} && hash = {:h}', { o: owner.id, h: hash });
    same.set('expires', expires);
    $app.save(same);
    return e.json(200, { code: same.getString('code') });
  } catch (_) { /* not shared before */ }
  if ($app.countRecords('shares', $dbx.hashExp({ owner: owner.id })) >= 200) throw new BadRequestError('You have reached the limit of share links. Remove some under "My links".'); // (handlers run in their own scope: no shared top-level constants)

  const record = new Record($app.findCollectionByNameOrId('shares'));
  record.set('code', $security.randomStringWithAlphabet(8, 'abcdefghjkmnpqrstuvwxyz23456789'));
  record.set('owner', owner.id);
  record.set('kind', kind);
  record.set('title', title);
  record.set('data', data);
  record.set('hash', hash);
  record.set('expires', expires);
  record.set('piece', pieceId);
  record.set('editable', !!pieceId);
  $app.save(record);
  return e.json(200, { code: record.getString('code') });
}, $apis.requireAuth('users'));

routerAdd('GET', '/api/metronome/share/{code}', (e) => {
  let record;
  try { record = $app.findFirstRecordByFilter('shares', 'code = {:c}', { c: e.request.pathValue('code') }); } catch (_) { throw new NotFoundError('This share link is not valid.'); }
  const expires = record.getInt('expires');
  if (expires && expires < Math.floor(Date.now() / 1000)) throw new NotFoundError('This share link is not valid.'); // expired: same answer as unknown
  let by = '';
  if (record.getBool('editable')) { try { by = $app.findRecordById('users', record.getString('owner')).getString('email').split('@')[0]; } catch (_) { /* owner gone */ } }
  return e.json(200, { kind: record.getString('kind'), title: record.getString('title'), data: record.getString('data'), editable: record.getBool('editable'), by });
});

// joining a link that allows editing: you become an editor of the very same piece (not a copy), until you or the owner end it
routerAdd('POST', '/api/metronome/share/{code}/join', (e) => {
  let share;
  try { share = $app.findFirstRecordByFilter('shares', 'code = {:c} && editable = true', { c: e.request.pathValue('code') }); } catch (_) { throw new NotFoundError('This share link is not valid.'); }
  const expires = share.getInt('expires');
  if (expires && expires < Math.floor(Date.now() / 1000)) throw new NotFoundError('This share link is not valid.');
  if (e.auth.getBool('blocked')) throw new ForbiddenError('This account has been blocked.');
  let piece;
  try { piece = $app.findFirstRecordByFilter('pieces', 'owner = {:o} && clientId = {:c} && deleted = false', { o: share.getString('owner'), c: share.getString('piece') }); } catch (_) { throw new NotFoundError('The shared piece no longer exists.'); }
  if (piece.getString('owner') === e.auth.id) return e.json(200, { pieceId: share.getString('piece'), own: true });
  const editors = piece.getStringSlice('editors');
  if (editors.indexOf(e.auth.id) < 0) {
    if (editors.length >= 10) throw new BadRequestError('This piece already has as many editors as it can have.');
    piece.set('editors', editors.concat([e.auth.id]));
    $app.save(piece);
  }
  return e.json(200, { pieceId: share.getString('piece'), own: false });
}, $apis.requireAuth('users'));

// who edits what: the pieces you own that others edit, and the pieces you edit for others
routerAdd('GET', '/api/metronome/collab', (e) => {
  const me = e.auth.id;
  const email = (id) => { try { return $app.findRecordById('users', id).getString('email'); } catch (_) { return ''; } };
  const owned = $app.findRecordsByFilter('pieces', 'owner = {:o} && deleted = false', '-updatedAt', 500, 0, { o: me })
    .filter((r) => r.getStringSlice('editors').length > 0)
    .map((r) => ({ record: r.id, title: r.getString('title'), editors: r.getStringSlice('editors').map((id) => ({ id, email: email(id) })) }));
  const joined = $app.findRecordsByFilter('pieces', 'editors ?= {:o} && deleted = false', '-updatedAt', 200, 0, { o: me })
    .map((r) => ({ record: r.id, title: r.getString('title'), owner: email(r.getString('owner')) }));
  return e.json(200, { owned, joined });
}, $apis.requireAuth('users'));

// the owner removes an editor, or an editor leaves (userId omitted): the person keeps their own local copy
routerAdd('POST', '/api/metronome/collab/remove', (e) => {
  const body = e.requestInfo().body;
  let piece;
  try { piece = $app.findRecordById('pieces', String(body.record || '')); } catch (_) { throw new NotFoundError('Unknown piece.'); }
  const me = e.auth.id;
  const target = String(body.userId || me);
  if (target !== me && piece.getString('owner') !== me) throw new ForbiddenError('Only the owner can remove other editors.');
  const editors = piece.getStringSlice('editors');
  if (editors.indexOf(target) < 0) throw new NotFoundError('That person is not an editor of this piece.');
  piece.set('editors', editors.filter((id) => id !== target));
  $app.save(piece);
  return e.json(200, { ok: true });
}, $apis.requireAuth('users'));

// the signed-in user's own links (no payloads), to copy or withdraw them
routerAdd('GET', '/api/metronome/shares', (e) => {
  const list = $app.findRecordsByFilter('shares', 'owner = {:o}', '-created', 200, 0, { o: e.auth.id }).map((r) => ({
    code: r.getString('code'), kind: r.getString('kind'), title: r.getString('title'), created: r.getString('created'), expires: r.getInt('expires'),
  }));
  return e.json(200, { shares: list });
}, $apis.requireAuth('users'));

routerAdd('DELETE', '/api/metronome/share/{code}', (e) => {
  let record;
  try { record = $app.findFirstRecordByFilter('shares', 'code = {:c} && owner = {:o}', { c: e.request.pathValue('code'), o: e.auth.id }); } catch (_) { throw new NotFoundError('Unknown share link.'); }
  $app.delete(record);
  return e.json(200, { ok: true });
}, $apis.requireAuth('users'));

// ---------- administration (every route re-checks the role on the server) ----------

routerAdd('GET', '/api/metronome/admin/settings', (e) => {
  const { requireAdmin, settings } = require(`${__hooks}/lib.js`);
  requireAdmin(e);
  return e.json(200, { registration: settings().getString('registration') });
}, $apis.requireAuth('users'));

routerAdd('PUT', '/api/metronome/admin/settings', (e) => {
  const { requireAdmin, settings } = require(`${__hooks}/lib.js`);
  requireAdmin(e);
  const mode = String(e.requestInfo().body.registration || '');
  if (mode !== 'invite' && mode !== 'open') throw new BadRequestError('Registration must be "invite" or "open".');
  const s = settings();
  s.set('registration', mode);
  $app.save(s);
  return e.json(200, { registration: mode });
}, $apis.requireAuth('users'));

routerAdd('GET', '/api/metronome/admin/invites', (e) => {
  const { requireAdmin, tokenFor, inviteStatus } = require(`${__hooks}/lib.js`);
  requireAdmin(e);
  const list = $app.findRecordsByFilter('invites', "id != ''", '-id', 500, 0).map((i) => {
    const status = inviteStatus(i);
    return { id: i.id, name: i.getString('name'), email: i.getString('email'), expiresAt: i.getInt('expiresAt'), usedAt: i.getInt('usedAt'), status, token: status === 'pending' ? tokenFor(i) : '' };
  });
  return e.json(200, { invites: list });
}, $apis.requireAuth('users'));

routerAdd('POST', '/api/metronome/admin/invites', (e) => {
  const { requireAdmin, tokenFor, now, isEmail } = require(`${__hooks}/lib.js`);
  const admin = requireAdmin(e);
  const body = e.requestInfo().body;
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const days = Math.min(90, Math.max(1, parseInt(body.days, 10) || 7));
  if (!name || name.length > 100) throw new BadRequestError('Give the invitation a name (up to 100 characters).');
  if (email && !isEmail(email)) throw new BadRequestError('That email address is not valid.');
  const invite = new Record($app.findCollectionByNameOrId('invites'));
  invite.set('name', name);
  invite.set('email', email);
  invite.set('createdBy', admin.id);
  invite.set('expiresAt', now() + days * 86400);
  $app.save(invite);
  return e.json(200, { id: invite.id, name, email, expiresAt: invite.getInt('expiresAt'), status: 'pending', token: tokenFor(invite) });
}, $apis.requireAuth('users'));

routerAdd('DELETE', '/api/metronome/admin/invites/{id}', (e) => {
  const { requireAdmin } = require(`${__hooks}/lib.js`);
  requireAdmin(e);
  let invite;
  try { invite = $app.findRecordById('invites', e.request.pathValue('id')); } catch (_) { throw new NotFoundError('Unknown invitation.'); }
  invite.set('revoked', true);
  $app.save(invite);
  return e.json(200, { ok: true });
}, $apis.requireAuth('users'));

routerAdd('GET', '/api/metronome/admin/users', (e) => {
  const { requireAdmin, shape } = require(`${__hooks}/lib.js`);
  requireAdmin(e);
  return e.json(200, { users: $app.findRecordsByFilter('users', "id != ''", 'email', 1000, 0).map(shape) });
}, $apis.requireAuth('users'));

routerAdd('POST', '/api/metronome/admin/users/{id}/block', (e) => {
  const { target, shape } = require(`${__hooks}/lib.js`);
  const user = target(e, { changesAdminStatus: true });
  user.set('blocked', true);
  user.set('blockReason', String(e.requestInfo().body.reason || '').slice(0, 300));
  user.refreshTokenKey(); // every session this person has stops working immediately
  $app.save(user);
  return e.json(200, shape(user));
}, $apis.requireAuth('users'));

routerAdd('POST', '/api/metronome/admin/users/{id}/unblock', (e) => {
  const { target, shape } = require(`${__hooks}/lib.js`);
  const user = target(e, { changesAdminStatus: false });
  user.set('blocked', false);
  user.set('blockReason', '');
  $app.save(user);
  return e.json(200, shape(user));
}, $apis.requireAuth('users'));

routerAdd('POST', '/api/metronome/admin/users/{id}/role', (e) => {
  const { target, shape } = require(`${__hooks}/lib.js`);
  const role = String(e.requestInfo().body.role || '');
  if (role !== 'user' && role !== 'admin') throw new BadRequestError('Role must be "user" or "admin".');
  const user = target(e, { changesAdminStatus: role === 'user' });
  user.set('role', role);
  $app.save(user);
  return e.json(200, shape(user));
}, $apis.requireAuth('users'));

routerAdd('DELETE', '/api/metronome/admin/users/{id}', (e) => {
  const { target } = require(`${__hooks}/lib.js`);
  const user = target(e, { changesAdminStatus: true });
  $app.delete(user); // their pieces and playlists go with them (cascade)
  return e.json(200, { ok: true });
}, $apis.requireAuth('users'));

// ---------- command line: the first administrator ----------
// usage: pocketbase make-admin EMAIL [PASSWORD]   (creates the account, or promotes an existing one)
$app.rootCmd.addCommand(new Command({
  use: 'make-admin',
  short: 'Create or promote an administrator: make-admin EMAIL [PASSWORD]',
  run: (cmd, args) => {
    $app.bootstrap();
    const [email, password] = args;
    if (!email) throw new Error('usage: make-admin EMAIL [PASSWORD]');
    const users = $app.findCollectionByNameOrId('users');
    // migrations only run on `serve` and `migrate up`; without the role field the promotion would be silently dropped
    if (!users.fields.getByName('role')) throw new Error('the database is not set up yet: run the server once, or `pocketbase migrate up`, then try again');
    let user;
    try { user = $app.findAuthRecordByEmail('users', email.toLowerCase()); } catch (_) {
      if (!password || password.length < 8) throw new Error('a new account needs a password of at least 8 characters');
      user = new Record(users);
      user.set('email', email.toLowerCase());
      user.setPassword(password);
    }
    user.set('role', 'admin');
    user.set('blocked', false);
    $app.save(user);
    console.log(`${email} is now an administrator`);
  },
}));
