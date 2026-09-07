// Clerk, as far as the browser is concerned.
//
// COMMITTED ON PURPOSE. A publishable key is not a credential — it is base64 of the instance
// domain and nothing else, which anyone can read out of the bundle in a second:
//
//   pk_test_Z2VudGxlLXdhbGxhYnktODY0OC5jbGVyay5hY2NvdW50cy5kZXYk
//     → "gentle-wallaby-8648.clerk.accounts.dev$"
//
// Hiding it in an env var would be ceremony that protects nothing while making the build depend
// on a value nobody can see. The secret key (`sk_...`) and the HS256 signing key are the real
// credentials, and neither is in this repo, this bundle, or anywhere a browser can reach: they
// live only in the gateway's Apps Script Properties.
//
// ⚠️ NOTHING IMPORTS THIS YET, and that is deliberate (§64.2). `@clerk/clerk-js` drags a Solana,
// Coinbase and Stripe dependency tree into the bundle for a masjid inventory kiosk, so Clerk is
// loaded lazily from its CDN on admin routes only — and there are no admin routes yet. The
// marbot's PIN path must never depend on Clerk being reachable at all.

/** Safe in the client bundle; that is what it is for. */
export const CLERK_PUBLISHABLE_KEY =
  'pk_test_Z2VudGxlLXdhbGxhYnktODY0OC5jbGVyay5hY2NvdW50cy5kZXYk';

/**
 * The `iss` claim the gateway must check every token against.
 *
 * Checked, not trusted: a token signed with the right key but issued by something else is still
 * not ours, and the algorithm must be pinned to HS256 as well — accepting whatever `alg` the
 * token declares is the classic JWT forgery.
 */
export const CLERK_ISSUER = 'https://gentle-wallaby-8648.clerk.accounts.dev';

/**
 * The JWT template the client asks for: `getToken({ template: CLERK_JWT_TEMPLATE })`.
 *
 * It is a CUSTOM HS256 template rather than Clerk's default, and that is not a preference:
 * Apps Script has no RSA verification primitive at all, so an RS256 token — Clerk's default —
 * arrives at the gateway unverifiable. Confirmed available on Clerk's free Hobby plan
 * (2026-09-07); it was the one thing that could have forced a redesign.
 */
export const CLERK_JWT_TEMPLATE = 'gateway';

/**
 * ⚠️ This is a DEVELOPMENT instance (`pk_test_`). Going live means a second Clerk instance with
 * its own publishable key, its own JWT template, and its own signing key — the template does not
 * travel between instances. Both values change in two places each; plan it as a step rather than
 * discovering it on the day.
 */
export const CLERK_IS_DEVELOPMENT = CLERK_PUBLISHABLE_KEY.startsWith('pk_test_');
