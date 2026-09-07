/**
 * One-time and occasional admin jobs. RUN THESE FROM THE APPS SCRIPT EDITOR, never over HTTP —
 * they mint secrets, and nothing that mints a secret should be reachable from the internet.
 *
 * Select the function in the toolbar dropdown and press Run. Output appears in the
 * Execution log (View → Logs).
 */

/** Run once, first. Generates the pepper every PIN hash is keyed with. */
function setupGateway() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('PIN_PEPPER')) {
    Logger.log('Already set up. PIN_PEPPER exists — regenerating it would invalidate every PIN.');
    return;
  }
  props.setProperty('PIN_PEPPER', Utilities.getUuid() + Utilities.getUuid());
  props.setProperty('USERS', '[]');
  props.setProperty('DEVICES', '[]');
  Logger.log('Gateway ready. Now run enrollDevice() and setUserPin().');
}

/**
 * Enrol a kiosk. Copy the printed secret into that device once — it is shown here and
 * never again, because the gateway stores it to compare, not to hand back out.
 */
function enrollDevice() {
  var LABEL = 'Tablet Gudang';                       // ← edit me before running

  var props = PropertiesService.getScriptProperties();
  var devices = JSON.parse(props.getProperty('DEVICES') || '[]');
  var device = {
    deviceId: 'DEV-' + (devices.length + 1),
    label: LABEL,
    secret: Utilities.getUuid() + Utilities.getUuid(),
    enrolledTs: new Date().toISOString(),
    revoked: false,
  };
  devices.push(device);
  props.setProperty('DEVICES', JSON.stringify(devices));

  Logger.log('Enrolled ' + device.deviceId + ' (' + LABEL + ')');
  Logger.log('DEVICE SECRET (copy into the tablet now, it is not shown again):');
  Logger.log(device.secret);
}

/** Revoke a lost or stolen device. One line, and it can no longer reach the PIN endpoint. */
function revokeDevice() {
  var DEVICE_ID = 'DEV-1';                           // ← edit me before running

  var props = PropertiesService.getScriptProperties();
  var devices = JSON.parse(props.getProperty('DEVICES') || '[]');
  devices.forEach(function (d) { if (d.deviceId === DEVICE_ID) d.revoked = true; });
  props.setProperty('DEVICES', JSON.stringify(devices));
  Logger.log('Revoked ' + DEVICE_ID);
}

/**
 * Create or replace a person's PIN.
 *
 * PINs must be globally unique — under Model C the PIN alone resolves who you are, so a
 * duplicate would silently attribute one person's actions to another. This refuses rather
 * than allowing it, which is what the spec's "pilih Password lain" screen means.
 */
var ROLES = ['admin_utama', 'admin', 'anggota'];

function setUserPin() {
  var NAME = 'Budi';                                 // ← edit me
  var ROLE = 'anggota';                              //    admin_utama | admin | anggota
  var PIN = '1234';                                  //    4-8 digits

  /* Checked, because an unchecked typo here fails SILENTLY and much later: `Admin` or
     `admin utama` would be stored happily, and `requireAdmin` — which compares against these
     exact strings — would then refuse that person forever with nothing to explain why. */
  if (ROLES.indexOf(ROLE) === -1) {
    Logger.log('REFUSED: role "' + ROLE + '" is not one of ' + ROLES.join(', '));
    return;
  }
  if (!/^[0-9]{4,8}$/.test(String(PIN))) {
    Logger.log('REFUSED: PIN must be 4-8 digits.');
    return;
  }

  var props = PropertiesService.getScriptProperties();
  var users = JSON.parse(props.getProperty('USERS') || '[]');

  for (var i = 0; i < users.length; i++) {
    if (users[i].name !== NAME && !users[i].disabled &&
        safeEqual(users[i].pinHash, hashPin(PIN, users[i].salt))) {
      Logger.log('REFUSED: that PIN already belongs to ' + users[i].name + '. Pilih PIN lain.');
      return;
    }
  }

  var existing = null;
  for (var j = 0; j < users.length; j++) if (users[j].name === NAME) existing = users[j];

  var salt = Utilities.getUuid();
  if (existing) {
    existing.salt = salt;
    existing.pinHash = hashPin(PIN, salt);
    existing.role = ROLE;
    existing.disabled = false;
    Logger.log('Updated PIN for ' + NAME);
  } else {
    users.push({
      userId: 'USR-' + (users.length + 1),
      name: NAME,
      role: ROLE,
      salt: salt,
      pinHash: hashPin(PIN, salt),
      disabled: false,
    });
    Logger.log('Created ' + NAME + ' (' + ROLE + ')');
  }
  props.setProperty('USERS', JSON.stringify(users));
}

/** Who exists. Never prints a hash or a PIN. */
function listUsers() {
  var users = JSON.parse(PropertiesService.getScriptProperties().getProperty('USERS') || '[]');
  users.forEach(function (u) {
    Logger.log(u.userId + '  ' + u.name + '  ' + u.role + (u.disabled ? '  (disabled)' : ''));
  });
  if (!users.length) Logger.log('No users yet — run setUserPin().');
}

function disableUser() {
  var NAME = 'Budi';                                 // ← edit me

  var props = PropertiesService.getScriptProperties();
  var users = JSON.parse(props.getProperty('USERS') || '[]');
  users.forEach(function (u) { if (u.name === NAME) u.disabled = true; });
  props.setProperty('USERS', JSON.stringify(users));
  Logger.log('Disabled ' + NAME);
}
