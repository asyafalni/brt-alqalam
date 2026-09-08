// The Apps Script gateway, as a data adapter.
//
// Written from a deployment that was actually driven, not from the design — and the two differ
// in ways no amount of reading would have shown:
//
//   * the router keys on `op`, not `action`;
//   * requests must be CORS "simple": `text/plain`, no custom headers, no preflight. Apps Script
//     has no `doOptions` and `TextOutput` cannot set headers at all, so a bearer token has to
//     travel in the BODY. This is not a preference that can be revisited later;
//   * every reply is HTTP 200. Failure is `{ ok: false, error }` in the body, so status codes
//     say nothing and must not be branched on;
//   * once in roughly twenty-five POSTs, a reply came back shaped like a GET — the whole public
//     state instead of an append result. It could not be reproduced across twelve further
//     attempts, so no claim is made about why. `append` therefore treats a reply with no
//     `appended` array as a failure rather than a success, and the caller may retry: the
//     gateway's `clientTxnId` de-duplication is proven, so a retry cannot double-count.
//
// Rows arrive as objects of strings — the same shape `parseRecords` already takes — so they go
// through the SAME builders as the CSV path. One definition of what a valid row is, one
// quarantine, whichever door the data came in by.

import { parseRecords } from './parse';
import type { ParseIssue } from './parse';
import {
  buildCategory, buildInstance, buildItem, buildLocation, buildPublicTxn, buildRequest,
  buildStockLine, buildTxn,
} from './parse';
import type {
  AssetInstance, Category, Item, Location, StockLine, Txn,
} from '../domain/types';
import type { PurchaseRequest } from '../domain/requests';

export interface GatewayState {
  categories: Category[];
  locations: Location[];
  items: Item[];
  stock: StockLine[];
  instances: AssetInstance[];
  /** Only ever present on the detailed tier — it names people (§39). */
  requests: PurchaseRequest[];
  txns: Txn[];
  /** The gateway's own clock. Used in preference to the device's, which may be wrong. */
  serverTs: number;
  tier: 'public' | 'detailed';
  /**
   * The catalog's revision when this state was read.
   *
   * Sent back with any admin write so the gateway can refuse a save built on a catalog somebody
   * else has already changed. Zero on a gateway that predates it, which reads as "never edited"
   * and is the safe interpretation: the first write then sets the counter honestly.
   */
  rev: number;
  /** Rows the sheet holds but the model rejects. Surfaced, never silently dropped. */
  quarantined: { tab: string; issues: ParseIssue[] }[];
}

export interface Session {
  token: string;
  actorUserId: string;
  actorName: string;
  role: string;
}

export interface AppendEntry {
  clientTxnId: string;
  type: string;
  itemId?: string;
  assetId?: string;
  locationId?: string;
  qtyDelta: number;
  recipient?: string;
  condition?: string;
  note?: string;
  toStatus?: string;
  reversesTxnId?: string;
}

export class GatewayError extends Error {
  constructor(readonly code: string, readonly detail?: unknown) {
    super(code);
    this.name = 'GatewayError';
  }

  /**
   * What the gateway said beyond the code, when it said anything.
   *
   * `server_error` is a catch-all wrapping a real exception, and the gateway already sends the
   * exception's message — the client was discarding it. A roster call failed with nothing but
   * "server_error" while the reply named the exact undefined function. The code stays matchable;
   * this is for showing.
   */
  get hint(): string {
    const d = this.detail as { message?: unknown } | undefined;
    return typeof d?.message === 'string' ? d.message : '';
  }
}

/** Keys arrive as `itemId`; every builder reads `itemid`. Lowercased once, here. */
const lower = (rows: readonly Record<string, unknown>[]): Record<string, string>[] =>
  rows.map((row) => {
    const out: Record<string, string> = {};
    for (const key of Object.keys(row)) {
      const v = row[key];
      out[key.toLowerCase()] = v == null ? '' : String(v);
    }
    return out;
  });

/**
 * One POST, in the only shape Apps Script accepts from a browser.
 *
 * `redirect: 'follow'` is the default and is required: `/exec` answers with a 302 to
 * googleusercontent.com, and refusing to follow it means never reaching the script at all.
 */
async function call(
  url: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      // NOT application/json: that makes it a preflighted request, and there is nothing on the
      // other side able to answer a preflight.
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    // The offline case, and the one the gudang will actually meet.
    throw new GatewayError('offline', err);
  }

  const text = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    /* HTML here means the deployment is answering with a Google sign-in page — `access` is
       `ANYONE` in the manifest rather than `ANYONE_ANONYMOUS`. It arrives as HTTP 200, so
       nothing else about the response gives it away. */
    throw new GatewayError('not-json', text.slice(0, 200));
  }

  if (json.ok !== true) throw new GatewayError(String(json.error ?? 'unknown'), json);
  return json;
}

/** Read the whole register. Without a session this is the PII-free tier. */
export async function fetchState(
  url: string,
  session?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GatewayState> {
  const q = session
    ? `${url}?op=stateDetailed&session=${encodeURIComponent(session)}`
    : `${url}?op=state`;

  let res: Response;
  try {
    res = await fetchImpl(q);
  } catch (err) {
    throw new GatewayError('offline', err);
  }

  const text = await res.text();
  let json: { ok?: boolean; error?: string; state?: Record<string, unknown> };
  try {
    json = JSON.parse(text);
  } catch {
    throw new GatewayError('not-json', text.slice(0, 200));
  }
  if (json.ok !== true || !json.state) throw new GatewayError(String(json.error ?? 'unknown'), json);

  return readState(json.state);
}

/** Turn the gateway's raw tabs into domain types, keeping every rejected row visible. */
export function readState(raw: Record<string, unknown>): GatewayState {
  const quarantined: GatewayState['quarantined'] = [];
  const tab = <T>(name: string, build: (r: Record<string, string>) => T): T[] => {
    const rows = Array.isArray(raw[name]) ? (raw[name] as Record<string, unknown>[]) : [];
    const result = parseRecords(lower(rows), build);
    if (result.quarantined.length) quarantined.push({ tab: name, issues: result.quarantined });
    return result.ok;
  };

  /* The public tier has no `actorUserId` — the gateway strips it (§39) — and the strict builder
     rejects a row without one, which would quarantine every transaction ever recorded and leave
     the dashboard showing an empty masjid. Found by pointing this adapter at the real gateway;
     both halves were individually right. */
  const tier = raw.tier === 'detailed' ? 'detailed' : 'public';

  return {
    categories: tab('categories', buildCategory),
    locations: tab('locations', buildLocation),
    items: tab('items', buildItem),
    stock: tab('stock', buildStockLine),
    instances: tab('instances', buildInstance),
    requests: tab('requests', buildRequest),
    txns: tab('txns', tier === 'public' ? buildPublicTxn : buildTxn),
    /* The SERVER's clock, not the device's. The 24-hour rule and the whole ordering of the log
       depend on it, and a tablet with a wrong clock would corrupt both silently (§4.1). */
    serverTs: Date.parse(String(raw.serverTs ?? '')) || Date.now(),
    tier,
    rev: Number(raw.rev) || 0,
    quarantined,
  };
}

/**
 * One visit: PIN, log what you are taking, Simpan (§58.5).
 *
 * The device secret is what makes the PIN mean anything — `doPost` sees no headers, no cookies
 * and no client IP, so there is nothing else to rate-limit against and a browser-invented id
 * would just be rotated (§65.2).
 */
export async function openSession(
  url: string, deviceSecret: string, pin: string, fetchImpl: typeof fetch = fetch,
): Promise<Session> {
  const json = await call(url, { op: 'openSession', deviceSecret, pin }, fetchImpl);
  const s = json.session as Session | undefined;
  if (!s?.token) throw new GatewayError('no-session-returned', json);
  return s;
}

export async function closeSession(
  url: string, session: string, fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await call(url, { op: 'closeSession', session }, fetchImpl);
}

export interface AppendResult {
  appended: Txn[];
  /** Entries the gateway had already recorded — a retry, not a failure. */
  duplicates: string[];
}

/**
 * Append events. Safe to retry: the gateway de-duplicates on `clientTxnId`, which was verified
 * against the real deployment rather than assumed.
 */
export async function append(
  url: string, session: string, entries: readonly AppendEntry[], fetchImpl: typeof fetch = fetch,
): Promise<AppendResult> {
  if (entries.length === 0) return { appended: [], duplicates: [] };

  const json = await call(url, { op: 'append', session, entries }, fetchImpl);

  /* The shape is checked, not assumed. A reply that says `ok: true` without an `appended` array
     is not an append — it is the once-in-twenty-five oddity described at the top of this file,
     and treating it as success would silently lose a movement. */
  if (!Array.isArray(json.appended)) throw new GatewayError('unexpected-reply', json);

  const rows = parseRecords(lower(json.appended as Record<string, unknown>[]), buildTxn);
  return {
    appended: rows.ok,
    duplicates: Array.isArray(json.duplicates) ? (json.duplicates as string[]) : [],
  };
}

// ---------------------------------------------------------------------------
// Admin — Clerk-signed catalog writes.
// ---------------------------------------------------------------------------

export interface Whoami {
  userId: string;
  name: string;
  /** Empty when the token verified but the JWT template emits no `role` claim. */
  role: string;
  isAdmin: boolean;
}

/**
 * Who the gateway thinks the signed-in person is.
 *
 * Worth a round trip before showing an admin screen, because the one misconfiguration that
 * bites here is invisible from the client: a token that verifies perfectly but carries no
 * `role` claim is, from the app's side, identical to "this person is not an admin". The fix
 * lives in Clerk's JWT template, which is not a place anybody looks when a button is greyed out.
 */
export async function whoami(
  url: string, token: string, fetchImpl: typeof fetch = fetch,
): Promise<Whoami> {
  const json = await call(url, { op: 'whoami', token }, fetchImpl);
  const who = (json.who ?? {}) as Record<string, unknown>;
  return {
    userId: String(who.userId ?? ''),
    name: String(who.name ?? ''),
    role: String(who.role ?? ''),
    isAdmin: json.isAdmin === true,
  };
}

/** The catalog tabs an admin may replace. The log is not among them, and never will be. */
export interface CatalogTabs {
  Categories?: readonly Record<string, unknown>[];
  Locations?: readonly Record<string, unknown>[];
  Items?: readonly Record<string, unknown>[];
  Stock?: readonly Record<string, unknown>[];
  Requests?: readonly Record<string, unknown>[];
}

/**
 * Replace whole catalog tabs.
 *
 * `rev` is the revision the caller last read. The gateway refuses a mismatch rather than
 * merging, and the caller's job on `stale_rev` is to re-read and show the admin what is
 * actually there — never to retry with the same body, which would be overwriting somebody
 * else's save on purpose.
 */
export async function putCatalog(
  url: string, token: string, rev: number, tabs: CatalogTabs, fetchImpl: typeof fetch = fetch,
): Promise<{ rev: number; wrote: string[] }> {
  const json = await call(url, { op: 'putCatalog', token, rev, tabs }, fetchImpl);
  if (typeof json.rev !== 'number') throw new GatewayError('unexpected-reply', json);
  return { rev: json.rev, wrote: (json.wrote as string[]) ?? [] };
}

/**
 * The detailed tier read with a Clerk admin token instead of a PIN session.
 *
 * A POST, unlike `fetchState`, because the token goes in the body: a JWT in a query string is a
 * credential written into browser history and any log in between, and a 60-second lifetime
 * shortens that window without justifying it.
 */
export async function fetchStateAsAdmin(
  url: string, token: string, fetchImpl: typeof fetch = fetch,
): Promise<GatewayState> {
  const json = await call(url, { op: 'stateDetailed', token }, fetchImpl);
  if (!json.state) throw new GatewayError('unexpected-reply', json);
  return readState(json.state as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// The roster — who holds a PIN.
// ---------------------------------------------------------------------------

export type RosterRole = 'admin_utama' | 'admin' | 'anggota';

export interface RosterUser {
  userId: string;
  name: string;
  role: RosterRole;
  /** Retired: their PIN no longer opens a session, their rows in the log are untouched. */
  disabled: boolean;
}

const readUsers = (json: Record<string, unknown>): RosterUser[] =>
  (Array.isArray(json.users) ? json.users : []).map((u) => {
    const r = u as Record<string, unknown>;
    return {
      userId: String(r.userId ?? ''),
      name: String(r.name ?? ''),
      role: (String(r.role ?? 'anggota') as RosterRole),
      disabled: r.disabled === true,
    };
  });

export async function listRoster(
  url: string, token: string, fetchImpl: typeof fetch = fetch,
): Promise<RosterUser[]> {
  return readUsers(await call(url, { op: 'listUsers', token }, fetchImpl));
}

/**
 * Issue or replace somebody's PIN.
 *
 * The PIN goes ONE WAY. Nothing reads it back — not this function, not the roster list, not any
 * log line — so the admin who typed it is the only person who can pass it on. A PIN that can be
 * read out of the system is one that eventually will be, by somebody who should not have it.
 *
 * Omit `userId` to create somebody; pass it to change an existing person, which is what lets a
 * name be corrected without minting a second record for the same human.
 */
export async function setRosterPin(
  url: string,
  token: string,
  user: { userId?: string; name: string; role: RosterRole; pin: string },
  fetchImpl: typeof fetch = fetch,
): Promise<RosterUser[]> {
  return readUsers(await call(url, { op: 'setUserPin', token, ...user }, fetchImpl));
}

export async function setRosterActive(
  url: string, token: string, userId: string, disabled: boolean,
  fetchImpl: typeof fetch = fetch,
): Promise<RosterUser[]> {
  return readUsers(await call(url, { op: 'setUserActive', token, userId, disabled }, fetchImpl));
}

/** What somebody wants bought or repaired. No id, no status, no author — the gateway sets those. */
export interface RequestDraft {
  /**
   * The id the client already filed this request's photos under.
   *
   * `RequestForm` mints it before opening so attachments have somewhere to go, so a
   * server-minted id would orphan every photo on the device that took them. The gateway keeps
   * it when it is well-formed and unused, and mints its own otherwise.
   */
  requestId?: string;
  type: 'beli' | 'perbaikan';
  name: string;
  qty: number;
  unit: string;
  reason: string;
  price?: number;
  url?: string;
  itemId?: string;
  assetId?: string;
}

/**
 * File a request with whichever credential this device has.
 *
 * The asymmetry with reading is deliberate and is the whole reason this exists: the Requests tab
 * names who asked, who decided and why, so reading it needs an admin (§39) — but the person who
 * needs a new mop is rarely the person with a Clerk password, and making an admin type it in for
 * them is the added bookkeeping §0.0 says to refuse. Filing reveals nothing about anybody else.
 *
 * Nothing comes back but an id. The submitter cannot read this tab, and echoing their own row
 * would be the one hole in that.
 */
export async function submitRequest(
  url: string,
  credential: { session: string } | { token: string },
  draft: RequestDraft,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const json = await call(url, { op: 'submitRequest', ...credential, ...draft }, fetchImpl);
  return String(json.requestId ?? '');
}
