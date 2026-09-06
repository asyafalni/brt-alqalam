# Gateway Findings — Google Apps Script + Clerk + Sheets

**Status:** research findings, v1 · **Date:** 2026-09-06 · **Scope:** technical facts needed to build
the Apps Script "gateway" web app described in `CLAUDE.md` §19 (single Clerk-gated Apps Script
gateway for both read and write).

**Anti-hallucination rule applies.** Every claim below carries a source URL. Where a fact could not
be confirmed from official documentation it is marked `UNKNOWN — could not confirm …`. Facts
established by direct probe (curl) rather than documentation are labelled **[probe]** with the exact
command's result.

Given as already-established and not re-verified here: consumer-account quotas (20,000 URL Fetch
calls/day, 90 min triggers runtime/day, 6 min/execution, 30 simultaneous executions per user), and
that Sheets "publish to web" CSV is cached with lag up to ~15 minutes.

---

## 0. Executive summary

**(a) Can a browser `fetch()` an Apps Script web app and read the JSON response?**
**Yes — but only as a CORS "simple request".** Deploy with `access: ANYONE_ANONYMOUS` +
`executeAs: USER_DEPLOYING`, and return a `ContentService` `TextOutput`. The web app does **not**
handle HTTP `OPTIONS`, so **any request that triggers a CORS preflight will fail**. In practice that
means: **no custom request headers (no `Authorization`), and `Content-Type` must be
`text/plain`** (or form/multipart). See §1. **This is the single most design-relevant constraint in
this document**: the Clerk token cannot be sent in an `Authorization` header — it must travel in the
POST body.

**(b) How can Clerk session/JWT verification realistically be done from Apps Script?**
Two facts frame this, and both are load-bearing:
- Apps Script has **no RSA signature *verification* primitive** — `Utilities` offers RSA/HMAC
  *signing* and hashing only (§2.2). Clerk's default session tokens are **RS256** (§2.1).
- **There is no Clerk endpoint that will verify a session JWT for you.**
  `POST /v1/sessions/{session_id}/verify` is deprecated and has been **removed** from every API
  version ≥ 2025-04-10, and `/v1/tokens/verify` never existed (§3.3). "Just call Clerk to check the
  token" — the obvious fallback — **is not available.**

So the token must be verified *locally*, with primitives Apps Script actually has. The way to do
that is **a Clerk JWT template with a custom HS256 signing key** (§2.6): Clerk then signs with
HMAC-SHA256 using a shared secret you choose, and Apps Script verifies it with the **native**
`Utilities.computeHmacSignature(HMAC_SHA_256, …)`. No RSA maths, no big-integer library, no network
call, no unconfirmed language features. This is the recommended path. Full ranking, including what
to do if HS256 templates turn out to be unavailable on the account's plan, is in §2.5.

**Blockers and footguns are collected in §9.**

---

## 1. Apps Script Web App basics

### 1.1 The `doGet` / `doPost` contract

A script is servable as a web app if it contains a `doGet` or `doPost` function. "When a user visits
an app or a program sends the app an HTTP GET request, Apps Script runs the function `doGet(e)`.
When a program sends the app an HTTP POST request, Apps Script runs `doPost(e)` instead."
[[web]](https://developers.google.com/apps-script/guides/web)

The event object `e` carries:

| Field | Meaning (verbatim from docs) |
| --- | --- |
| `e.queryString` | "The value of the query string portion of the URL, or `null` if no query string is specified" |
| `e.parameter` | key/value pairs; "Only the first value is returned for parameters that have multiple values" |
| `e.parameters` | same, but "with an array of values for each key" |
| `e.pathInfo` | "The URL path after `/exec` or `/dev`" |
| `e.contextPath` | "Not used, always the empty string" |
| `e.contentLength` | request body length, or `-1` for GET |
| `e.postData.length` | same as `contentLength` |
| `e.postData.type` | "The MIME type of the POST body" |
| `e.postData.contents` | "The content text of the POST body" |
| `e.postData.name` | "Always the value 'postData'" |

[[web]](https://developers.google.com/apps-script/guides/web)

> 🚩 **This list is exhaustive, and that is the single most important fact in this section.** There is
> **no field for HTTP request headers, no field for cookies, and no field for the client IP address.**
> [[web]](https://developers.google.com/apps-script/guides/web) Three consequences follow directly,
> and they are architectural, not stylistic:
> 1. **Header-based auth is impossible** — not merely blocked by CORS (§1.5), but unreadable by the
>    script even if a non-browser client sent it. The Clerk token **must** travel in the POST body.
> 2. **Clerk's `__session` cookie transport is impossible** — the gateway cannot read cookies.
> 3. **IP-based rate limiting is impossible** — see §5.2 and blocker #5.

`e.pathInfo` is useful: it enables REST-ish routing (`…/exec/state`, `…/exec/txn`) inside a single
`doPost`, rather than an `action` field in the body. Either works; `pathInfo` keeps the body purely
data.

> ⚠️ **Reserved parameter names.** The query-string parameters `c` and `sid` must be avoided; using
> them "can result in an HTTP 405 response."
> [[web]](https://developers.google.com/apps-script/guides/web)

**Only `doGet` and `doPost` are documented handlers.** There is **no documented `doOptions`**
handler in the official Apps Script web-app guide.
[[web]](https://developers.google.com/apps-script/guides/web) See §1.5 for why blog posts claiming
otherwise are wrong.

Valid return values are "an [HTML service] `HtmlOutput` object or a [Content service] `TextOutput`
object." [[web]](https://developers.google.com/apps-script/guides/web)

### 1.2 Deployment settings — exact values

The `appsscript.json` manifest is the authoritative source for the allowed values (the IDE dropdowns
are labels over these enums):

**`webapp.access`** [[manifest]](https://developers.google.com/apps-script/manifest/web-app-api-executable)
- `MYSELF` — "Only the deploying user can run the app."
- `DOMAIN` — "Only users in the same domain as the deployer can run it."
- `ANYONE` — **"Any logged-in user."**
- `ANYONE_ANONYMOUS` — **"Any user, even if not logged in."**

**`webapp.executeAs`** [[manifest]](https://developers.google.com/apps-script/manifest/web-app-api-executable)
- `USER_ACCESSING` — "The web app runs as the user accessing it."
- `USER_DEPLOYING` — "The web app runs as the user who deployed it."

The corresponding IDE labels are "Execute the app as" (*Me* / *User accessing the web app*) and
"Who has access to the app" (*Only myself* / *Anyone with Google account* / *Anyone*).
[[tanaikech]](https://github.com/tanaikech/taking-advantage-of-Web-Apps-with-google-apps-script/blob/master/README.md)

> ⚠️ **Naming trap.** The IDE label **"Anyone" maps to `ANYONE_ANONYMOUS`**, and the IDE label
> **"Anyone with Google account" maps to `ANYONE`**. The manifest enum name `ANYONE` does *not* mean
> unauthenticated. For an unauthenticated SPA you need **`ANYONE_ANONYMOUS`**.
> [[manifest]](https://developers.google.com/apps-script/manifest/web-app-api-executable)

**What `ANYONE` (logged-in) does to an unauthenticated SPA:** the request is not rejected with a
clean 401 — it is answered with a **Google login page, HTTP 200**. Requesting a web app deployed as
"Anyone with Google account" without credentials returns
`"<title>Meet Google Drive - One place for all your files</title>"` with status code 200.
[[tanaikech]](https://github.com/tanaikech/taking-advantage-of-Web-Apps-with-google-apps-script/blob/master/README.md)
That is indistinguishable from success at the status-code level and will silently break JSON
parsing — another reason `ANYONE_ANONYMOUS` is the only workable setting here.

**Execute-as implication for this project.** With `executeAs: USER_DEPLOYING`, all executions run
under the owner's identity, so the owner's Sheets are reachable without the caller having any Google
account — and correspondingly, the "30 simultaneous executions per user" ceiling is consumed by the
*owner*, i.e. it is a global concurrency limit for the whole gateway, not per-caller.

**Google identity is unavailable to the gateway.** In a web app that runs without the visitor's
authorization, `Session.getActiveUser().getEmail()` returns a **blank string** — "the user's email
address is not available in any context that allows a script to run without that user's
authorization."
[[Session]](https://developers.google.com/apps-script/reference/base/session)
This confirms the design assumption: **Clerk (plus the PIN) is the only identity the gateway has.**

### 1.3 URLs: `/exec` vs `/dev`

- Production deployments end in **`/exec`**.
- Test deployments end in **`/dev`** and "can only be accessed by users who have edit access to the
  script."
[[web]](https://developers.google.com/apps-script/guides/web)

The `/dev` URL is therefore **useless for testing the anonymous SPA path** — it always requires a
logged-in editor. Test the real `/exec` URL.

### 1.4 The redirect to `script.googleusercontent.com`

Official and unambiguous:

> "For security, content returned by the Content service is redirected to a one-time URL at
> `script.googleusercontent.com`."
> [[content]](https://developers.google.com/apps-script/guides/content)

Mechanically: a request to `https://script.google.com/macros/s/<id>/exec` returns a **302** whose
`location` header points at `https://script.googleusercontent.com/macros/echo?user_content_key=…`.
[[tanaikech]](https://github.com/tanaikech/taking-advantage-of-Web-Apps-with-google-apps-script/blob/master/README.md)

How clients handle it:
- **Browser `fetch()`** follows redirects automatically (default `redirect: "follow"`), so this is
  transparent to the SPA.
- **`curl` needs `-L`.**
- **Important:** "for both `doGet` and `doPost`, it is required to request with the GET method to the
  redirect URL."
  [[tanaikech]](https://github.com/tanaikech/taking-advantage-of-Web-Apps-with-google-apps-script/blob/master/README.md)
  A POST is therefore serviced by the script, and the *result* is fetched by a follow-up GET to the
  one-time content URL. This matches standard 302 semantics (POST → GET on redirect) and is why
  `curl -X POST -L` misbehaves unless you let curl do the method downgrade normally.

Consequence for the design: the **response** is served from a **different origin**
(`script.googleusercontent.com`) than the one you called (`script.google.com`). CORS must therefore
succeed on the *final* response, and any redirect in a CORS chain also requires the intermediate
response to be CORS-clean.

### 1.5 CORS — the real constraints

**There is no way to set response headers.** `TextOutput` exposes exactly these methods: `append`,
`clear`, `downloadAsFile`, `getContent`, `getFileName`, `getMimeType`, `setContent`, `setMimeType`.
**There is no `setHeader`/`setHeaders` and no way to emit `Access-Control-Allow-Origin` yourself.**
[[TextOutput]](https://developers.google.com/apps-script/reference/content/text-output)

> ⚠️ **Widely-repeated myth.** Numerous blog posts instruct you to "add a `doOptions()` function that
> sets `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods` and `Access-Control-Allow-Headers`"
> — e.g. [[iith.dev]](https://iith.dev/blog/app-script-cors/). **This is not possible**: the
> `TextOutput` API has no header-setting method
> [[TextOutput]](https://developers.google.com/apps-script/reference/content/text-output),
> and `doOptions` is not a documented handler
> [[web]](https://developers.google.com/apps-script/guides/web). Do not build on that advice.

**What actually works.** Community consensus, consistent with the API surface above:
- Returning **`ContentService.createTextOutput()`** avoids CORS errors for GET and POST; returning
  **`HtmlService.createHtmlOutput()`** produces a CORS error for both.
  [[tanaikech]](https://github.com/tanaikech/taking-advantage-of-Web-Apps-with-google-apps-script/blob/master/README.md)
- Apps Script web apps **"only support POST and GET requests"** and "do not understand or respond to
  OPTIONS requests", so any preflighted request fails.
  [[groups.google.com]](https://groups.google.com/g/google-apps-script-community/c/zJpevovcFLA)
  [[iith.dev]](https://iith.dev/blog/app-script-cors/)
- The standard workaround is to keep the request a **CORS "simple request"** by sending
  `Content-Type: text/plain;charset=utf-8` instead of `application/json`, while the script still
  replies with `ContentService.MimeType.JSON`.
  [[medium/diyavijay]](https://diyavijay.medium.com/struggling-with-cors-in-google-apps-script-heres-the-fix-e3eec09f07dd)

**[probe]** An `OPTIONS` request to `https://script.google.com/macros/s/<invalid-id>/exec` with
`Origin` + `Access-Control-Request-Method: POST` returned **HTTP 404 with an HTML body and no
`Access-Control-Allow-*` headers at all**. The same URL with a plain `GET` + `Origin` likewise
returned no CORS headers. This is consistent with "OPTIONS is not routed to the script" but, because
the deployment id was invalid, it is **not** a measurement of a valid deployment's headers.
`UNKNOWN — could not confirm from official documentation that a valid ANYONE_ANONYMOUS deployment
emits Access-Control-Allow-Origin: *`. Google publishes no CORS documentation for Apps Script web
apps. **Verify this with a 10-minute spike against a real deployment before building on it (§10).**

**Rules the SPA must follow (derived from the above):**

| Rule | Why |
| --- | --- |
| `method: "POST"`, no custom headers | any custom header triggers preflight → fails |
| **`Content-Type: "text/plain;charset=utf-8"`** | `application/json` triggers preflight → fails |
| **Clerk token goes in the JSON *body*, never in an `Authorization` header** | `Authorization` is a custom header → preflight → fails |
| server returns `ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON)` | HtmlService causes CORS errors |
| do **not** use `mode: "no-cors"` | it makes the response opaque — you cannot read the JSON |

Note the last row: `mode: "no-cors"` is frequently suggested
[[iith.dev]](https://iith.dev/blog/app-script-cors/) but yields an *opaque* response the SPA cannot
read, which defeats the purpose of a read+write gateway. It is only viable for fire-and-forget
writes (which is how the earlier Google-Forms write path in `CLAUDE.md` §4.1 worked).

`e.postData.type` will be `text/plain` and `e.postData.contents` the raw JSON string, so the
gateway does `JSON.parse(e.postData.contents)` itself.

### 1.6 JSONP — available but rejected

Content Service can serve `MimeType.JAVASCRIPT` for JSONP. Google's own docs warn against it:
"Because anyone can embed the script tag in their web page, you can be tricked into executing the
script when visiting a malicious website, which can then capture returned data."
[[content]](https://developers.google.com/apps-script/guides/content)
**Do not use JSONP for the PII-bearing private read tier.**

---

## 2. Clerk verification from Apps Script

### 2.1 What Clerk signs with

Clerk signs session tokens with **RS256**; the docs' verification example passes
`algorithms: ['RS256']`.
[[clerk-manual-jwt]](https://clerk.com/docs/guides/sessions/manual-jwt-verification)

Claims that must be validated on manual verification:
[[clerk-manual-jwt]](https://clerk.com/docs/guides/sessions/manual-jwt-verification)
- **`exp`** — not expired.
- **`nbf`** — not used before valid.
- **`azp`** (authorized parties) — must match a known permitted origin. Clerk states this is a
  **CSRF protection**; skipping it is a security bug.
- **`sts`** — optional, Organizations: `pending` means the user lacks required org membership.

Token location per Clerk: the `__session` cookie for same-origin, or the `Authorization` header for
cross-origin.
[[clerk-manual-jwt]](https://clerk.com/docs/guides/sessions/manual-jwt-verification)

> 🚩 **Both of Clerk's documented transports are unavailable to us.** Apps Script's event object
> exposes neither headers nor cookies (§1.1), and a custom `Authorization` header would additionally
> trip CORS preflight (§1.5). The SPA must fetch the token explicitly and put it in the request
> **body**; the gateway reads it from `JSON.parse(e.postData.contents).token`.

### 2.1.1 Getting the token in the SPA — and its 60-second TTL

Client-side, the token comes from `Session.getToken()`:
`function getToken(options?: GetTokenOptions): Promise<null | string>`, where options are `template`
("The name of the JWT template from the Clerk Dashboard to generate a new token from"), `skipCache`
(bypass caching and force a server call, default `false`), and `organizationId`.
[[clerk-session]](https://clerk.com/docs/react/reference/objects/session.md)

Clerk states plainly: **"The TTL for a Clerk token is one minute."** Caching is automatic —
"a network request will only be made if the token in memory has expired." "Tokens can only be
generated if the user is signed in", and when offline with retries exhausted it throws
`ClerkOfflineError`.
[[clerk-session]](https://clerk.com/docs/react/reference/objects/session.md)

Two consequences for this design:

1. **Call `getToken()` immediately before each gateway request**, not once at app start. A token
   held for more than 60 seconds is dead. (The SDK's own cache makes this cheap — it only hits the
   network when the in-memory token has actually expired.)
2. 🚩 **The 60-second TTL is incompatible with the offline write queue** described in `CLAUDE.md`
   §4.3 / Phase 3. A write queued in IndexedDB while offline will carry a token that expired long
   before connectivity returns, and `getToken()` throws `ClerkOfflineError` while offline anyway.
   **The queue must store the *event*, not a token, and mint a fresh token at flush time** — which
   in turn means the operator must still be signed in when the queue drains. Since `CLAUDE.md`
   Part III already downgraded offline-first to "optional resilience", this is a constraint to
   record rather than a crisis, but it must not be discovered during implementation.

### 2.2 Apps Script cryptographic primitives — the hard limit

`Utilities` provides these crypto methods
[[Utilities]](https://developers.google.com/apps-script/reference/utilities/utilities):

| Method | Returns | Purpose |
| --- | --- | --- |
| `computeDigest(algorithm, value[, charset])` | `Byte[]` | hashing |
| `computeHmacSha256Signature(value, key)` | `Byte[]` | HMAC-SHA256 |
| `computeHmacSignature(algorithm, value, key)` | `Byte[]` | generic HMAC |
| `computeRsaSha1Signature(value, key)` | `Byte[]` | RSA **sign** |
| `computeRsaSha256Signature(value, key)` | `Byte[]` | RSA **sign** |
| `computeRsaSignature(algorithm, value, key)` | `Byte[]` | RSA **sign** |

**`DigestAlgorithm`**: `MD2`, `MD5`, `SHA_1`, `SHA_256`, `SHA_384`, `SHA_512`
[[DigestAlgorithm]](https://developers.google.com/apps-script/reference/utilities/digest-algorithm)

**`MacAlgorithm`**: `HMAC_MD5`, `HMAC_SHA_1`, `HMAC_SHA_256`, `HMAC_SHA_384`, `HMAC_SHA_512`
[[MacAlgorithm]](https://developers.google.com/apps-script/reference/utilities/mac-algorithm)

Base64 helpers exist and are web-safe-aware — essential for JWT parsing:
`base64DecodeWebSafe(encoded): Byte[]` "Decodes a base-64 web-safe encoded string into a UTF-8 byte
array", plus `base64Encode`/`base64EncodeWebSafe`/`base64Decode`, `getUuid(): String`, and `newBlob`.
[[Utilities]](https://developers.google.com/apps-script/reference/utilities/utilities)

> 🚩 **BLOCKER for networkless verification.** **There is no RSA signature *verification* method in
> the Apps Script `Utilities` API — only signing.**
> [[Utilities]](https://developers.google.com/apps-script/reference/utilities/utilities)
> `computeRsaSha256Signature` requires a **private** key and produces a signature; it cannot check a
> signature against a **public** key. There is no `verifyRsaSha256Signature`.

Compounding this, the V8 runtime removes the usual JS escape hatches. Google states outright: "The
following standard JavaScript APIs are NOT available in the Apps Script V8 runtime" — including
**Crypto (`crypto`, `SubtleCrypto`)**, **Web APIs (`fetch`, `TextEncoder`, `TextDecoder`, `atob`,
`btoa`, `URL`, `URLSearchParams`, `Blob`)**, timers and streams.
[[v8-runtime]](https://developers.google.com/apps-script/guides/v8-runtime)
There is also no module system: "The V8 runtime doesn't support ES6 modules (import / export). To
use libraries, you must either use the Apps Script library mechanism or bundle your code."
[[v8-runtime]](https://developers.google.com/apps-script/guides/v8-runtime)
And of course no npm and no Node `crypto`.

### 2.3 Can a pure-JS JWT library be pasted in?

In principle yes — pure-JS source with no imports and no Web APIs can be pasted into a `.gs` file (or
bundled with e.g. Rollup, which is the clasp v3 recommendation, §7). In practice the options are
poor:

- **`jsrsasign`** — the classic pure-JS RSA/JWS library — is **end-of-life**. Its README states:
  *"Effective 14 Aug 2026, support is no longer provided for jsrsasign and all version of 'npm'
  packages of jsrsasign is deprecated."* Final release **11.1.4** (14 Aug 2026). No successor is
  recommended by the project.
  [[jsrsasign]](https://github.com/kjur/jsrsasign)
  🚩 **Footgun:** adopting an EOL crypto library for auth verification means no future CVE fixes.
- **`fnya/jwt-for-google-apps-script`** — Apps Script JWT library, but **HS256 only**: "サポートしている
  アルゴリズムは、`HS256(HMAC-SHA256)` のみです" (the only supported algorithm is HS256).
  Useless for Clerk's RS256.
  [[fnya]](https://github.com/fnya/jwt-for-google-apps-script)
- **`ITfiers/Apps-Script-Security-Util-Funcs`** — exposes `validateJWT(jsonWebToken, privateKey)`.
  The signature takes a *private* key, and the README does not state the algorithm. 0 stars,
  5 commits, no visible maintenance.
  [[ITfiers]](https://github.com/ITfiers/Apps-Script-Security-Util-Funcs)
  `UNKNOWN — could not confirm which algorithms this library supports`. **Not recommendable.**

**Rolling your own RS256 verify** is mathematically small: RSA verification is the *public* operation
`m = s^e mod n`, then compare against the PKCS#1 v1.5 padded SHA-256 digest — and
`Utilities.computeDigest(SHA_256, …)` and `base64DecodeWebSafe` give you the pieces. The missing
piece is big-integer `modPow`.

`UNKNOWN — could not confirm from official Google documentation whether `BigInt` is available in the
Apps Script V8 runtime.` It is a *language* builtin rather than a Web API, and the official
"NOT available" list covers only Timers, Streams, Web APIs, Crypto and Global Objects — it does not
mention `BigInt`
[[v8-runtime]](https://developers.google.com/apps-script/guides/v8-runtime). A community thread
reports `BigInt` running correctly but misbehaving under the new IDE's *debugger*
[[groups.google.com]](https://groups.google.com/g/google-apps-script-community/c/20SbvLNd-04) —
suggestive, not authoritative. **Settle this with a one-line spike (§10) before choosing this path.**

> 🚩 **Security footgun if you hand-roll.** A naive RS256 verifier that (i) trusts the JWT header's
> `alg` field, or (ii) skips PKCS#1 v1.5 padding structure checks, is vulnerable to the classic
> `alg: none` / algorithm-confusion and Bleichenbacher signature-forgery attacks. Pin
> `alg === "RS256"` from your own config, never from the token.

### 2.4 Clerk's JWKS endpoints

Full detail — including the fact that `https://api.clerk.com/v1/jwks` **requires the secret key**
while the Frontend API `/.well-known/jwks.json` is public — is in **§3.3b**. Two points belong here:

- JWKS should be **fetched once and cached** (`CacheService`, §5.1). Refetching per request wastes
  latency and, if using `/v1/jwks`, sends the secret key on every action. The endpoint itself has no
  rate limit [[clerk-limits]](https://clerk.com/docs/guides/how-clerk-works/system-limits), so the
  constraint is ours, not Clerk's.
- **JWKS only matters for RS256** (§2.5 option 2). Under the recommended HS256-template design
  (§2.6) there is no JWKS at all — the shared secret lives in Script Properties.

### 2.5 Recommended verification strategies, ranked

> The option most people reach for first — "send the token to Clerk and ask if it's valid" — **does
> not exist** (§3.3c). Rank accordingly.

1. **✅ Clerk JWT template with a custom HS256 signing key (recommended).** Clerk signs with
   HMAC-SHA256 using a secret you set; Apps Script verifies with the native
   `Utilities.computeHmacSignature(MacAlgorithm.HMAC_SHA_256, …)` (§2.2). Cryptographically sound,
   zero network calls per request, zero dependencies, no `BigInt` question. Details, caveats and the
   verification code shape in **§2.6**.
2. **Local RS256 verify against a cached JWKS.** The correct approach for default session tokens,
   but requires implementing `modPow` (or shipping a library) because Apps Script has no RSA verify
   (§2.2/§2.3). Viable, and Clerk explicitly recommends networkless verification — but it depends on
   unconfirmed `BigInt` support (§2.3) and on getting PKCS#1 v1.5 padding checks right. Use this if
   §2.6 turns out to be blocked.
3. **⚠️ Session-status lookup via `GET /v1/sessions/{session_id}` — a *supplement*, never a
   substitute.** Decoding the token to read `sid`, then asking Clerk whether that session is
   `active`, gives you **revocation checking**, which neither option 1 nor 2 provides on its own
   (a stolen token stays valid until `exp`). 🚩 **It is not authentication.** It verifies no
   signature, so anyone who learns a valid session id could forge a token that passes it. Layer it
   on top of 1 or 2 if revocation matters; never run it alone.
4. **❌ Paste in `jsrsasign`.** Works today, but EOL since 14 Aug 2026 with no CVE fixes coming
   [[jsrsasign]](https://github.com/kjur/jsrsasign). Not recommended for new auth code.
5. **❌ Networked token verification via the Clerk Backend API.** **Not possible** — no such endpoint
   (§3.3c). Listed only so it is not re-proposed later.

**Worth stating plainly:** under the locked operating model (`CLAUDE.md` Part IX §38 — Model C
kiosk, shared device, every action authorised by a personal 4-digit PIN, **no login**), the *stock
transaction* path may carry no Clerk token at all — the PIN is the credential, and the gateway
resolves it against its own `pinHash → userId` map (§3.3e). In that case Clerk JWT verification is
needed only on the **admin** surface (Menu Admin: roster management, catalog edits, threshold
changes), which is low-frequency. That materially shrinks the blast radius of everything in this
section, and is worth confirming before investing in option 2.

### 2.6 The HS256 JWT-template route, in detail

**What Clerk supports.** A JWT template can be configured with a **"Custom signing key"** and the
**HS256** algorithm. Clerk's own Hasura integration documents the consequence: "If you did use a
custom signing key, instead of providing the `jwk_url` you need to provide the algorithm type and
key in the stringified JSON object" — `'{"type": "HS256", "key": "<YOUR_SIGNING_KEY>" }'`.
[[clerk-hasura]](https://clerk.com/docs/guides/development/integrations/databases/hasura)
The dashboard step is "Enable the **Custom signing key** and select the HS256 algorithm", then paste
the secret into the template's **Signing key** field.
[[gitbook-clerk]](https://github.com/GitbookIO/va-nextjs-clerk)

**How it wires up here:**

| Where | What |
| --- | --- |
| Clerk Dashboard | JWT template named e.g. `brt-gateway`, Custom signing key **on**, algorithm **HS256**, signing key = a long random secret |
| Apps Script | the same secret in Script Properties as `CLERK_JWT_HS256_KEY` (§7) |
| SPA | `await session.getToken({ template: 'brt-gateway' })` [[clerk-session]](https://clerk.com/docs/react/reference/objects/session.md) |
| Gateway | verify with `Utilities.computeHmacSignature` |

```js
function verifyClerkHs256(jwt) {
  const parts = String(jwt).split('.');
  if (parts.length !== 3) return null;
  const [h64, p64, s64] = parts;

  // 1. Pin the algorithm from OUR config — never trust the token's header.
  const header = JSON.parse(bytesToString(Utilities.base64DecodeWebSafe(h64)));
  if (header.alg !== 'HS256') return null;              // blocks alg-confusion / "alg: none"

  // 2. Recompute the MAC over the exact signing input.
  const key = PropertiesService.getScriptProperties().getProperty('CLERK_JWT_HS256_KEY');
  const expected = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_256, h64 + '.' + p64, key)
  ).replace(/=+$/, '');                                 // JWTs are unpadded base64url
  if (!constantTimeEquals(expected, s64)) return null;

  // 3. Only now is the payload trustworthy.
  const c = JSON.parse(bytesToString(Utilities.base64DecodeWebSafe(p64)));
  const now = Math.floor(Date.now() / 1000), skew = 5;  // Clerk's own default is 5000 ms
  if (typeof c.exp !== 'number' || now > c.exp + skew) return null;
  if (typeof c.nbf === 'number' && now + skew < c.nbf)  return null;
  if (c.iss !== EXPECTED_ISS)                           return null;
  if (c.azp && ALLOWED_ORIGINS.indexOf(c.azp) === -1)   return null;  // CSRF guard
  return c;                                             // c.sub = user id, c.sid = session id
}
```

Notes on the code above:
- `Utilities.base64DecodeWebSafe` and `base64EncodeWebSafe` are the web-safe (base64url) variants
  JWTs need [[Utilities]](https://developers.google.com/apps-script/reference/utilities/utilities);
  JWT omits `=` padding, hence the trailing strip.
- The **5-second clock skew** mirrors Clerk's own `clockSkewInMs` default of 5000 ms
  [[clerk-verify-token]](https://clerk.com/docs/reference/backend/verify-token).
- Claim checks follow Clerk's prescribed order (`alg` → signature → `exp`/`nbf` → `azp`)
  [[clerk-manual-jwt]](https://clerk.com/docs/guides/sessions/manual-jwt-verification).
  Clerk warns that "Not setting this value can open your application to CSRF attacks", and notes
  "If the `azp` claim doesn't exist, you can skip this step."
- Session-token claims available to key off: `sub` (user id, e.g. `user_123`), `sid` (session id),
  `iss` (Frontend API URL — `https://clerk.your-site.com` in production,
  `https://your-site.clerk.accounts.dev` in development), plus `azp`, `exp`, `iat`, `nbf`, `v`,
  `fva`, `sts`.
  [[clerk-session-tokens]](https://clerk.com/docs/guides/sessions/session-tokens)
- ⚠️ A **custom template's** claim set is whatever the template defines; confirm `sub`/`azp` are
  actually emitted by your template before relying on them.
  `UNKNOWN — could not confirm which default claims Clerk includes in a custom JWT template versus
  the default session token.`

**Trade-offs, honestly:**
- 🚩 **Symmetric key = the gateway can mint tokens, not just check them.** Whoever holds
  `CLERK_JWT_HS256_KEY` can forge a token for *any* user of that template. That is strictly worse
  than RS256's public-key verification. In this deployment it is an acceptable trade because the
  same Script Properties store already holds the Clerk **secret key** (§7), which is more powerful
  still — but it means the two secrets share a fate, and both are readable by every script editor.
  If you want to reduce blast radius, **the HS256 template key removes the need to store the Clerk
  secret key at all** for the verification path — consider whether the gateway needs the secret key
  for anything else (§3.3) and omit it if not.
- ⚠️ **Template tokens are not the default session token**, so anything that assumes `getToken()`
  with no arguments will get an RS256 token this verifier rejects. Be consistent.
- ❓ `UNKNOWN — could not confirm from Clerk's pricing pages whether JWT templates (or custom signing
  keys specifically) require a paid plan.` Clerk's pricing page advertises a free tier up to 50,000
  MAU [[clerk-pricing]](https://clerk.com/pricing), and Clerk states that Pro features can be tried
  in a development instance with paid-only features tagged in the Dashboard. **Check the Dashboard
  before committing to this design** — it is a 2-minute check and it decides between option 1 and
  option 2 in §2.5. This is spike #5 (§10).

## 3. Clerk Backend API — endpoints and limits

### 3.1 Base URL and authentication

**Base URL: `https://api.clerk.com/v1`.**
**Auth header: `Authorization: Bearer <YOUR_API_KEY>`** (the instance **secret key**, `sk_…`).

**[probe]** Confirmed directly by Clerk's own error response to an unauthenticated request:
```
$ curl https://api.clerk.com/v1/jwks
HTTP 401
{"errors":[{"message":"Invalid Authorization header format",
"long_message":"Invalid Authorization header format. Must be 'Bearer <YOUR_API_KEY>'",
"code":"authorization_header_format_invalid"}]}
```

In Apps Script that is:
```js
const secret = PropertiesService.getScriptProperties().getProperty('CLERK_SECRET_KEY');
const res = UrlFetchApp.fetch('https://api.clerk.com/v1/' + path, {
  method: 'get',
  headers: { Authorization: 'Bearer ' + secret },
  muteHttpExceptions: true,          // so a 4xx returns a response instead of throwing
});
const code = res.getResponseCode();
```
`UrlFetchApp.fetch(url, params)` supports exactly what is needed here
[[UrlFetchApp]](https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app):
- `method` — "get, delete, patch, post, or put" (**`patch` is supported**, which the Clerk metadata
  update needs);
- `headers` — "a JavaScript key/value map of HTTP headers for the request";
- `contentType` — defaults to `application/x-www-form-urlencoded`, so **set it to `application/json`
  explicitly** when POSTing/PATCHing JSON to Clerk;
- `payload`, `followRedirects` (default `true`), `validateHttpsCertificates`, `escaping`;
- `muteHttpExceptions` — "If `true` the fetch doesn't throw an exception if the response code
  indicates failure, and instead returns the `HTTPResponse`."

Response side: `getResponseCode()`, `getContentText()`, `getAllHeaders()`.
[[UrlFetchApp]](https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app)

Always pass `muteHttpExceptions: true` — otherwise `UrlFetchApp` throws on non-2xx and you cannot
read Clerk's error body or the `Retry-After` header (§3.2), which turns a recoverable 429 into an
opaque crash.

> Note the asymmetry that trips people up: **inbound** to the gateway, `Content-Type` must be
> `text/plain` (§1.5); **outbound** from the gateway to Clerk, it must be `application/json`. The
> restriction is a browser-CORS one, and does not apply to `UrlFetchApp`.

### 3.2 Rate limits (Clerk side)

[[clerk-limits]](https://clerk.com/docs/guides/how-clerk-works/system-limits)
- **Production instances: "1000 requests per 10 seconds".**
- **Development instances: "100 requests per 10 seconds".**
- **JWKS retrieval has no rate limit.**
- **User / Organization / Membership *update* operations: "10 requests per 10 seconds" per specific
  resource.**
- Invitation endpoints: 100–250 requests/hour; bulk invitations 25/hour (50/hour for organizations).
- On exceeding a limit, "all subsequent requests to that specific endpoint will be blocked for a
  given amount of time", and responses carry a **`Retry-After`** header "which contains the number of
  seconds after which the block expires."

> ⚠️ **Two things to plan around.** (1) A **development** instance's 100 req/10 s is easy to trip
> while testing a rapid-scan flow — make sure the gateway is pointed at a production instance before
> any qurban-day rehearsal. (2) The **10 updates per 10 s per resource** limit applies to writing a
> user's `private_metadata`; that is fine for occasional PIN changes but rules out using Clerk
> metadata as a hot counter (e.g. failed-attempt tallies). Those belong in `CacheService` (§5.2).

### 3.3 Endpoints

Endpoint facts below are taken from Clerk's **official OpenAPI specs**
([[clerk/openapi-specs]](https://github.com/clerk/openapi-specs) — the MIT-licensed source that the
docs reference site renders) cross-checked against the rendered docs pages.

#### 3.3a API versioning — pin it

Clerk supports pinning the API version two ways
[[clerk-versioning]](https://clerk.com/docs/guides/development/upgrading/versioning):
- query parameter `__clerk_api_version`, **or**
- header `Clerk-API-Version`.

> "You must choose only one method to specify a version. Using both the query parameter and the
> header simultaneously will lead to an invalid request."
> [[clerk-versioning]](https://clerk.com/docs/guides/development/upgrading/versioning)

Published versions: `2026-05-12`, `2025-11-10`, `2025-04-10`, `2024-10-01`, `2021-02-05`.

`UNKNOWN — could not confirm which API version applies to a raw HTTP request that sends neither
header nor query parameter.` **Pin `Clerk-API-Version` explicitly in the gateway** so a future
default flip cannot silently change behaviour. This matters concretely: §3.3d describes a breaking
metadata change between versions.

#### 3.3b JWKS — the two endpoints differ on auth

| Endpoint | Auth | Notes |
| --- | --- | --- |
| `GET https://api.clerk.com/v1/jwks` | **Secret key required** | the spec declares `security: - bearerAuth: []` globally with no override on this path; **[probe]** unauthenticated → 401 (§3.1) |
| `GET <Frontend API URL>/.well-known/jwks.json` | **Public** | the Frontend API spec declares `security: []` on this operation, explicitly overriding the global |
| Dashboard → API keys → **JWKS Public Key** | n/a | a PEM you can paste straight into Script Properties |

All three are Clerk's own documented options: "1. Use the Backend API in JSON Web Key Set (JWKS)
format at the following endpoint `https://api.clerk.com/v1/jwks`. 2. Use your Frontend API URL in
JWKS format … with `/.well-known/jwks.json` appended to it. 3. Use your **JWKS Public Key**, which
can be found on the **API keys** page in the Clerk Dashboard."
[[clerk-manual-jwt]](https://clerk.com/docs/guides/sessions/manual-jwt-verification)

> ⚠️ **Common misconception corrected.** Many third-party write-ups assume `/v1/jwks` is public. It
> is not — see the probe in §3.1.

`GET /v1/jwks` carries **no rate limit**.
[[clerk-limits]](https://clerk.com/docs/guides/how-clerk-works/system-limits)

Response shape (`JWKS` schema): `{ "keys": [ … ] }`, where an RSA member requires
`kid`, `alg`, `use`, `kty` (`"RSA"`), `n`, `e` (optionally `x5c`, `x5t`, `x5t#S256`, `x5u`). ECDSA
(`kty: EC`, `crv`, `x`, `y`) and Ed25519 (`kty: OKP`) variants are also modelled — **do not assume
RSA-only when parsing.**
[[clerk/openapi-specs]](https://github.com/clerk/openapi-specs)

Note that the **JWKS Public Key (PEM) option removes the JWKS fetch entirely** — but it does **not**
remove the need for an RSA verify primitive, which Apps Script lacks (§2.2). It shortens option 2 in
§2.5; it does not enable it.

#### 3.3c 🚩 There is NO endpoint that verifies a session JWT

This is the headline correction to the obvious design.

**`POST /v1/sessions/{session_id}/verify` is deprecated and removed.** In the `2021-02-05` and
`2024-10-01` specs it exists with `deprecated: true` and a dedicated `410 DeprecatedEndpoint`
response, and its description reads:

> "Returns the session if it is authenticated; otherwise, returns an error. **WARNING: This endpoint
> is deprecated and will be removed in future versions. We strongly recommend switching to
> networkless verification using short-lived session tokens**, which is implemented transparently in
> all recent SDK versions."
> [[clerk/openapi-specs]](https://github.com/clerk/openapi-specs)

Presence by API version [[clerk/openapi-specs]](https://github.com/clerk/openapi-specs):

| API version | present? |
| --- | --- |
| 2021-02-05 | yes (deprecated, `410` defined) |
| 2024-10-01 | yes (deprecated, `410` defined) |
| 2025-04-10 | **no — removed** |
| 2025-11-10 | **no** |
| 2026-05-12 | **no** |

The SDK wrapper is likewise retired: "**Deprecated:** This method is now deprecated. Refer to the
Manual JWT Verification guide for the recommended way to verify sessions/tokens."
[[clerk-verify-session]](https://clerk.com/docs/reference/backend/sessions/verify-session)

⚠️ `UNKNOWN — could not confirm the runtime behaviour of POST /v1/sessions/{id}/verify today when
pinned to an old API version.` The removal is evidenced by the versioned specs, but Clerk's
human-readable versioning changelog does not announce it. **Treat the endpoint as gone.**

**And there is no replacement.** There is **no `/v1/tokens/verify`** — no `/tokens` path exists in
any published version. The only `*verify*` paths in the current spec verify *other* credential
types [[clerk/openapi-specs]](https://github.com/clerk/openapi-specs):

| Path | Verifies |
| --- | --- |
| `POST /v1/clients/verify` | the **client** token (`__client`), not the session token |
| `POST /v1/api_keys/verify` | Clerk API Keys (`ak_…`) |
| `POST /v1/m2m_tokens/verify` | machine-to-machine tokens |
| `POST /v1/oauth_applications/access_tokens/verify` | OAuth access tokens |
| `POST /v1/users/{user_id}/verify_password` | a password |
| `POST /v1/users/{user_id}/verify_totp` | a TOTP code |

**Conclusion: the gateway must verify the session token itself.** That is what makes §2.6 (HS256
template) the recommended design rather than a clever shortcut.

**`GET /v1/sessions/{session_id}`** *is* alive and returns the `Session` object — `id`, `user_id`,
`client_id`, `actor`, `status`, `last_active_organization_id`, `last_active_at`, `latest_activity`,
`expire_at`, `abandon_at`, `updated_at`, `created_at`. `status` is an enum of exactly seven values:
`active, revoked, ended, expired, removed, abandoned, replaced`.
[[clerk/openapi-specs]](https://github.com/clerk/openapi-specs)
[[clerk-get-session]](https://clerk.com/docs/reference/backend-api/tag/sessions/GET/sessions/{session_id})
`GET /v1/sessions` (list) accepts `client_id`, `user_id`, `status`. Use this for **revocation
checking only** — see §2.5 option 3 for why it is not authentication.

#### 3.3d Users and `private_metadata`

**Read — `GET https://api.clerk.com/v1/users/{user_id}`** (`operationId: GetUser`). The `User`
schema **does include `private_metadata`** (`nullable: true, type: object`), alongside
`public_metadata` and `unsafe_metadata`.
[[clerk-get-user]](https://clerk.com/docs/reference/backend-api/tag/users/GET/users/{user_id})
[[clerk/openapi-specs]](https://github.com/clerk/openapi-specs)
This is consistent with the Part VI rule that `privateMetadata` never reaches the browser.

**Write — 🚩 `PATCH /v1/users/{user_id}/metadata`, NOT `PATCH /v1/users/{user_id}`.**

```
PATCH https://api.clerk.com/v1/users/{user_id}/metadata
Authorization: Bearer sk_live_...
Content-Type: application/json

{ "private_metadata": { "pinHash": "…", "role": "anggota" } }
```

`operationId: UpdateUserMetadata`, verbatim: "Update a user's metadata attributes by **merging**
existing values with the provided parameters. This endpoint behaves differently than the *Update a
user* endpoint. **Metadata values will not be replaced entirely. Instead, a deep merge will be
performed.** Deep means that any nested JSON objects will be merged as well. **You can remove
metadata keys at any level by setting their value to `null`.**"
[[clerk-update-metadata]](https://clerk.com/docs/reference/backend-api/tag/users/PATCH/users/{user_id}/metadata)

A replace variant exists: `PUT /v1/users/{user_id}/metadata` (`ReplaceUserMetadata`) — "replaces the
supplied metadata fields entirely … Prefer the `PATCH` endpoint for partial updates."
[[clerk/openapi-specs]](https://github.com/clerk/openapi-specs)

> 🚩 **Breaking change — API version 2026-05-12.** "Removes metadata fields from the user and
> Organization update endpoints. User metadata fields (`public_metadata`, `private_metadata`,
> `unsafe_metadata`) are removed from `PATCH /v1/users/{user_id}` … Organization metadata fields
> (`public_metadata`, `private_metadata`) are removed from `PATCH /v1/organizations/{organization_id}`.
> **Metadata must now be set through the dedicated metadata endpoints.**"
> [[clerk-versioning]](https://clerk.com/docs/guides/development/upgrading/versioning)
> Most tutorials still show the old form. **Do not build on `PATCH /v1/users/{user_id}` for
> metadata** — it is deprecated on 2025-04-10 and rejected on 2026-05-12.

**Rate limit:** "10 requests per 10 seconds per user" across
`PATCH /v1/users/{user_id}`, `PATCH /v1/users/{user_id}/metadata`, `PUT /v1/users/{user_id}/metadata`.
[[clerk-limits]](https://clerk.com/docs/guides/how-clerk-works/system-limits)

#### 3.3e 🚩 You CANNOT look up a user by `private_metadata`

`GET /v1/users` supports these query parameters, and **no others** (identical in the `2021-02-05` and
`2026-05-12` specs) [[clerk/openapi-specs]](https://github.com/clerk/openapi-specs):

`email_address`, `phone_number`, `external_id`, `username`, `web3_wallet`, `user_id`,
`organization_id`, `query`, `email_address_query`, `phone_number_query`, `username_query`,
`name_query`, `banned`, `last_active_at_before/after/since`, `created_at_before/after`,
`last_sign_in_at_before/after`, `provider`, `provider_user_id`, `limit`, `offset`,
`starting_after`, `order_by`.

**There is no metadata filter parameter.** The general `query` param is explicitly scoped: "we check
the **email addresses, phone numbers, usernames, web3 wallets, user IDs, first and last names**."
[[clerk-list-users]](https://clerk.com/docs/reference/backend-api/tag/users/GET/users)

**This directly constrains the Model C design** (`CLAUDE.md` Part VII: "gateway keeps a
`pinHash → userId` map"). The options are:
1. ✅ **Keep the `pinHash → userId` map in the gateway's own `PropertiesService`** — the "simpler
   alternative" already anticipated in Part VI, and now effectively the **only** clean option. At
   masjid scale (tens of users) it fits comfortably in the 500 KB store (§5.1).
2. ⚠️ Store the hash in `external_id` (which **is** filterable, up to 100 values with `+`/`-`
   prefixes) and query `GET /v1/users?external_id=<hash>`. **Rejected:** `external_id` is not
   private — it appears on the `User` object — so this publishes the PIN hash, and a 4-digit PIN
   hash in the open is trivially brute-forced (§4.2).
3. ⚠️ List all users once and cache the map. Costs a paged walk on every cache miss. Clerk's own
   pagination advice: "To walk more than a few pages, paginate with `starting_after` rather than
   `offset`. A cursor page costs the same no matter how far into the list it sits, while a large
   `offset` has to walk and discard every row before it."
   [[clerk/openapi-specs]](https://github.com/clerk/openapi-specs)

**Take option 1.** It also removes the per-PIN-attempt Clerk round-trip entirely, which matters for
the 6-minute execution budget and the rate-limit design (§5).

#### 3.3f Organization `private_metadata`

**Read:** `GET https://api.clerk.com/v1/organizations/{organization_id}` — accepts an **ID or slug**;
the `Organization` schema includes `public_metadata` and `private_metadata`.
[[clerk/openapi-specs]](https://github.com/clerk/openapi-specs)

**Write (merge):** `PATCH https://api.clerk.com/v1/organizations/{organization_id}/metadata`
(`MergeOrganizationMetadata`) — "Update organization metadata attributes by merging existing values
with the provided parameters. Metadata values will be updated via a deep merge … You can remove
metadata keys at any level by setting their value to `null`." Body accepts only `public_metadata`
and `private_metadata`.
[[clerk-org-metadata]](https://clerk.com/docs/reference/backend-api/tag/organizations/PATCH/organizations/{organization_id}/metadata)
**Write (replace):** `PUT /v1/organizations/{organization_id}/metadata` (`ReplaceOrganizationMetadata`).

Same 2026-05-12 breaking change applies to `PATCH /v1/organizations/{organization_id}`.
[[clerk-versioning]](https://clerk.com/docs/guides/development/upgrading/versioning)
Rate limit: 10 requests per 10 seconds **per Organization**.
[[clerk-limits]](https://clerk.com/docs/guides/how-clerk-works/system-limits)

> ⚠️ Relevant to `CLAUDE.md` Part VI (which considered per-role PIN hashes in an Organization's
> `privateMetadata`): the 10-writes-per-10-seconds-per-Organization cap makes a single Organization
> object fine for **configuration** and wrong for anything per-transaction. Since Part VII superseded
> that with per-person PINs anyway, and §3.3e forces the map into `PropertiesService`, this is now
> mostly moot — recorded so it is not re-proposed.

#### 3.3g Other deprecations noted in passing

[[clerk/openapi-specs]](https://github.com/clerk/openapi-specs)
[[clerk-versioning]](https://clerk.com/docs/guides/development/upgrading/versioning)
[[clerk-verify-token]](https://clerk.com/docs/reference/backend/verify-token)

| Item | Status |
| --- | --- |
| `POST /v1/sessions/{id}/verify` | deprecated, absent from specs ≥ 2025-04-10 |
| `clerkClient.sessions.verifySession()` | officially deprecated |
| metadata on `PATCH /v1/users/{user_id}` | removed in 2026-05-12 |
| metadata on `PATCH /v1/organizations/{organization_id}` | removed in 2026-05-12 |
| Session token JWT **v1** | deprecated 2025-04-14; v2 added in API version 2025-04-10 |
| `jwksCacheTtlInMs` (SDK option) | deprecated — "Specifying a cache TTL is a no-op" |
| `GET /v1/clients` | marked `deprecated: true` |


## 4. PIN hashing in Apps Script

### 4.1 What is available

Only what is listed in §2.2: `computeDigest` (MD2/MD5/SHA_1/SHA_256/SHA_384/SHA_512) and HMAC
(MD5/SHA_1/SHA_256/SHA_384/SHA_512).
[[Utilities]](https://developers.google.com/apps-script/reference/utilities/utilities)
[[DigestAlgorithm]](https://developers.google.com/apps-script/reference/utilities/digest-algorithm)
[[MacAlgorithm]](https://developers.google.com/apps-script/reference/utilities/mac-algorithm)

**bcrypt, scrypt and Argon2 are not available** — none appears in the `Utilities` API
[[Utilities]](https://developers.google.com/apps-script/reference/utilities/utilities),
and the V8 runtime provides no `crypto`/`SubtleCrypto`
[[v8-runtime]](https://developers.google.com/apps-script/guides/v8-runtime).
There is no key-derivation primitive (no PBKDF2) either.

### 4.2 The problem this creates

A 4-digit PIN has a **10⁴ = 10,000** keyspace. A plain or even salted SHA-256 of a 4-digit PIN is
**exhaustively enumerable in microseconds** by anyone who obtains the hash. Memory-hard KDFs exist
precisely to make this expensive, and none of them is available here. `CLAUDE.md` §27 already states
the PIN is "attribution-grade, not security-grade"; this section is the technical confirmation.

### 4.3 Best realistic approach

**HMAC-SHA256 with a secret pepper held in `PropertiesService`, plus a per-user salt:**

```js
// pepper is a long random string in Script Properties; NEVER in the repo, NEVER sent to the browser
const pepper = PropertiesService.getScriptProperties().getProperty('PIN_PEPPER');
const mac = Utilities.computeHmacSignature(
  Utilities.MacAlgorithm.HMAC_SHA_256,
  userSalt + ':' + pin,      // per-user random salt, stored alongside the hash
  pepper                     // the keyed secret
);
const pinHash = Utilities.base64Encode(mac);
```

Why this is the right shape given the constraints:
- **Keyed, not just hashed.** Because the pepper is a *key*, an attacker who exfiltrates the sheet or
  the Clerk metadata but *not* the Script Properties **cannot** brute-force the 10,000 candidates —
  they lack the HMAC key. This is the only meaningful defence available, and it converts the threat
  model from "hash leak = instant compromise" to "hash leak alone is useless".
- **Per-user salt** prevents two users with the same PIN from colliding to the same hash (relevant
  because `CLAUDE.md` §Part VII requires globally unique PINs — identical hashes would leak that
  collision).
- **Iteration is possible but low-value.** You can loop `computeHmacSignature` N times to stretch,
  but 6-minute execution budget and per-request latency cap N low, and it does not help against the
  pepper-holder. Prioritise pepper secrecy and rate-limiting over stretching.
- **Constant-time compare.** Compare hashes byte-by-byte accumulating a difference, not with `===`
  early-exit, to avoid timing leaks.

> 🚩 **The pepper and the Clerk secret key must never be in the git repo** (§7 — the script *is*
> version-controlled). Set them via the Apps Script IDE's Project Settings → Script Properties, and
> keep them out of `clasp push`.

**The load-bearing control is still rate-limiting**, exactly as `CLAUDE.md` Part VII says — see §5.

---

## 5. Rate limiting / lockout in Apps Script

### 5.1 Persistence options

| | `PropertiesService` | `CacheService` |
| --- | --- | --- |
| Durability | persistent | **"not guaranteed to persist until its expiration time. You must be prepared to get back `null` from all reads."** [[CacheService]](https://developers.google.com/apps-script/reference/cache/cache-service) |
| Max value | **9 KB / value** [[quotas]](https://developers.google.com/apps-script/guides/services/quotas) | **100 KB per key** [[Cache]](https://developers.google.com/apps-script/reference/cache/cache) |
| Total | **500 KB / property store** [[quotas]](https://developers.google.com/apps-script/guides/services/quotas) | **cap of 1,000 cached items** [[Cache]](https://developers.google.com/apps-script/reference/cache/cache) |
| Max key | `UNKNOWN — could not confirm a documented max key length for PropertiesService` | **250 characters** [[Cache]](https://developers.google.com/apps-script/reference/cache/cache) |
| TTL | none (manual) | default **600 s (10 min)**; range **min 1 s, max 21600 s (6 hours)** [[Cache]](https://developers.google.com/apps-script/reference/cache/cache) |
| Scopes | script / user / document [[properties]](https://developers.google.com/apps-script/guides/properties) | `getScriptCache()` / `getUserCache()` / `getDocumentCache()` [[CacheService]](https://developers.google.com/apps-script/reference/cache/cache-service) |

Scope semantics: script properties are "common to all users of the script"; user properties are
per-user; document properties are per-document.
[[properties]](https://developers.google.com/apps-script/guides/properties)
Same three-way split for cache.
[[CacheService]](https://developers.google.com/apps-script/reference/cache/cache-service)

### 5.2 Which to use for PIN lockout

**`CacheService.getScriptCache()` is the right primitive for the failed-attempt counter**, because:
- lockout is inherently **time-boxed**, and cache has native TTL up to 6 hours — matching the
  "cooldown" semantics of `CLAUDE.md` Part VII without you writing expiry logic;
- 500 KB total on Properties is small, and a counter per device would slowly fill it with entries
  nobody ever cleans up;
- 1,000-item cap and 100 KB/key are ample for a few admins.

> 🚩 **Footgun — cache eviction is a lockout bypass.** Because cache reads may return `null` at any
> time [[CacheService]](https://developers.google.com/apps-script/reference/cache/cache-service),
> an attacker cannot *rely* on eviction, but eviction does silently reset an attacker's counter.
> For a 10,000-keyspace secret this matters. **Mitigation:** on reaching the threshold, write the
> lockout to `PropertiesService` (durable) as well; treat cache as the fast path and Properties as
> the floor.

> ⚠️ **`getUserCache()`/`getUserProperties()` are useless here.** They key off the *Google* user, and
> under `ANYONE_ANONYMOUS` there is no Google identity — `Session.getActiveUser().getEmail()` is
> blank [[Session]](https://developers.google.com/apps-script/reference/base/session). Rate-limit
> keys must be derived from something the SPA supplies (a device id) or from the Clerk user id,
> both of which are **client-controlled and therefore spoofable**.
> **The caller's IP address is not obtainable.** The documented `doGet`/`doPost` event object has no
> field for request headers, cookies, or client IP
> [[web]](https://developers.google.com/apps-script/guides/web) — see the callout in §1.1. There is
> therefore no server-trusted key to rate-limit on. This is a genuine weakness of per-device
> rate-limiting on this platform: see §9, blocker #5.

### 5.3 Concurrency: `LockService`

[[LockService]](https://developers.google.com/apps-script/reference/lock/lock-service)
- `getScriptLock()` — "A code section guarded by a script lock cannot be executed simultaneously
  regardless of the identity of the user." **This is the one to use.**
- `getUserLock()` — per-user; useless here for the same reason as §5.2.
- `getDocumentLock()` — returns `null` in standalone scripts/web apps.

`Lock` methods [[Lock]](https://developers.google.com/apps-script/reference/lock/lock):
- `tryLock(timeoutInMillis): Boolean` — "Attempts to acquire the lock, timing out after the provided
  number of milliseconds." Returns `false` on timeout.
- `waitLock(timeoutInMillis): void` — identical "except that it throws an exception when the lock
  could not be acquired instead of returning `false`."
- `releaseLock(): void` — "Releases the lock, allowing other processes waiting on the lock to
  continue." Happens automatically at script termination, but manual release is recommended.
- `hasLock(): Boolean`.

The lock "is not actually acquired until" `tryLock()` or `waitLock()` is called.
[[LockService]](https://developers.google.com/apps-script/reference/lock/lock-service)

`UNKNOWN — could not confirm a documented maximum lock timeout or maximum lock-hold duration.`
In practice the 6-min execution limit bounds hold time.

> ⚠️ A read-modify-write counter (read attempts → increment → write) is **not atomic** across the
> 30 concurrent executions. Guard it with a script lock, or accept that a burst of parallel guesses
> can undercount. For a few-admin kiosk this is minor, but it is real.

---

## 6. Appending rows to Sheets safely

### 6.1 `appendRow` vs the Sheets API

`Sheet.appendRow(rowContents)` — "Appends a row to the bottom of the current data region in the
sheet."
[[Sheet]](https://developers.google.com/apps-script/reference/spreadsheet/sheet#appendrowrowcontents)
`UNKNOWN — could not confirm any documented atomicity or concurrency guarantee for
Sheet.appendRow.` The docs are silent on locking.

Sheets API v4 alternative: `POST https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values/{range}:append`
with `valueInputOption` (required) and `insertDataOption` (`OVERWRITE` | `INSERT_ROWS`).
[[values.append]](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append)
`UNKNOWN — could not confirm atomicity or concurrent-append behaviour for values.append` — the
reference does not address it.

**Recommendation for the gateway:** stay on `SpreadsheetApp.appendRow` (no extra OAuth scope, no
URL-Fetch quota consumed) and **wrap every write in a script lock**, since neither API documents an
atomicity guarantee:

```js
const lock = LockService.getScriptLock();
if (!lock.tryLock(30000)) {
  return json({ ok: false, error: 'busy' });   // caller retries with same clientTxnId
}
try {
  // 1. re-read tail for idempotency: has this clientTxnId already landed?
  // 2. compute stok awal/akhir snapshot
  sheet.appendRow(row);
  SpreadsheetApp.flush();                      // force the write out before releasing
} finally {
  lock.releaseLock();
}
```

Two points worth noting:
- `SpreadsheetApp.flush()` inside the lock matters — Apps Script batches spreadsheet operations, so
  releasing the lock before flushing can reorder writes.
  `UNKNOWN — could not confirm from official docs that appendRow is buffered such that flush is
  required for correctness`; this is defensive.
- Because `clientTxnId` idempotency (`CLAUDE.md` §4.1, Part VII) requires a **check-then-append**,
  the lock is not optional — without it two retries of the same submission can both pass the check.
  🚩 **This is the correctness-critical use of `LockService` in this system.**

The **30 simultaneous executions** ceiling is per *owner* under `executeAs: USER_DEPLOYING`, so under
a script lock the gateway is effectively serialised anyway. At a few-admin load that is fine and is
in fact what makes the append-only log safe.

### 6.2 Authoritative server timestamp

Apps Script executes on Google's servers, so `new Date()` inside the gateway is **server time**, not
the client's clock — this is what `CLAUDE.md` §28 (Penyetelan Waktu = Otomatis) requires, and it is
strictly better than the Google Forms "Timestamp column" approach it replaces, because the gateway
can also compute the STOK AWAL/AKHIR snapshot in the same locked section.

Timezone is fixed by the manifest's `timeZone` field (a ZoneId such as `"America/Denver"`)
[[manifest]](https://developers.google.com/apps-script/manifest); set it to **`Asia/Jakarta`** for
WIB. `Session.getScriptTimeZone()` reads it back
[[Session]](https://developers.google.com/apps-script/reference/base/session).
Store the raw epoch millis in the sheet and format for display, so the 24-hour rule is
timezone-independent.

### 6.3 Sheets size limits

"Up to 10 million cells or 18,278 columns (column ZZZ)" per spreadsheet.
[[drive-limits]](https://support.google.com/drive/answer/37603)

At ~10 columns per transaction row (the HISTORI DATA schema in `CLAUDE.md` §30), 10M cells ≈ **1M
transaction rows** — far beyond masjid scale. The practical ceiling is **not** cells, it is the
6-minute execution limit while replaying a long log, which is what makes the Part-XV compaction
"when history grows" the correct trigger.

---

## 7. Secrets in `PropertiesService`

Script properties are "common to all users of the script" and Google's own example use is "app-wide
configuration data, like the username and password for the developer's external database."
[[properties]](https://developers.google.com/apps-script/guides/properties)

Limits: **9 KB per value, 500 KB per property store.**
[[quotas]](https://developers.google.com/apps-script/guides/services/quotas)
A Clerk secret key (~60 chars) and a pepper fit trivially.

**Who can read them.** `UNKNOWN — the official Apps Script documentation does not state who can read
script properties.` Google Workspace DevRel guidance says script properties "are still accessible to
anyone with edit access to the script", and recommends reserving them for "general configuration,
environment variables, and non-critical keys" while using **Google Cloud Secret Manager** for
"high-value secrets — like database passwords, API keys, or service account keys."
[[dev.to/googleworkspace]](https://dev.to/googleworkspace/secure-secrets-in-google-apps-script-1dhc)
The same post warns: "If you share your script or check it into source control, your secrets are
compromised."

**Verdict for this project.** Script Properties is **acceptable** for the Clerk secret key and the
PIN pepper here, because:
- the threat model is a single-owner consumer Google account with a very small editor set;
- properties are **not** exposed to the browser — they are only readable from server-side script
  execution, so an `ANYONE_ANONYMOUS` caller cannot read them;
- the alternative (Secret Manager) requires a GCP project and additional URL Fetch calls per read,
  which is disproportionate at this scale.

> 🚩 **Conditions.** (1) Keep the editor list on the script to the absolute minimum — **every editor
> can read every secret**. (2) Never commit secrets to the repo (§8). (3) If the Clerk secret key
> ever leaks it grants **full Backend API access to the whole Clerk instance** (read/modify all
> users) — rotate it in the Clerk dashboard immediately.

---

## 8. Deployment, versioning and git

### 8.1 Versions vs deployments

Apps Script distinguishes two things
[[deployments]](https://developers.google.com/apps-script/concepts/deployments):
- A **version** is "a static snapshot of your script project's code", immutable once created.
- A **deployment** is "a release that makes a specific version of your script available for users",
  with its own URL/ID.
- **Head deployments** "always sync with the most recently saved code" — good for testing, "unsuitable
  for public use". One per project.
- **Versioned deployments** are the recommended choice for public applications.

**To update without changing the URL:** create a new version, then edit the existing deployment to
point at it — this "updates the application for all users while maintaining the same URL or
deployment ID."
[[deployments]](https://developers.google.com/apps-script/concepts/deployments)
🚩 **Do not "New deployment" for updates** — that mints a new URL and the SPA's configured endpoint
goes stale. Always **"Manage deployments" → edit → new version**.

Note: "you cannot delete versioned deployments from your record of deployments"; they can be archived.
[[deployments]](https://developers.google.com/apps-script/concepts/deployments)

### 8.2 clasp

**clasp is alive and actively released.** Latest version **3.4.1**, published **2026-08-28**; not
deprecated. **[probe]** npm registry (`registry.npmjs.org/@google/clasp`). Recent cadence: 3.2.0
(Feb 2026), 3.3.0 (Mar 2026), 3.4.0 (Aug 2026), 3.4.1 (Aug 2026).

- Install: `npm install -g @google/clasp` [[clasp]](https://github.com/google/clasp)
- Auth: `clasp login` (OAuth; supports multiple accounts via `--user`, and custom credentials files)
  [[clasp]](https://github.com/google/clasp)
- Commands: `clasp push` / `clasp pull`, `clasp create-version`, `clasp create-deployment`,
  `clasp show-file-status` [[clasp]](https://github.com/google/clasp)
- **Not an official Google product**: the README carries the disclaimer "This is not an officially
  supported Google product." [[clasp]](https://github.com/google/clasp)

**v3 breaking changes to be aware of** [[clasp]](https://github.com/google/clasp):
- "Clasp no longer transpiles typescript code" — use an external bundler (Rollup) if you want TS.
- Commands were renamed (e.g. `open` → `open-script`, and the deployment/version commands above are
  the v3 names). Older tutorials use v2 names.

### 8.3 Git

**Yes — the script can live in a git repo.** clasp "enables local Apps Script development" with git
integration, and `.claspignore` works like `.gitignore` to exclude files from pushes.
[[clasp]](https://github.com/google/clasp)

Recommended layout for this project: keep `gateway/` in the existing repo alongside `domain/`, with
`.clasp.json` (contains the script id — not a secret, but not useful to others) and `appsscript.json`
committed, and **secrets only in Script Properties**, never in a committed file. Since the domain
reducer is pure TS (`CLAUDE.md` §6/§10), a bundler step can share `deriveState` between the SPA and
the gateway rather than reimplementing it — which is worth doing, because the gateway needs the same
fold to compute STOK AWAL/AKHIR snapshots (§6.1).

---

## 9. Blockers and security footguns — consolidated

| # | Item | Severity | Detail |
| --- | --- | --- | --- |
| 1 | **No RSA verification primitive in Apps Script** | 🚩 Blocker | Only RSA *signing* exists (§2.2), and V8 has no `crypto`/`SubtleCrypto`. Combined with #14 (no Clerk verify endpoint), RS256 session tokens cannot be validated without hand-rolled bignum maths. **This pair is what makes the HS256 template (§2.6) the recommended design.** |
| 2 | **The script cannot read request headers or cookies at all** | 🚩 Blocker (shapes the API) | The documented event object has no headers/cookies field (§1.1). Clerk's two documented transports — the `Authorization` header and the `__session` cookie (§2.1) — are **both** unusable. Token must move into the request body. CORS preflight (§1.5) independently forbids the header too. |
| 3 | **`Content-Type` must be `text/plain`** | ⚠️ Constraint | `application/json` triggers preflight → request fails (§1.5). Gateway `JSON.parse`s `e.postData.contents` manually. |
| 4 | **IDE label "Anyone" = manifest `ANYONE_ANONYMOUS`** | ⚠️ Footgun | Choosing manifest `ANYONE` yields a login page with HTTP 200, not a 401 — silent breakage (§1.2). |
| 5 | **No caller IP available** | 🚩 Weakens the load-bearing control | `CLAUDE.md` Part VII makes per-device rate-limiting "the load-bearing control". The event object exposes no client IP (§1.1), so the rate-limit key must come from the client and is **spoofable**. A determined attacker can rotate device ids and walk the 10,000-PIN space. **Recommend a global (all-devices) failed-attempt ceiling with admin alerting, in addition to the per-device one.** |
| 6 | **No bcrypt/scrypt/argon2/PBKDF2** | ⚠️ Accepted risk | 4-digit PIN + fast hash = enumerable if the hash leaks. Mitigated (not solved) by the HMAC pepper (§4.3). |
| 7 | **Secrets readable by every script editor** | ⚠️ Operational | Clerk secret key grants full Backend API access. Minimise editors (§7). |
| 8 | **Cache eviction resets lockout counters** | ⚠️ Footgun | Back the threshold with durable Properties (§5.2). |
| 9 | **`appendRow` has no documented atomicity** | ⚠️ Correctness | `clientTxnId` idempotency needs check-then-append under `LockService.getScriptLock()` (§6.1). |
| 10 | **`jsrsasign` is EOL (14 Aug 2026)** | ⚠️ Supply chain | No future CVE fixes for the obvious pure-JS crypto dependency (§2.3). |
| 11 | **JSONP would expose the private tier** | ⚠️ Do not use | Google's own warning (§1.6). |
| 12 | **New deployment ⇒ new URL** | ⚠️ Ops | Update the existing deployment with a new version instead (§8.1). |
| 13 | **`BigInt` availability unconfirmed** | ❓ Unknown | Blocks §2.5 option 2 until spiked (§10). |
| 14 | **No Clerk endpoint verifies a session JWT** | 🚩 Blocker (design-shaping) | `POST /v1/sessions/{id}/verify` is deprecated and absent from all specs ≥ 2025-04-10; `/v1/tokens/verify` never existed (§3.3c). The gateway must verify locally — which is why §2.6 (HS256 template) is the recommendation. |
| 15 | **Cannot look up a user by `private_metadata`** | 🚩 Constrains Model C | `GET /v1/users` has no metadata filter (§3.3e). The `pinHash → userId` map must live in the gateway's `PropertiesService`. Storing the hash in `external_id` to make it filterable would **publish** it — do not. |
| 16 | **Metadata write endpoint moved (API 2026-05-12)** | ⚠️ Will silently break | `private_metadata` is rejected on `PATCH /v1/users/{user_id}`; use `PATCH /v1/users/{user_id}/metadata` (§3.3d). Most tutorials show the old form. **Pin `Clerk-API-Version`** (§3.3a). |
| 17 | **HS256 template key is symmetric** | ⚠️ Accepted trade | Whoever holds it can *mint* tokens, not just verify them (§2.6). Comparable to already holding the Clerk secret key, but both are readable by every script editor (§7). |
| 18 | **60-second Clerk token TTL vs offline queue** | ⚠️ Design constraint | A queued write replays with a dead token; mint at flush time, not enqueue time (§2.1.1). |
| 19 | **JWT-template plan availability unconfirmed** | ❓ Unknown | Decides §2.5 option 1 vs 2. 2-minute Dashboard check — spike #5 (§10). |

---

## 10. Spikes to run before building (each < 30 min)

These close the remaining `UNKNOWN`s. They are cheap and each one de-risks a decision above.

1. **CORS round-trip.** Deploy a trivial `doPost` returning `ContentService` JSON as
   `ANYONE_ANONYMOUS` / `USER_DEPLOYING`. From a browser on a different origin, `fetch()` it with
   `Content-Type: text/plain;charset=utf-8` and read `await res.json()`. Then repeat with
   `application/json` and with an `Authorization` header to *confirm* both fail. **Closes §1.5.**
2. **`BigInt` availability.** `function t(){ Logger.log(String(2n ** 64n)); }` — run it. **Closes §2.3 / row 13.**
3. **HS256 template end-to-end.** Create the JWT template with a custom HS256 signing key, call
   `getToken({ template })` in the SPA, and verify it in Apps Script with
   `Utilities.computeHmacSignature`. **Confirms §2.6, the recommended design.** Do this one first —
   it is the load-bearing assumption.
4. **Lock + idempotency.** Fire 10 parallel `doPost`s with the same `clientTxnId` and confirm exactly
   one row lands. **Closes §6.1.**
5. **JWT-template plan check.** In the Clerk Dashboard, confirm JWT templates *and* the "Custom
   signing key" / HS256 option are available on the account's plan for a **production** instance,
   not just a development one. **Closes blocker #19; decides §2.5 option 1 vs 2.** Two minutes, and
   it should happen before any code is written.

---

## Sources

Every URL used in this document.

### Official Google / Apps Script
1. Web Apps guide — https://developers.google.com/apps-script/guides/web
2. Content Service guide — https://developers.google.com/apps-script/guides/content
3. Deployments concepts — https://developers.google.com/apps-script/concepts/deployments
4. Manifest reference — https://developers.google.com/apps-script/manifest
5. Manifest: webapp access / executeAs enums — https://developers.google.com/apps-script/manifest/web-app-api-executable
6. V8 runtime guide (unavailable APIs) — https://developers.google.com/apps-script/guides/v8-runtime
7. Quotas for Google Services — https://developers.google.com/apps-script/guides/services/quotas
8. Class Utilities — https://developers.google.com/apps-script/reference/utilities/utilities
9. Enum DigestAlgorithm — https://developers.google.com/apps-script/reference/utilities/digest-algorithm
10. Enum MacAlgorithm — https://developers.google.com/apps-script/reference/utilities/mac-algorithm
11. Class TextOutput — https://developers.google.com/apps-script/reference/content/text-output
12. LockService — https://developers.google.com/apps-script/reference/lock/lock-service
13. Class Lock — https://developers.google.com/apps-script/reference/lock/lock
14. CacheService — https://developers.google.com/apps-script/reference/cache/cache-service
15. Class Cache (limits) — https://developers.google.com/apps-script/reference/cache/cache
16. Properties Service guide — https://developers.google.com/apps-script/guides/properties
17. Class Session — https://developers.google.com/apps-script/reference/base/session
18. Sheet.appendRow — https://developers.google.com/apps-script/reference/spreadsheet/sheet#appendrowrowcontents
19. Class UrlFetchApp — https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app
20. Sheets API v4 values.append — https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append
21. Google Drive file size limits (Sheets 10M cells) — https://support.google.com/drive/answer/37603

### Official Clerk
22. Manual JWT verification — https://clerk.com/docs/guides/sessions/manual-jwt-verification
23. Session object / getToken (React) — https://clerk.com/docs/react/reference/objects/session.md
24. Session tokens (claims, 60 s expiry) — https://clerk.com/docs/guides/sessions/session-tokens
25. JWT templates — https://clerk.com/docs/guides/sessions/jwt-templates
26. System limits / rate limits — https://clerk.com/docs/guides/how-clerk-works/system-limits
27. API versioning — https://clerk.com/docs/guides/development/upgrading/versioning
28. Backend API reference (index) — https://clerk.com/docs/reference/backend-api
29. verifyToken() (networkless vs networked, clockSkewInMs) — https://clerk.com/docs/reference/backend/verify-token
30. verifySession() — deprecated — https://clerk.com/docs/reference/backend/sessions/verify-session
31. GET /v1/sessions/{session_id} — https://clerk.com/docs/reference/backend-api/tag/sessions/GET/sessions/{session_id}
32. GET /v1/users/{user_id} — https://clerk.com/docs/reference/backend-api/tag/users/GET/users/{user_id}
33. PATCH /v1/users/{user_id}/metadata — https://clerk.com/docs/reference/backend-api/tag/users/PATCH/users/{user_id}/metadata
34. GET /v1/users (query params) — https://clerk.com/docs/reference/backend-api/tag/users/GET/users
35. PATCH /v1/organizations/{organization_id}/metadata — https://clerk.com/docs/reference/backend-api/tag/organizations/PATCH/organizations/{organization_id}/metadata
36. Hasura integration (custom signing key / HS256) — https://clerk.com/docs/guides/development/integrations/databases/hasura
37. Pricing — https://clerk.com/pricing
38. clerk/openapi-specs (official OpenAPI source for the Backend/Frontend API) — https://github.com/clerk/openapi-specs

### Tooling / libraries
39. google/clasp — https://github.com/google/clasp
40. @google/clasp on npm — https://www.npmjs.com/package/@google/clasp (version data read from https://registry.npmjs.org/@google/clasp)
41. kjur/jsrsasign (end-of-support notice) — https://github.com/kjur/jsrsasign
42. fnya/jwt-for-google-apps-script (HS256 only) — https://github.com/fnya/jwt-for-google-apps-script
43. ITfiers/Apps-Script-Security-Util-Funcs — https://github.com/ITfiers/Apps-Script-Security-Util-Funcs

### Community / secondary (used only where Google publishes nothing, and labelled as such in text)
44. tanaikech, "Taking advantage of Web Apps with Google Apps Script" — https://github.com/tanaikech/taking-advantage-of-Web-Apps-with-google-apps-script/blob/master/README.md
45. Google Apps Script Community, "Cors issue with app script" — https://groups.google.com/g/google-apps-script-community/c/zJpevovcFLA
46. Google Apps Script Community, "BigInt appears to Fail in Apps Script New IDE debugger" — https://groups.google.com/g/google-apps-script-community/c/20SbvLNd-04
47. Lambda IITH, "Fixing CORS Errors in Google Apps Script" (cited as an example of the doOptions myth) — https://iith.dev/blog/app-script-cors/
48. Diya Vijay, "Struggling with CORS in Google Apps Script?" (text/plain workaround) — https://diyavijay.medium.com/struggling-with-cors-in-google-apps-script-heres-the-fix-e3eec09f07dd
49. Google Workspace DevRel, "Secure Secrets in Google Apps Script" — https://dev.to/googleworkspace/secure-secrets-in-google-apps-script-1dhc
50. supabase/supabase issue #44527 (Clerk JWKS endpoint forms) — https://github.com/supabase/supabase/issues/44527
51. GitbookIO/va-nextjs-clerk (Clerk JWT template: "Enable the Custom signing key and select the HS256 algorithm") — https://github.com/GitbookIO/va-nextjs-clerk

### Direct probes (this machine, 2026-09-06)
52. `curl -i -X OPTIONS https://script.google.com/macros/s/<invalid>/exec` → HTTP 404, no `Access-Control-Allow-*` headers.
53. `curl https://api.clerk.com/v1/jwks` (no auth) → HTTP 401 `authorization_header_format_invalid`, message: "Must be 'Bearer <YOUR_API_KEY>'".
54. `https://registry.npmjs.org/@google/clasp` → latest `3.4.1`, published 2026-08-28, not deprecated.

---

## Open items

- The `UNKNOWN` markers in this document are, in full:
  - CORS headers emitted by a **valid** `ANYONE_ANONYMOUS` deployment (§1.5) — spike #1.
  - `BigInt` availability in the Apps Script V8 runtime (§2.3) — spike #2.
  - Atomicity/concurrency guarantees for `Sheet.appendRow` (§6.1) and Sheets `values.append` (§6.1).
  - Whether `SpreadsheetApp.flush()` is required for `appendRow` correctness (§6.1).
  - Max key length for `PropertiesService` (§5.1).
  - Max `LockService` timeout / hold duration (§5.3).
  - Officially-documented read access to Script Properties (§7).
  - Algorithms supported by `ITfiers/Apps-Script-Security-Util-Funcs` (§2.3).
  - Whether JWT templates / custom HS256 signing keys require a paid Clerk plan (§2.6) — spike #5.
  - Which default claims a **custom** Clerk JWT template emits vs the default session token (§2.6).
  - Clerk's default API version when none is pinned (§3.3a).
  - Runtime behaviour of `POST /v1/sessions/{id}/verify` on a pinned legacy version (§3.3c).
- None of these blocks starting; spikes #1–#5 in §10 close the ones that matter. **Spikes #5 then #3
  should run before any other work** — together they confirm or refute the recommended
  verification design.
