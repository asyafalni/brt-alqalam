/**
 * The tablets and phones allowed to reach the PIN endpoint.
 *
 * WHY THIS EXISTS AT ALL. `doPost` in Apps Script sees no headers, no cookies and no client IP
 * (§65.2), so per-IP rate limiting is not merely awkward — it is impossible. An enrolled device
 * is the only thing a lockout can attach to, and without one anybody holding the `/exec` URL
 * could walk the whole 10^4 PIN keyspace unopposed. The secret is what makes the PIN mean
 * something.
 *
 * WHY IT MOVED OUT OF THE EDITOR. Enrolling was a function you opened the Apps Script editor to
 * run, once per device, copying a 72-character secret out of a log. At ten to fifteen people on
 * their own phones that is not a setup step, it is a reason the system never gets used — and it
 * meant only whoever wrote it could add a phone. §0.0's test is whether a change removes work
 * from people; this one removes an entire dependency on me.
 *
 * THE SECRET IS SHOWN ONCE. It is stored to be COMPARED against, not handed back out: nothing
 * here returns it after enrolment, so a lost phone is revoked rather than re-read.
 */

function deviceList() {
  var devices = JSON.parse(PropertiesService.getScriptProperties().getProperty('DEVICES') || '[]');
  return devices.map(function (d) {
    return {
      deviceId: d.deviceId,
      label: d.label,
      enrolledTs: d.enrolledTs || '',
      revoked: !!d.revoked,
    };
  });
}

/**
 * Enrol one device and return its secret — the only time it is ever readable.
 *
 * The id is a UUID rather than a counter: `DEV-` + a length made ids guessable, and while
 * guessing an id gets you nothing on its own, a revoke endpoint that takes one should not
 * accept a number somebody can count to.
 */
function deviceEnroll(label) {
  label = String(label || '').trim();
  if (!label) return { ok: false, error: 'label_required' };

  var props = PropertiesService.getScriptProperties();
  var devices = JSON.parse(props.getProperty('DEVICES') || '[]');
  var device = {
    deviceId: 'DEV-' + Utilities.getUuid().slice(0, 8),
    label: label,
    secret: Utilities.getUuid() + Utilities.getUuid(),
    enrolledTs: new Date().toISOString(),
    revoked: false,
  };
  devices.push(device);
  props.setProperty('DEVICES', JSON.stringify(devices));
  return { ok: true, deviceId: device.deviceId, secret: device.secret, label: device.label };
}

/**
 * Cut a device off, or let it back in.
 *
 * REVOKE, never delete: the row is what a future "why did this stop working?" is answered from,
 * and a phone that turns up in a drawer three weeks later should be restorable rather than
 * re-enrolled under a second identity.
 */
function deviceSetRevoked(deviceId, revoked) {
  var props = PropertiesService.getScriptProperties();
  var devices = JSON.parse(props.getProperty('DEVICES') || '[]');
  for (var i = 0; i < devices.length; i++) {
    if (devices[i].deviceId !== deviceId) continue;
    devices[i].revoked = !!revoked;
    props.setProperty('DEVICES', JSON.stringify(devices));
    return { ok: true };
  }
  return { ok: false, error: 'no_such_device' };
}

function deviceRename(deviceId, label) {
  label = String(label || '').trim();
  if (!label) return { ok: false, error: 'label_required' };
  var props = PropertiesService.getScriptProperties();
  var devices = JSON.parse(props.getProperty('DEVICES') || '[]');
  for (var i = 0; i < devices.length; i++) {
    if (devices[i].deviceId !== deviceId) continue;
    devices[i].label = label;
    props.setProperty('DEVICES', JSON.stringify(devices));
    return { ok: true };
  }
  return { ok: false, error: 'no_such_device' };
}
