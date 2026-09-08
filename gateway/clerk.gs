/**
 * Inviting an admin, through Clerk's Backend API.
 *
 * INVITATIONS, NOT USER CREATION, and the difference is the whole reason this is acceptable.
 * `POST /v1/invitations` takes an email and `public_metadata`, and Clerk carries that metadata
 * onto the user when they sign up — which is exactly where the gateway reads `role` from. The
 * invited person sets their OWN password, in Clerk, so no credential ever passes through this
 * script, is stored by it, or can leak from it.
 *
 * ⚠️ WHAT THIS COSTS. Holding `CLERK_SECRET_KEY` means a compromised gateway can mint
 * identities. Before it, the worst outcome of a break-in here was corrupted inventory data;
 * after it, the worst outcome is somebody granting themselves an admin account. That is a real
 * change in what is at stake, taken deliberately, and it is fenced accordingly:
 *
 *   - `admin_utama` only, checked at the handler.
 *   - It can never invite an `admin_utama`. The permanent super-admin is born once, by hand,
 *     in the Clerk dashboard — never remotely, never by something with an HTTP endpoint.
 *   - It can invite and revoke an invitation. It cannot delete a user, change a password, or
 *     alter the role of somebody who already exists.
 *   - Every call is written to `AdminLog`.
 *
 * FAILS CLOSED AND ABSENT. With no key in Script Properties every endpoint here answers
 * `clerk_not_configured`, so deploying this code does not by itself give the gateway the ability
 * to do any of it. That only begins when somebody adds the key on purpose.
 */

var CLERK_API = 'https://api.clerk.com/v1';

/**
 * Pinned, because Clerk ships breaking changes behind dates: metadata moved off
 * `PATCH /v1/users/{id}` as of 2026-05-12 (§65.4), and an unpinned client inherits the next one
 * silently, in production, on a day nobody deployed anything.
 */
var CLERK_API_VERSION = '2025-04-10';

function clerkKey() {
  return PropertiesService.getScriptProperties().getProperty('CLERK_SECRET_KEY') || '';
}

function clerkCall(method, path, payload) {
  var key = clerkKey();
  if (!key) return { ok: false, error: 'clerk_not_configured' };

  var options = {
    method: method,
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ' + key,
      'Clerk-API-Version': CLERK_API_VERSION,
    },
  };
  if (payload) options.payload = JSON.stringify(payload);

  var response = UrlFetchApp.fetch(CLERK_API + path, options);
  var code = response.getResponseCode();
  var text = response.getContentText();
  var body;
  try { body = JSON.parse(text); } catch (e) { body = null; }

  if (code < 200 || code >= 300) {
    /* Clerk's own message, trimmed. It says things like "duplicate invitation" that no
       paraphrase of ours would say as usefully. */
    var detail = body && body.errors && body.errors[0]
      ? (body.errors[0].long_message || body.errors[0].message || '')
      : text.slice(0, 200);
    return { ok: false, error: 'clerk_' + code, detail: String(detail).slice(0, 300) };
  }
  return { ok: true, body: body };
}

/** Only `admin`. `anggota` do not sign in at all, and `admin_utama` is never created remotely. */
var INVITABLE_ROLES = ['admin'];

function clerkInvite(email, role, redirectUrl) {
  email = String(email || '').trim();
  if (!email || email.indexOf('@') === -1) return { ok: false, error: 'bad_email' };
  if (INVITABLE_ROLES.indexOf(role) === -1) return { ok: false, error: 'bad_role' };

  var result = clerkCall('post', '/invitations', {
    email_address: email,
    /* The whole mechanism: Clerk moves this onto the user at sign-up, and the JWT template
       reads `role` from exactly here. Nothing has to be set afterwards. */
    public_metadata: { role: role },
    redirect_url: redirectUrl || undefined,
    notify: true,
  });
  if (!result.ok) return result;

  return { ok: true, invitationId: result.body && result.body.id, email: email };
}

function clerkInvitations() {
  var result = clerkCall('get', '/invitations?limit=50&status=pending', null);
  if (!result.ok) return result;
  var list = (result.body && (result.body.data || result.body)) || [];
  return {
    ok: true,
    invitations: list.map(function (i) {
      return {
        invitationId: i.id,
        email: i.email_address,
        role: (i.public_metadata && i.public_metadata.role) || '',
        status: i.status,
        createdTs: i.created_at ? new Date(i.created_at).toISOString() : '',
      };
    }),
  };
}

function clerkRevokeInvitation(invitationId) {
  if (!invitationId) return { ok: false, error: 'no_invitation' };
  return clerkCall('post', '/invitations/' + encodeURIComponent(invitationId) + '/revoke', {});
}
