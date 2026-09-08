# gateway/ — the Apps Script gateway

The one component that holds secrets, and the only thing that writes to `Transactions`.
Google-hosted, free, no infrastructure you operate.

**Status: written and reviewable, not yet deployed.** The marbot hot path (device + PIN +
append) needs only Apps Script and no Clerk at all. The Clerk half is now written too —
JWT Templates turned out to be on the free plan (2026-09-07), so `verifyClerk` verifies a
custom **HS256** token natively with `Utilities.computeHmacSha256Signature`.

> **`auth.gs` has tests.** `cd gateway && npx vitest run` loads it as source with `Utilities`
> and `PropertiesService` stubbed, and checks it against tokens built by Node's own crypto:
> wrong key, `alg: none`, an RS256 token, a tampered signature, an edited payload, an expired
> token, a foreign issuer, and an unconfigured gateway. This is the one file where "looks
> right" is not good enough, and none of it can be exercised by deploying and clicking.

## Files

### Five go into Apps Script — four `.gs` and one manifest

| | |
| --- | --- |
| `Code.gs` | `doGet`/`doPost` router, sessions, and the append endpoint |
| `auth.gs` | PIN hashing, device verification, per-device lockout, Clerk HS256 verification |
| `sheets.gs` | reads the tabs, appends rows, and splits the public/detailed read tiers |
| `setup.gs` | **run these from the editor** — one-time setup, enrol a device, set a PIN |
| `appsscript.json` | the manifest — **not** a `.gs`, and easy to miss |

`appsscript.json` is hidden until you turn it on: **Project Settings → tick "Show
appsscript.json manifest file in editor"**. It is worth the extra click, because it carries
`"access": "ANYONE_ANONYMOUS"` — the setting the deployment trap below is about.

### These stay in the repo

| | |
| --- | --- |
| `test/clerk.test.ts` | runs `auth.gs` against forged tokens — `cd gateway && npx vitest run` |
| `package.json` | so that command works |
| `README.md` | this file |

## Deploying with clasp — two commands, and the reason it exists

Pasting five files into a browser tab and then choosing the right item in a Version dropdown
took three rounds to land one one-line fix. Twice the code looked correct in the editor and the
old code was still being served, because **saving a file does not change what `/exec` serves** —
the URL is bound to a deployment VERSION, and creating one is a separate act that is easy to
skip without noticing.

```bash
cd gateway
npm install                        # installs clasp locally
npx @google/clasp login            # once, opens a browser
npm run ship                       # tests, then push, then redeploy the SAME deployment id
```

> `npx clasp` does **not** work: the package is `@google/clasp`, and bare `clasp` resolves to a
> different package entirely — npm reports "could not determine executable to run", which reads
> like a broken install rather than a wrong name. After `npm install` the npm scripts find the
> local binary, so only the login needs the long form.

`npm run deploy` passes `-i <deploymentId>`, so it updates the deployment already in use rather
than making a new one. That matters more than convenience: a new deployment means a new URL, and
the URL is baked into every printed QR code. The id is in `package.json`; `.clasp.json` carries
the script id, and `.claspignore` keeps the vitest suite from being uploaded to Apps Script.

**After any deploy, check what is actually live:**

```bash
curl -sL "<your /exec url>?op=ping"
```

It returns `GATEWAY_VERSION`. Bump that constant with every change — a version string nobody can
read is a version string nobody can check, which is exactly how two rounds went into verifying a
fix that was never deployed.

## Deploying by hand — 15 minutes

1. Open your spreadsheet → **Extensions → Apps Script**. A *bound* script reaches the sheet
   with no extra authorisation.
2. Create the four `.gs` files above and paste each one in, keeping the same names so the split
   stays readable. Then tick *"Show appsscript.json"* in **Project Settings** and paste the
   manifest over what is there.
3. **Run `setupGateway()`** once — toolbar dropdown → Run. It mints the PIN pepper. Approve the
   permission prompt.
4. **Run `checkSpreadsheet()`** — it verifies every tab exists and that the `Transactions` header
   matches column-for-column. Fix anything it reports before going further.
5. **Edit and run `enrollDevice()`** — set `LABEL` first. It prints a device secret **once**.
   Copy it into the tablet; it is never shown again.
6. **Edit and run `setUserPin()`** — set `NAME`, `ROLE`, `PIN`. Repeat per person. It refuses a
   PIN that is already taken.
7. **Deploy → New deployment → Web app**, with exactly:
   - **Execute as:** *Me*
   - **Who has access:** *Anyone*
8. Copy the `/exec` URL. That is the gateway address the app needs.

> ⚠️ **The access setting is a silent-failure trap.** The editor's "Anyone" is manifest
> `ANYONE_ANONYMOUS`, which is correct. The manifest value `ANYONE` means *logged-in Google
> users* and serves a **Google login page with HTTP 200** — the app then parses HTML as JSON,
> and the bug looks like ours.

> ⚠️ **Re-deploy after every code change.** Apps Script serves the last *deployed* version, not
> the saved one. Use **Deploy → Manage deployments → Edit → Version: New version** to keep the
> same URL.

## The API

Everything is a CORS **simple request**: `GET`, or `POST` with `Content-Type: text/plain`
carrying a JSON string. No custom headers — Apps Script cannot read or set them, so tokens
travel in the body. Every response is `{ ok: true, ... }` or `{ ok: false, error: "..." }`.

```
GET  ?op=ping                        → { ok, now, version }
GET  ?op=state                       → PII-free: catalog + log with no names
GET  ?op=stateDetailed&session=...   → adds recipient + actorUserId

POST { op: "openSession", deviceSecret, pin }
     → { ok, session: { token, actorUserId, actorName, role } }
     → { ok: false, error: "invalid_pin" | "locked" | "device_not_enrolled", retryAfterMs }

POST { op: "append", session, entries: [ { clientTxnId, type, itemId?, assetId?, qtyDelta,
                                           recipient?, condition?, note?, toStatus? } ] }
     → { ok, appended: [...], duplicates: [...] }

POST { op: "closeSession", session }
```

## Design rules that are not negotiable

- **The server timestamp is authoritative.** Never the device clock — the 24-jam rule and the
  whole ordering of the log depend on it, and a tablet with a wrong clock would corrupt both
  silently.
- **Append only.** No endpoint updates or deletes a row. Corrections are `reversal` rows.
- **`clientTxnId` is checked under a `LockService` lock.** Neither `appendRow` nor the Sheets
  API documents atomicity, and idempotency is a check-then-append.
- **The PIN hash is keyed, not plain.** HMAC-SHA256 with a per-user salt and a secret pepper,
  because a plain hash of a 4-digit PIN is all 10,000 of them enumerated in microseconds.
- **Device enrolment is required.** `doPost` sees no IP and no headers, so a device id the
  browser invents is worthless — an attacker would rotate it and walk the whole PIN keyspace.
  A secret the gateway issued is what makes lockout real, and what lets a lost tablet be
  revoked by deleting one row.
- **An unknown PIN and a wrong PIN return the same error.** Distinguishing them would let
  someone enumerate which codes exist.
- **The gateway does not compute stock.** The pure reducer does, identically on every client.
  A server that also computed it would be a second source of truth.

## Not built yet

- **Admin endpoints** (catalog edits, roster management from the UI) — need Clerk session
  verification, blocked on JWT Templates.
- **Low-stock push** (email/WhatsApp to admin) — a trigger reading the same derived projection.
- **Log compaction** — only when history grows enough to matter.
