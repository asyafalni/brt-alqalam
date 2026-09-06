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
own"*. Everything below is about turning that into a shared, live system.

---

## Stage 1 — Google Spreadsheet 📋 *(~10 minutes)*

**Create one spreadsheet** named e.g. `BRT Inventaris — Masjid Al-Qalam`, with **four tabs**
named exactly:

| Tab | Written by |
| --- | --- |
| `Categories` | you, by hand |
| `Items` | you + the stock-take export |
| `AssetInstances` | you / the label tool (only for individually-labelled durables) |
| `Transactions` | **the gateway only — never edit or delete a row** |

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
2. **⚠️ THE ONE BLOCKING CHECK — JWT Templates.**
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
3. **Create the three roles**: `admin_utama` (permanent, undeletable — your boss), `admin`,
   `anggota`. Admins sign in with a password; **anggota never sign in** — they use a PIN at the
   kiosk.
4. **Create the users.** Each marbot gets a Clerk user record even though they never log in —
   it is where their name and `privateMetadata.pinHash` live.

**What I need:** the **publishable key** (`pk_...`) and your Clerk **instance/frontend API URL**.
**Keep the secret key (`sk_...`) to yourself** — it goes straight into Apps Script Script
Properties in Stage 3. Clerk's free tier (10,000 MAU) is far beyond what this needs.

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
   | `CLERK_JWT_KEY` | the HS256 signing key from the JWT template |
   | `PIN_PEPPER` | a long random string you generate once and never share |
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

## Checklist

- [ ] **Stage 0** — run `cd app && npm run dev`, walk the gudang *(nothing to prepare)*
- [ ] **Stage 1** — create the spreadsheet, import the four tabs from `sheets/`, **don't publish**
- [ ] **Stage 1** — send me the spreadsheet ID
- [ ] **Stage 2** — ⚠️ **check Clerk → Configure → JWT Templates** *(blocks the gateway)*
- [ ] **Stage 2** — create the app, the three roles, and the user records
- [ ] **Stage 2** — send me the publishable key (`pk_...`); keep `sk_...` for Stage 3
- [ ] **Stage 3** — create the bound Apps Script, set the three Script Properties
- [ ] **Stage 3** — deploy as *Execute as: Me* + *Who has access: Anyone*, send me the URL
- [ ] **Stage 4** — decide which device is the kiosk, and where it physically lives
- [ ] ~~Google Form~~ — **not now**, deliberately

## And three things that aren't configuration
These change the design more than any setting (`OPEN-QUESTIONS.md`):
1. **Watch the marbot for an hour.** How many, own phone or shared tablet, comfort with apps,
   reading fluency. Every UI assumption rests on this.
2. **Ask the boss for two real "it went missing" stories.** Settles whether loan tracking is the
   fix for his top pain, or whether things are simply lost in the mess.
3. **Ask whether he's attached to the specifics** — *these* 16 categories, *these* 5 keterangan —
   or just wants inventory tracked. Two decisions in Part XVI change things he wrote.
