// Shared helpers for the hooks (each handler runs in its own context, so they are required, not global).

const now = () => Math.floor(Date.now() / 1000);
const settings = () => $app.findFirstRecordByFilter('app_settings', "id != ''");
const sign = (secret, id, exp) => $security.hs256(`${id}.${exp}`, secret);

/** The link token for an invite: id.expiry.signature. Re-derivable, so nothing secret is stored per invite. */
function tokenFor(invite) {
  const exp = invite.getInt('expiresAt');
  return `${invite.id}.${exp}.${sign(settings().getString('inviteSecret'), invite.id, exp)}`;
}

/** The invite behind a token, or null for anything wrong: forged, expired, used, revoked, unknown. One answer for all, so it is no oracle. */
function verifyInvite(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [id, exp, sig] = parts;
  if (!/^[a-z0-9]{15}$/.test(id) || !/^\d{1,12}$/.test(exp)) return null;
  if (!$security.equal(sig, sign(settings().getString('inviteSecret'), id, exp))) return null; // authentic before any lookup
  if (Number(exp) < now()) return null;
  let invite;
  try { invite = $app.findRecordById('invites', id); } catch (_) { return null; }
  if (invite.getBool('revoked') || invite.getInt('usedAt') || invite.getInt('expiresAt') !== Number(exp)) return null;
  return invite;
}

function inviteStatus(invite) {
  if (invite.getBool('revoked')) return 'revoked';
  if (invite.getInt('usedAt')) return 'used';
  if (invite.getInt('expiresAt') < now()) return 'expired';
  return 'pending';
}

/** The signed-in administrator, or an error. Blocked admins are not admins. */
function requireAdmin(e) {
  const a = e.auth;
  if (!a || a.collection().name !== 'users') throw new UnauthorizedError('Sign in first.');
  if (a.getBool('blocked') || a.getString('role') !== 'admin') throw new ForbiddenError('Administrators only.');
  return a;
}

const activeAdmins = () => $app.findRecordsByFilter('users', "role = 'admin' && blocked = false", '', 1000, 0);

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 200;

const shape = (u) => ({
  id: u.id,
  email: u.getString('email'),
  role: u.getString('role') || 'user',
  blocked: u.getBool('blocked'),
  blockReason: u.getString('blockReason'),
  created: u.getString('created'),
  pieces: $app.countRecords('pieces', $dbx.hashExp({ owner: u.id })),
});

/** Load the target user for an admin action, refusing the dangerous cases: yourself, and the last active administrator. */
function target(e, { changesAdminStatus }) {
  const admin = requireAdmin(e);
  let user;
  try { user = $app.findRecordById('users', e.request.pathValue('id')); } catch (_) { throw new NotFoundError('Unknown user.'); }
  if (user.id === admin.id) throw new BadRequestError('You cannot do this to your own account.');
  if (changesAdminStatus && user.getString('role') === 'admin' && !user.getBool('blocked') && activeAdmins().length <= 1) {
    throw new BadRequestError('There must be at least one active administrator.');
  }
  return user;
}

module.exports = { shape, target, now, settings, tokenFor, verifyInvite, inviteStatus, requireAdmin, activeAdmins, isEmail };
