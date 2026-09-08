/**
 * The people who can use the kiosk, and their PINs.
 *
 * WHY THIS FILE EXISTS. Adding a marbot used to mean opening the Apps Script editor, changing
 * three constants in `setUserPin()` and pressing Run. That works for whoever built the thing and
 * for nobody else — and §0's whole test is whether a change removes work from people or adds it.
 * An admin with a phone should be able to hand somebody a PIN.
 *
 * The rules below are the load-bearing part, not the storage. Under Model C the PIN alone
 * resolves WHO you are (Part VII), so a duplicate PIN silently attributes one person's
 * withdrawals to another — which is not a login bug, it is a wrong answer to "who took it",
 * the exact question the register exists to answer.
 *
 * A PIN is never stored, never returned and never logged. What is kept is
 * HMAC-SHA256(pin, per-user salt) keyed with a secret pepper, because Apps Script has no bcrypt
 * or argon2 (§65.4) and an unkeyed hash over a 10^4 keyspace is enumerated instantly.
 */

var ROSTER_ROLES = ['admin_utama', 'admin', 'anggota'];

function rosterUsers() {
  return JSON.parse(PropertiesService.getScriptProperties().getProperty('USERS') || '[]');
}

function rosterSave(users) {
  PropertiesService.getScriptProperties().setProperty('USERS', JSON.stringify(users));
}

/** What a caller is allowed to see: never a hash, never a salt. */
function rosterList() {
  return rosterUsers().map(function (u) {
    return { userId: u.userId, name: u.name, role: u.role, disabled: !!u.disabled };
  });
}

/**
 * Create a person, or replace their PIN.
 *
 * Keyed on `userId` when given and on `name` otherwise, so the editor helper and the app agree
 * on what "the same person" means.
 */
function rosterSetPin(name, role, pin, userId) {
  name = String(name || '').trim();
  if (!name) return { ok: false, error: 'name_required' };
  if (ROSTER_ROLES.indexOf(role) === -1) return { ok: false, error: 'bad_role' };
  if (!/^[0-9]{4,8}$/.test(String(pin))) return { ok: false, error: 'bad_pin' };

  var users = rosterUsers();
  var existing = null;
  for (var i = 0; i < users.length; i++) {
    if (userId ? users[i].userId === userId : users[i].name === name) existing = users[i];
  }

  /* NOT refused when somebody else has it. Uniqueness used to be required because the PIN alone
     resolved who you are; a PIN shared by two people now asks which of them at sign-in, so the
     refusal bought nothing and cost the admin a retry. The count is REPORTED, though, so the
     screen can say "Budi has this one too" and let them choose a different one anyway. */
  var sharedWith = [];
  for (var j = 0; j < users.length; j++) {
    var other = users[j];
    if (existing && other.userId === existing.userId) continue;
    if (other.disabled) continue;
    if (safeEqual(other.pinHash, hashPin(pin, other.salt))) sharedWith.push(other.name);
  }

  var salt = Utilities.getUuid();
  if (existing) {
    existing.name = name;
    existing.role = role;
    existing.salt = salt;
    existing.pinHash = hashPin(pin, salt);
    existing.disabled = false;
  } else {
    existing = {
      userId: 'USR-' + Utilities.getUuid().slice(0, 8),
      name: name,
      role: role,
      salt: salt,
      pinHash: hashPin(pin, salt),
      disabled: false,
    };
    users.push(existing);
  }
  rosterSave(users);
  return { ok: true, userId: existing.userId, sharedWith: sharedWith };
}

/**
 * Retire somebody. Their PIN stops working; their rows in the log stay exactly as they are.
 *
 * DISABLE rather than delete, and `admin_utama` not even that: the spec draws that account as
 * *Tetap*, with no Hapus (§72), and an inventory system whose last admin can lock everyone out
 * by tapping one button is a system that will eventually do it.
 */
function rosterDisable(userId, disabled) {
  var users = rosterUsers();
  for (var i = 0; i < users.length; i++) {
    if (users[i].userId !== userId) continue;
    if (users[i].role === 'admin_utama') return { ok: false, error: 'admin_utama_permanent' };
    users[i].disabled = !!disabled;
    rosterSave(users);
    return { ok: true };
  }
  return { ok: false, error: 'no_such_user' };
}
