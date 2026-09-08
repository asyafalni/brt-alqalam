# What you need to prepare

A practical checklist of the accounts and configuration only you can create. Ordered by when
it's actually needed — **nothing in Stage 1 or later blocks you from using the app today.**

> 🔐 **Never paste a secret key into chat, a commit, or a Sheet.** Clerk's *secret* key and the
> gateway's pepper belong in Apps Script **Script Properties** only. The *publishable* key
> (`pk_...`) is safe in the client bundle — that is what it is for.

---

## Stage 0 — Nothing. Use it now. ✅

The stock-take screen runs standalone and stores to the device.

```bash
cd app && npm install && npm run dev     # http://localhost:5173
```

Walk the gudang, add what you find, **Ekspor CSV**. That already answers *"nobody knows what we
own"*. Tap **Muat contoh data** on an empty stock-take to see the whole thing populated first.
Everything below is about turning that into a shared, live system.

### ⚠️ Stage 0b — the camera needs HTTPS. Read this before testing on a phone.

> ✅ **Settled 2026-09-07.** The app is live at **https://brt-alqalam.fly.dev**, and the whole
> scan path was run on a real phone against it: the camera opened, a QR shown on a laptop screen
> decoded, the deep link resolved, and both an *Ambil* and a *peminjaman* were recorded. This was
> the last part of the design that had only ever run in tests.

`npm run dev -- --host` prints a LAN address like `http://192.168.18.32:5173`. Every screen works
there **except the scanner**: browsers refuse `getUserMedia` outside a *secure context*, so on
plain `http://` over the LAN the camera will not open. The app detects this and says
*"Kamera butuh HTTPS"* rather than looking broken — but it still cannot scan.

Three ways round it, cheapest first:

1. **Test the scanner on the deployed HTTPS URL** (Stage 5). Simplest, and it is the environment
   the marbot will actually use.
2. **Run the dev server over HTTPS**: `npm i -D @vitejs/plugin-basic-ssl`, add it to
   `vite.config.ts`, then `npm run dev -- --host`. The phone will warn about the self-signed
   certificate; accept it once.
3. **Chrome flag on an Android test device**: `chrome://flags` →
   *"Insecure origins treated as secure"* → add `http://192.168.18.32:5173`. Test-only; never
   ask a marbot to do this.

Everything else — opname, racks, labels, stock, cycle counts — works fine over plain LAN http.

---

## Stage 1 — Google Spreadsheet 📋 *(~10 minutes)*

**Create one spreadsheet** named e.g. `BRT Inventaris — Masjid Al-Qalam`, with **seven tabs**
named exactly:

| Tab | Written by |
| --- | --- |
| `Categories` | you, by hand |
| `Locations` | you + the stock-take export — the racks |
| `Items` | you + the stock-take export — the catalog, **with no quantities on it** |
| `Stock` | the stock-take export — one row per (barang × rak). **This is where quantity lives** |
| `AssetInstances` | you / the label tool (only for individually-labelled durables) |
| `Requests` | the Pengajuan screen |
| `Transactions` | **the gateway only — never edit or delete a row** |

> **It was four tabs when this was written, and that is the point.** `Stock` arrived with
> per-rack quantities (Part XXI) and `Requests` with Pengajuan (Part XXIII). A sheet imported
> from the old list has a catalog with no quantities anywhere — which renders as an empty
> masjid, not as a missing tab. `checkSpreadsheet()` now checks all seven, column for column.

**Import, don't type.** Headers must match `data/parse.ts` exactly; one typo quarantines every
row. For each file in `sheets/`:

> **File → Import → Upload → `sheets/<Name>.csv` → Insert new sheet(s)**, then rename the new tab
> to match the filename. Repeat for all four.

`Categories.csv` is pre-seeded with the eight domains. The other files carry a few example rows
showing accepted formats — **delete them once real data lands**. `sheets/README.md` documents
every column's accepted values.

### ⚠️ Do NOT publish this sheet to the web
It holds `recipient` and `actorUserId` — real people's names. Publishing makes it world-readable
at its URL (design doc §12.4). The public dashboard will read a **separate PII-free projection**
the gateway maintains: stock levels, low-stock, and status *counts* only.

**What I need from you afterwards:** the **spreadsheet ID** — the long string in the URL between
`/d/` and `/edit`. Safe to share; it is not a credential.

---

## Stage 2 — Clerk 🔑 *(~15 minutes — you already have an account)*

1. **Create an application** (e.g. `BRT Inventaris`). Email + password sign-in is enough; only
   admins ever sign in.
2. **✅ RESOLVED 2026-09-07 — JWT Templates are on the free plan.** "New template" is clickable
   on **Hobby**, so the HS256 path below is the one we take and nothing needs redesigning.
   *(Original wording kept, because it explains why this mattered.)*

   **⚠️ THE ONE BLOCKING CHECK — JWT Templates.**
   Go to **Configure → JWT Templates** and see whether **"New template"** is available or shows
   an upgrade prompt.
   - **Available** → create a template with a **custom HS256 signing key**. This is the only way
     the gateway can verify Clerk: Apps Script has **no RSA verification primitive**, and Clerk
     no longer has any endpoint that verifies a session JWT (`/v1/sessions/{id}/verify` is
     deprecated and absent from every spec ≥ 2025-04-10). See §65.3.
   - **Paid only** → **tell me**, and we redesign admin auth. The honest fallback is a second
     Apps Script deployment using Google account sign-in (free, `Session.getActiveUser()` gives a
     verified email), keeping Clerk as the user/PIN store only. That bends the "Clerk for auth"
     constraint, so it would be your call.
> **Identifiers: enable Email AND Username.** Admins sign in with email — that is how Clerk
> sends invites and resets. Marbot never sign in at all; their record exists only to hold a name
> and `privateMetadata.pinHash`. But Clerk cannot create a user with *no* identifier, so without
> usernames every marbot would need an invented email address — fake data inside the identity
> store, which always comes due later. With both enabled Clerk asks for **one**, not both.

3. **Create the three roles**: `admin_utama` (permanent, undeletable — your boss), `admin`,
   `anggota`. Admins sign in with a password; **anggota never sign in** — they use a PIN at the
   kiosk.

   **Where the role lives, and what the template must send.** The gateway does not ask Clerk who
   you are — it reads the token it just verified. So the role has to be *in* the token, and that
   is a template setting nobody would guess:

   - Put the role on each user at **Users → (user) → Metadata → Public metadata**:
     ```json
     { "role": "admin" }
     ```
   - Then make the `gateway` JWT template emit it, alongside a display name:
     ```json
     { "role": "{{user.public_metadata.role}}", "name": "{{user.full_name}}" }
     ```
     (`sub` — the user id — Clerk always includes; the gateway reads that for `actorUserId`.)

   **`public_metadata` is correct here, and it is NOT a contradiction of the PIN rule.** §31 bans
   `publicMetadata` for the **pinHash**, because a hash the browser can read is a hash an attacker
   can grind offline against 10⁴ possibilities. A **role** is not a secret: the browser may read
   it and may even lie about it, because the only copy that decides anything is the one inside a
   token signed with a key the browser has never seen. The pinHash stays in `privateMetadata`.

   **The symptom if you skip this:** sign-in works, the Admin screen says your token is valid,
   and the role shows as empty — which looks exactly like "you are not an admin". The screen says
   which of the two it is, because from the app they are otherwise identical.
4. **Create Clerk users ONLY for the people who sign in** — you, and your boss. That is admins.

   > ⚠️ **CORRECTED 2026-09-08.** This step used to read *"each marbot gets a Clerk user record …
   > it is where their name and `privateMetadata.pinHash` live."* **That is not how it was built.**
   > §65.4 had already found that Clerk cannot look a user up by `private_metadata`, so the
   > `pinHash → userId` map had to live in the gateway's own store — and it does. Verified in the
   > code: `resolvePin()` reads `PropertiesService`, and **the gateway contains no `UrlFetchApp`
   > call at all**, so it never talks to Clerk's API under any circumstance.
   >
   > **Consequences, both in your favour:**
   > - **Marbot need no Clerk record.** Their name, role and PIN hash are created by
   >   `setUserPin()` in the Apps Script editor and live only in Script Properties.
   > - **The Clerk secret key `sk_...` is never needed anywhere.** Do not paste it into Script
   >   Properties, or anywhere else. Nothing reads it.

**What I need:** the **publishable key** (`pk_...`) and your Clerk **instance/frontend API URL**.
**Keep the secret key (`sk_...`) to yourself — and note it is never used at all** (see the
correction above; the gateway makes no calls to Clerk's API). The gateway needs exactly seven
Script Properties, and no Clerk secret key is among them: `CLERK_JWT_KEY`, `CLERK_ISSUER`,
`SPREADSHEET_ID`, `PIN_PEPPER`, `USERS`, `DEVICES`, `CATALOG_REV`. Clerk's free tier
(10,000 MAU) is far beyond what this needs.

### PINs — how they actually work
Each person gets one 4-digit PIN that both identifies and verifies them (Model C). The PIN is
**never stored anywhere in plaintext, and never in the Sheet**: the gateway stores
**HMAC-SHA256(PIN, per-user salt) keyed with a secret pepper**, because Apps Script has no
bcrypt/argon2. PINs must be **globally unique** — the PIN alone resolves who you are.

---

## Stage 3 — Apps Script gateway ⚙️ *(I write the code; you deploy it)*

The gateway is the **only** thing that writes to `Transactions`, and the only place a PIN or a
Clerk session is verified. It is free on a consumer Google account (20,000 UrlFetch/day, 90 min
trigger runtime/day, 6 min per execution).

1. **Extensions → Apps Script** from inside the spreadsheet (a bound script — it gets access to
   the sheet without extra auth).
2. **Project Settings → Script Properties** — add these. This is the only place secrets live:
   | Key | Value |
   | --- | --- |
   | `CLERK_SECRET_KEY` | your `sk_...` |
   | `CLERK_JWT_KEY` | the HS256 signing key **you generated** and pasted into the template |
   | `CLERK_ISSUER` | `https://gentle-wallaby-8648.clerk.accounts.dev` |
   | `PIN_PEPPER` | generated for you by `setupGateway()` — do not set this by hand |
   | `SPREADSHEET_ID` | only if the script is **not** bound to the sheet |

   > Clerk does not generate the signing key: the "Custom signing key" toggle exists for the
   > case where a third party already has one, and here that third party is this gateway. Make
   > it yourself (`openssl rand -base64 48`) and paste the same value into both places.
3. **Deploy → New deployment → Web app**, with **exactly**:
   - **Execute as:** *Me*
   - **Who has access:** *Anyone*

   > ⚠️ **Naming trap that fails silently.** The IDE's "Anyone" is manifest `ANYONE_ANONYMOUS`
   > (correct). The manifest value `ANYONE` means *logged-in Google users* and returns a Google
   > login page with **HTTP 200** — the app sees a success response full of HTML and breaks in a
   > way that looks like a bug in our code.

4. Give me the **deployment URL** (`https://script.google.com/macros/s/.../exec`). Not a secret —
   it is public by design, which is exactly why Stage 4 exists.

### Why the browser can talk to it at all
Apps Script web apps only accept **CORS "simple requests"**: `Content-Type: text/plain`, **no
custom headers**, GET/POST only. There is no `doOptions` and `TextOutput` cannot set headers, so
the commonly-blogged CORS fix is *impossible*, not merely discouraged. Auth tokens therefore
travel in the request **body**, not an `Authorization` header.

---

## Stage 4 — Device enrolment 📱 *(required for the PIN to mean anything)*

`doPost` sees **no request headers, no cookies, and no client IP**. So per-IP rate limiting is
impossible, and a device id the browser invents is worthless — an attacker would rotate it and
walk all 10,000 PINs.

So: an admin **enrols each kiosk once** (signed in with Clerk), and the gateway issues a long
random **device secret** the tablet stores. Every PIN attempt carries it.

- Lockout becomes per **enrolled** device and survives someone clearing storage.
- Anyone without an enrolled secret cannot reach the PIN endpoint at all.
- A lost or stolen tablet is **revoked** by deleting one row.

**What you prepare:** decide which physical devices are kiosks. For 1–3 marbot that is probably
one wall-mounted tablet in the gudang.

> 📍 **The risk no software can fix:** if a marbot has to walk across the gudang to a tablet and
> type a PIN to take a bar of soap, they will simply take the soap. Where the tablet lives
> matters more than anything in this repo.

---

## Stage 5 — Deploy, before you print a single label 🚀 ✅ *(done)*

> **Live at https://brt-alqalam.fly.dev** (Fly.io, `sin`). `Dockerfile` + `fly.toml` are in the
> repo root — the build context must be the ROOT, since the UI compiles `domain/` and `data/`
> into its bundle, and the build stage must be Debian, since Octane's native addon is glibc-only.
> Redeploy with `fly deploy --remote-only`.
>
> Nothing below needs doing again; it is kept because it explains *why* the deploy looks the way
> it does.

The QR codes encode **deep links** — `https://<your-app>/#/scan?i=ITM-0001` — so the app must be
online at a stable address *before* labels are printed. The label screen refuses to print against
`localhost` for exactly this reason: a sticker outlives the laptop that made it.

1. **Build:** `cd app && npm run build` → static files in `app/dist/`.
2. **Host it** on Vercel or Cloudflare Pages (both free for this). Point the project at `app/`,
   build command `npm run build`, output directory `dist`.
3. **No server config needed.** The app uses **hash routing** (`/#/scan?...`), the same as
   SmartInv's `HashRouter`. A hash never reaches the server, so any static host serves it
   correctly with zero rewrites — and there is no way to end up with a gudang full of stickers
   pointing at 404s because a fallback rule was missed.
4. **Put the deployed address into the label screen's "Alamat aplikasi" field** before printing.
   It is baked into every QR. Test one: open `https://<your-app>/#/scan?i=ITM-0001` on a phone.

---

## Google Forms — do NOT create one ❌

You asked about this, so here is the reasoning rather than just "no".

**Firing a Form submission is genuinely easy** — one `fetch` to `formResponse`, no auth, no CORS
setup. But a browser POST there must use `mode: "no-cors"`, which returns an **opaque response**:
no status, no body, no error. **The app could never truthfully tell a marbot "tersimpan"** — only
"sent, probably". No confirmation, no duplicate detection, no server timestamp, no way to surface
"barang tidak dikenal". And the `entry.NNNN` field ids must be reverse-engineered from the form's
HTML and change silently if anyone edits it.

On top of that, a Form endpoint is public and verifies nothing, so anyone with the URL could
append rows as anyone — which contradicts the requirement that the system be locked.

**When a Form does come back:** as the Phase-3 offline/bulk-drop fallback, where fire-and-forget
is exactly the right semantic because a local queue already holds the truth. Not before.

---

## What I need from you (in priority order)

Nothing below blocks Stage 0 — the app is usable today. These unblock *me*.

| # | What | Why it blocks me | Effort |
| --- | --- | --- | --- |
| 1 | **Clerk → Configure → JWT Templates**: available on your plan, or upgrade-gated? | Apps Script has no RSA verify and Clerk no longer has a session-verify endpoint, so an HS256 template is the only way the gateway can check a login (§65.3). If it is paid, I redesign admin auth. | 2 min |
| 2 | **Create the spreadsheet** and send me its ID | Nothing can read or write until it exists. Import the five tabs from `sheets/`. | 10 min |
| 3 | **Deploy to Vercel/Cloudflare** and send me the URL | The scanner needs HTTPS, and printed labels need a stable address baked into every QR. | 20 min |
| 4 | **Your gudang's real layout** — one room or several zones, roughly how many shelves | The rack board groups by whatever zone you type. I would rather build against the real shape than a guess. | a photo |
| 5 | **Watch the marbot for an hour** (`docs/OBSERVE-MARBOT.md`) | Every UI assumption rests on this. It is the one thing that can invalidate work already done. | 1 hour |
| 6 | **Two real "it went missing" stories** from the boss | Settles whether loan tracking is the fix for his top pain, or whether things are simply lost in the mess. | a conversation |

## Decisions still waiting on you

- **Q33 — dark board?** Arche is dark; the kiosk probably should not be, since dark screens are
  worse in sunlight. Proposed: light kiosk, and a dark option for the desktop board only.
- **Q34 — zones.** Covered by #4 above.

## Checklist

- [x] **Stage 0** — run `cd app && npm run dev`, walk the gudang *(nothing to prepare)*
- [x] **Stage 1** — spreadsheet created, all seven tabs imported, **not published**
- [x] **Stage 1** — `checkSpreadsheet()` green: 7/7 tabs, every header matching column for column
- [x] **Stage 3** — the four `.gs` files and the manifest pasted in; `setupGateway()` run
- [x] **Stage 2** — ~~check Clerk → Configure → JWT Templates~~ **available on the free plan**
- [x] **Stage 2** — app created, **Email + Username** both enabled *(a marbot may have no email,
      and Clerk cannot create a user with no identifier at all — see below)*
- [x] **Stage 2** — JWT template `gateway`, custom **HS256** signing key, claims `uid`/`role`/`name`
- [x] **Stage 2** — publishable key collected → `app/src/data/clerk.ts` *(committed; it is base64
      of the instance domain, not a credential)*
- [ ] **Stage 2** — create a Clerk user for **yourself**, set Public metadata `{"role":
      "admin_utama"}`, and sign in at `#/admin` *(marbot need no Clerk record — see step 4)*
- [ ] **Stage 2** — `setUserPin()` in the Apps Script editor, once per marbot
- [x] **Stage 1** — ~~send me the spreadsheet ID~~ *(given: recorded below)*
- [x] **Stage 1** — spreadsheet ID: `1-qc4klyhOUvaNDmYgKcA-TgwOlpgCD7CG9AI4RQ9cz0`
      *(not a credential — the sheet's own sharing settings are what protect it)*
- [x] **Stage 3** — bound Apps Script created, deployed, `CLERK_JWT_KEY` confirmed present
      *(a token signed with a wrong key is rejected as `bad-signature`, which only happens after
      the key check — so the key is set, proven without anybody revealing it)*
- [ ] **Stage 3** — deploy as *Execute as: Me* + *Who has access: Anyone*, send me the URL
- [ ] **Stage 4** — decide which device is the kiosk, and where it physically lives
- [x] **Stage 5** — deployed to **Fly.io**: https://brt-alqalam.fly.dev *(hash routing, so no
      rewrite rules were needed)*
- [x] **Stage 5** — "Alamat aplikasi" defaults to `location.origin`, so opening the label screen
      **on the deployed site** already points every QR at the right place
- [x] **Stage 0b** — scanner verified on a real phone over HTTPS
- [ ] ~~Google Form~~ — **not now**, deliberately

## And three things that aren't configuration
These change the design more than any setting (`OPEN-QUESTIONS.md`):
1. **Watch the marbot for an hour.** How many, own phone or shared tablet, comfort with apps,
   reading fluency. Every UI assumption rests on this.
2. **Ask the boss for two real "it went missing" stories.** Settles whether loan tracking is the
   fix for his top pain, or whether things are simply lost in the mess.
3. **Ask whether he's attached to the specifics** — *these* 16 categories, *these* 5 keterangan —
   or just wants inventory tracked. Two decisions in Part XVI change things he wrote.
