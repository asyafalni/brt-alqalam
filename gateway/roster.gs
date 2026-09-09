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

/*
 * WHICH GROUP somebody belongs to — a different axis from `role`, which is what they may DO.
 * A karyawan can be an admin; a jamaah is almost certainly not. Collapsing the two would force
 * a choice between "this person can edit the catalog" and "this person is a jamaah", which are
 * not alternatives.
 *
 * It also closes §60's gap. The design had operators (PIN holders) and borrowers (jamaah,
 * panitia, contractors) as different populations, with the borrower — the identity that actually
 * answers "who walked off with the drill" — reduced to an optional free-text field. With jamaah
 * on the roster, the borrower is a person the register knows.
 */
var ROSTER_TYPES = ['marbot', 'staf', 'jamaah', 'security'];

function rosterUsers() {
  return JSON.parse(PropertiesService.getScriptProperties().getProperty('USERS') || '[]');
}

function rosterSave(users) {
  PropertiesService.getScriptProperties().setProperty('USERS', JSON.stringify(users));
}

/** What a caller is allowed to see: never a hash, never a salt. */
function rosterList() {
  return rosterUsers().map(function (u) {
    return {
      userId: u.userId,
      name: u.name,
      role: u.role,
      type: u.type || 'marbot',
      /* The phone is an IDENTIFIER, not a credential — it is what somebody types on their own
         device instead of being handed a device secret. Returned to admins so the roster screen
         can show and correct it; never returned by any public-tier read. */
      phone: u.phone || '',
      disabled: !!u.disabled,
    };
  });
}

/** Digits only, so `0812-3456` and `08123456` are the same person and cannot both be enrolled. */
function normalisePhone(phone) {
  var digits = String(phone || '').replace(/[^0-9]/g, '');
  // A leading 62 and a leading 0 are the same Indonesian number written two ways.
  if (digits.indexOf('62') === 0) digits = '0' + digits.slice(2);
  return digits;
}

/** Who holds this phone number, or null. Never exposed except through an authenticated path. */
function rosterByPhone(phone) {
  var wanted = normalisePhone(phone);
  if (wanted.length < 8) return null;
  var users = rosterUsers();
  for (var i = 0; i < users.length; i++) {
    if (users[i].disabled) continue;
    if (normalisePhone(users[i].phone) === wanted) return users[i];
  }
  return null;
}

/**
 * Create a person, or replace their PIN.
 *
 * Keyed on `userId` when given and on `name` otherwise, so the editor helper and the app agree
 * on what "the same person" means.
 */
function rosterSetPin(name, role, pin, userId, type, phone) {
  name = String(name || '').trim();
  if (!name) return { ok: false, error: 'name_required' };
  if (ROSTER_ROLES.indexOf(role) === -1) return { ok: false, error: 'bad_role' };
  if (!/^[0-9]{4,8}$/.test(String(pin))) return { ok: false, error: 'bad_pin' };
  type = ROSTER_TYPES.indexOf(type) === -1 ? 'marbot' : type;

  var digits = normalisePhone(phone);
  if (phone && digits.length < 8) return { ok: false, error: 'bad_phone' };

  /* UNIQUE, unlike the PIN. The phone is what identifies somebody on their own device, so two
     people sharing one would make the sign-in ambiguous in a way no picker can resolve — they
     would both be "the person with this number". */
  if (digits) {
    var holder = rosterByPhone(digits);
    if (holder && (!userId || holder.userId !== userId)) {
      return { ok: false, error: 'phone_taken' };
    }
  }

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
    existing.type = type;
    existing.phone = digits;
    existing.salt = salt;
    existing.pinHash = hashPin(pin, salt);
    existing.disabled = false;
  } else {
    existing = {
      userId: 'USR-' + Utilities.getUuid().slice(0, 8),
      name: name,
      role: role,
      type: type,
      phone: digits,
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


/** Whether a roster row is an admin of either kind — the rows only `admin_utama` may touch. */
function rosterIsAdmin(userId) {
  var users = rosterUsers();
  for (var i = 0; i < users.length; i++) {
    if (users[i].userId === userId) {
      return users[i].role === 'admin' || users[i].role === 'admin_utama';
    }
  }
  return false;
}


/**
 * A 4-digit PIN nobody is using yet.
 *
 * WHY THE SYSTEM PICKS IT. The admin was choosing, which meant occasionally choosing one that
 * was taken — and the old answer to that was a refusal and a retry, which is work handed to a
 * person by a machine that could have avoided it (§0.0). Suggesting a free one makes uniqueness
 * true by construction instead of by rejection, and the admin can still overwrite it.
 *
 * Random rather than sequential: 0001, 0002, 0003 down the roster is a pattern anybody standing
 * at the kiosk can guess after seeing one person type theirs.
 *
 * Returns '' if the space is somehow full — 10,000 PINs against a roster of fifteen makes that
 * impossible in practice, but a caller that silently got a duplicate would be worse than one
 * that got nothing.
 */
function rosterFreePin() {
  var users = rosterUsers();
  for (var attempt = 0; attempt < 200; attempt++) {
    var pin = String(Math.floor(Math.random() * 10000));
    while (pin.length < 4) pin = '0' + pin;
    var taken = false;
    for (var i = 0; i < users.length; i++) {
      if (safeEqual(users[i].pinHash, hashPin(pin, users[i].salt))) { taken = true; break; }
    }
    if (!taken) return pin;
  }
  return '';
}


/**
 * Change somebody's details WITHOUT touching their PIN.
 *
 * The only way to edit a row used to be `rosterSetPin`, which always writes a new hash — so
 * adding a phone number to somebody registered before phones existed meant reissuing their PIN
 * and telling them a new one for no reason. Two different acts had one door.
 *
 * The PIN is not readable, so it cannot be "kept" by passing it back in; the row is edited
 * around it instead, leaving `salt` and `pinHash` exactly as they were.
 */
function rosterUpdate(userId, name, role, type, phone) {
  name = String(name || '').trim();
  if (!userId) return { ok: false, error: 'no_such_user' };
  if (!name) return { ok: false, error: 'name_required' };
  if (ROSTER_ROLES.indexOf(role) === -1) return { ok: false, error: 'bad_role' };
  type = ROSTER_TYPES.indexOf(type) === -1 ? 'marbot' : type;

  var digits = normalisePhone(phone);
  if (phone && digits.length < 8) return { ok: false, error: 'bad_phone' };
  if (digits) {
    var holder = rosterByPhone(digits);
    if (holder && holder.userId !== userId) return { ok: false, error: 'phone_taken' };
  }

  var users = rosterUsers();
  for (var i = 0; i < users.length; i++) {
    if (users[i].userId !== userId) continue;
    users[i].name = name;
    users[i].role = role;
    users[i].type = type;
    users[i].phone = digits;
    rosterSave(users);
    return { ok: true };
  }
  return { ok: false, error: 'no_such_user' };
}
