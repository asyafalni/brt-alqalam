// The admin catalog write path, exercised against a fake spreadsheet.
//
// `putCatalog` is the first thing in this gateway that REPLACES data rather than appending, so
// the two ways it can go wrong are both silent: writing values into the wrong columns, and
// letting somebody who is not an admin do it at all. Neither shows up on a screen — you find
// out from the shelf, months later. Hence a test per failure, not per function.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';

const KEY = 'test-signing-key-not-a-real-one';
const ISS = 'https://example.clerk.accounts.dev';

const b64url = (buf: Buffer | string) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function token(claims: Record<string, unknown>) {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ iss: ISS, exp: Math.floor(Date.now() / 1000) + 60, ...claims }));
  const sig = createHmac('sha256', KEY).update(`${head}.${body}`).digest();
  return `${head}.${body}.${b64url(sig)}`;
}

type Tab = string[][];

/** A spreadsheet that remembers what was written, so assertions read the cells. */
function fakeBook(tabs: Record<string, Tab>) {
  const sheet = (name: string) => ({
    getDataRange: () => ({ getValues: () => tabs[name] }),
    getLastRow: () => tabs[name].length,
    setFrozenRows: () => {},
    getRange: (row: number, col: number, numRows: number, numCols: number) => ({
      /* Respects the COLUMN offset, which it did not: `existingClientTxnIds` asks for one
         column and was handed whole rows, so it compared txnIds against clientTxnIds and found
         no duplicates ever. A fake that is looser than the real thing hides exactly the bugs it
         is there to catch. */
      getValues: () => tabs[name]
        .slice(row - 1, row - 1 + numRows)
        .map((r) => r.slice(col - 1, col - 1 + numCols)),
      clearContent: () => { tabs[name] = tabs[name].slice(0, row - 1); },
      setValues: (vals: string[][]) => {
        while (tabs[name].length < row - 1) tabs[name].push(new Array(numCols).fill(''));
        vals.forEach((v, i) => { tabs[name][row - 1 + i] = v.map(String); });
      },
    }),
  });
  return {
    getSheetByName: (n: string) => (tabs[n] ? sheet(n) : null),
    // The admin log creates itself on first use, so the fake has to be able to grow a tab too.
    insertSheet: (n: string) => { tabs[n] = []; return sheet(n); },
  };
}

/** What the fake Clerk was asked, and what it should answer. Reset per `load`. */
let clerkCalls: { url: string; options: Record<string, unknown> }[] = [];
let clerkReplies: { code: number; body: unknown }[] = [];
/** Script cache contents, reset per `load`, pre-seeded with one live PIN session. */
let clerkCache = new Map<string, string>();

function load(tabs: Record<string, Tab>, props: Record<string, string> = {}) {
  clerkCalls = [];
  clerkReplies = [];
  clerkCache = new Map();
  const store: Record<string, string> = {
    CLERK_JWT_KEY: KEY, CLERK_ISSUER: ISS, PIN_PEPPER: 'test-pepper', ...props,
  };
  const sandbox: Record<string, unknown> = {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => store[k] ?? null,
        setProperty: (k: string, v: string) => { store[k] = v; },
      }),
    },
    CacheService: {
      /* A cache that actually CACHES. It used to discard every write, so the failed-PIN counter
         read back zero for ever and no lockout could be reached — a fake looser than the real
         thing hides exactly the behaviour it exists to check. */
      getScriptCache: () => ({
        get: (k: string) => (clerkCache.has(k) ? clerkCache.get(k)! : null),
        put: (k: string, v: string) => { clerkCache.set(k, v); },
        remove: (k: string) => { clerkCache.delete(k); },
      }),
    },
    SpreadsheetApp: { getActiveSpreadsheet: () => fakeBook(tabs), openById: () => fakeBook(tabs), flush: () => {} },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ContentService: {
      MimeType: { TEXT: 'text' },
      createTextOutput: (s: string) => ({ setMimeType: () => JSON.parse(s) }),
    },
    UrlFetchApp: {
      fetch: (url: string, options: Record<string, unknown>) => {
        clerkCalls.push({ url, options });
        const reply = clerkReplies.shift() ?? { code: 200, body: { id: 'inv_1', email_address: 'x@y.z' } };
        return {
          getResponseCode: () => reply.code,
          getContentText: () => JSON.stringify(reply.body),
        };
      },
    },
    Utilities: {
      getUuid: () => randomUUID(),
      computeHmacSha256Signature: (v: string, k: string) => [...createHmac('sha256', k).update(v).digest()],
      base64EncodeWebSafe: (b: number[]) => b64url(Buffer.from(b)),
      base64DecodeWebSafe: (s: string) => [...Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')],
      newBlob: (b: number[]) => ({ getDataAsString: () => Buffer.from(b).toString('utf8') }),
    },
  };
  // Every .gs file, because Apps Script gives them ONE global scope and a harness that loads
  // a subset will report "not defined" for code that works perfectly in production.
  const src = ['auth.gs', 'sheets.gs', 'roster.gs', 'devices.gs', 'clerk.gs', 'Code.gs']
    .map((f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'))
    .join('\n;\n');
  return new Function(
    ...Object.keys(sandbox),
    `${src}; return { handlePutCatalog, handleWhoami, handleDetailedRead, handleListUsers,
       handleSetUserPin, handleSetUserActive, handleSubmitRequest, handleOpenSession, handleListDevices, handleEnrollDevice,
       handleSetDeviceRevoked, handleRenameDevice, handleInviteAdmin,
       handleListInvitations, handleRevokeInvitation, handleFinishRequest, handleSuggestPin,
       handleSetUserDetails,
       requireSession,
       writeTab, txnRow, updateRowById, catalogRev,
       WRITABLE_TABS, TXN_COLUMNS, REQUIRED_TABS };`,
  )(...Object.values(sandbox));
}

const ITEM_HEADER = ['itemId', 'barcode', 'name', 'categoryId', 'kind', 'unit', 'trackBy',
  'minStock', 'active', 'keterangan', 'artId'];
const TXN_HEADER = ['txnId', 'clientTxnId', 'ts', 'type', 'itemId', 'assetId', 'locationId',
  'qtyDelta', 'recipient', 'actorUserId', 'condition', 'note', 'toStatus', 'reversesTxnId'];

const freshTabs = (): Record<string, Tab> => ({
  Items: [ITEM_HEADER.slice(), ['itm-1', '', 'Sabun', 'cat-1', 'consumable', 'botol', 'quantity', '2', 'true', '', '']],
  Categories: [['categoryId', 'name', 'order', 'active']],
  Locations: [['locationId', 'code', 'name', 'zone', 'order', 'active', 'artId']],
  Stock: [['itemId', 'locationId', 'initialStock']],
  AssetInstances: [['assetId', 'itemId', 'label', 'acquiredTs', 'active']],
  Requests: [['requestId', 'type', 'name', 'itemId', 'assetId', 'qty', 'unit', 'price', 'reason',
    'url', 'status', 'requestedBy', 'requestedTs', 'decidedBy', 'decidedTs', 'note']],
  Transactions: [TXN_HEADER.slice()],
});

const admin = token({ sub: 'usr_1', role: 'admin', name: 'Alfin' });
/** The permanent super-admin. Only this role may create or alter another admin. */
const utama = token({ sub: 'usr_0', role: 'admin_utama', name: 'Bos' });

/**
 * A real PIN session for a real roster entry.
 *
 * There used to be a magic pre-seeded token pointing at a user nobody had registered, and it
 * stopped working the moment `requireSession` began checking the roster — correctly, because
 * "we can revoke somebody" is only true if a live session notices. A fixture that could not
 * survive that check was a fixture describing something the system does not do.
 */
function marbotSession(g: Record<string, any>): string {
  g.handleSetUserPin({ token: admin, name: 'Budi', role: 'anggota', pin: '4321' });
  return g.handleOpenSession({ deviceSecret: 'rahasia-uji', pin: '4321' }).session.token;
}


describe('what an admin may replace', () => {
  it('never lists Transactions — the log is appended, never rewritten', () => {
    const g = load(freshTabs());
    expect(g.WRITABLE_TABS).not.toContain('Transactions');
    expect(g.WRITABLE_TABS).not.toContain('AssetInstances');
  });

  it('refuses a tab outside the allowlist, naming it', () => {
    const g = load(freshTabs());
    const r = g.handlePutCatalog({ token: admin, tabs: { Transactions: [] } });
    expect(r).toMatchObject({ ok: false, error: 'tab_not_writable', tab: 'Transactions' });
  });
});

describe('who may write', () => {
  it('refuses with no token at all', () => {
    const g = load(freshTabs());
    expect(g.handlePutCatalog({ tabs: { Items: [] } }).ok).toBe(false);
  });

  it('refuses a perfectly valid token whose role is anggota', () => {
    const g = load(freshTabs());
    const r = g.handlePutCatalog({
      token: token({ sub: 'usr_2', role: 'anggota', name: 'Marbot' }),
      tabs: { Items: [] },
    });
    expect(r).toMatchObject({ ok: false, error: 'not-admin' });
  });

  it('accepts admin_utama as well as admin', () => {
    const g = load(freshTabs());
    const r = g.handlePutCatalog({
      token: token({ sub: 'usr_3', role: 'admin_utama', name: 'Bos' }),
      tabs: { Items: [] },
    });
    expect(r.ok).toBe(true);
  });

  it('whoami says "verified but no role", which is otherwise indistinguishable', () => {
    const g = load(freshTabs());
    const r = g.handleWhoami({ token: token({ sub: 'usr_4', name: 'Nobody' }) });
    expect(r).toMatchObject({ ok: true, isAdmin: false });
    expect(r.who.role).toBe('');
  });
});

describe('columns land where the header says, not where the caller put them', () => {
  it('writes by header order even when the object key order is reversed', () => {
    const tabs = freshTabs();
    const g = load(tabs);
    g.handlePutCatalog({
      token: admin,
      tabs: {
        Items: [{
          artId: 'jerrycan', keterangan: 'cuci', active: 'true', minStock: '3',
          trackBy: 'quantity', unit: 'galon', kind: 'consumable', categoryId: 'cat-9',
          name: 'Sabun cuci', barcode: 'B1', itemId: 'itm-9',
        }],
      },
    });
    expect(tabs.Items[1]).toEqual(
      ['itm-9', 'B1', 'Sabun cuci', 'cat-9', 'consumable', 'galon', 'quantity', '3', 'true', 'cuci', 'jerrycan'],
    );
  });

  it('writes a missing field blank rather than shifting every column after it', () => {
    const tabs = freshTabs();
    const g = load(tabs);
    g.handlePutCatalog({ token: admin, tabs: { Items: [{ itemId: 'itm-2', name: 'Pisau' }] } });
    expect(tabs.Items[1][0]).toBe('itm-2');
    expect(tabs.Items[1][2]).toBe('Pisau');
    expect(tabs.Items[1]).toHaveLength(ITEM_HEADER.length);
  });

  it('leaves the header row alone, so a client cannot rename the columns', () => {
    const tabs = freshTabs();
    const g = load(tabs);
    g.handlePutCatalog({ token: admin, tabs: { Items: [{ itemId: 'x' }] } });
    expect(tabs.Items[0]).toEqual(ITEM_HEADER);
  });

  it('removes the rows that are gone, not just the ones overwritten', () => {
    const tabs = freshTabs();
    tabs.Items.push(['itm-2', '', 'Pisau', 'cat-1', 'equipment', 'buah', 'instance', '', 'true', '', '']);
    const g = load(tabs);
    g.handlePutCatalog({ token: admin, tabs: { Items: [{ itemId: 'itm-1', name: 'Sabun' }] } });
    expect(tabs.Items).toHaveLength(2);
  });
});

describe('two admins editing at once', () => {
  it('refuses a save built on a stale rev, and says what the current one is', () => {
    const g = load(freshTabs(), { CATALOG_REV: '7' });
    const r = g.handlePutCatalog({ token: admin, rev: 6, tabs: { Items: [] } });
    expect(r).toMatchObject({ ok: false, error: 'stale_rev', rev: 7 });
  });

  it('accepts the matching rev and moves it on', () => {
    const g = load(freshTabs(), { CATALOG_REV: '7' });
    const r = g.handlePutCatalog({ token: admin, rev: 7, tabs: { Items: [] } });
    expect(r).toMatchObject({ ok: true, rev: 8 });
  });
});

describe('the audit trail', () => {
  it('logs the catalog edit to AdminLog, not to the movement log', () => {
    const tabs = freshTabs();
    const g = load(tabs);
    g.handlePutCatalog({ token: admin, tabs: { Items: [{ itemId: 'a' }], Categories: [] } });

    /* NOT in Transactions. Its eight columns are stock-shaped, and its `type` is a closed union
       the client quarantines anything outside of — an audit row written there would be
       discarded by the very thing meant to read it. */
    expect(tabs.Transactions).toHaveLength(1);

    const log = tabs.AdminLog;
    expect(log[0]).toEqual(['ts', 'actorUserId', 'actorName', 'action', 'detail']);
    expect(log[1][1]).toBe('usr_1');
    expect(log[1][3]).toBe('catalog_edit');
    expect(log[1][4]).toBe('Items=1 Categories=0');
  });

  it('creates the AdminLog tab on demand, so it cannot be missing from a deployment', () => {
    const tabs = freshTabs();
    expect(tabs.AdminLog).toBeUndefined();
    load(tabs).handlePutCatalog({ token: admin, tabs: { Items: [] } });
    expect(tabs.AdminLog).toBeDefined();
  });

  it('txnRow refuses a row that is missing a column instead of writing it short', () => {
    const g = load(freshTabs());
    expect(g.txnRow({ txnId: 'x' })).toMatchObject({ ok: false });
    expect(g.txnRow({ txnId: 'x' }).column).toBeTruthy();
  });
});

describe('the detailed tier accepts either credential', () => {
  it('lets a Clerk admin read it without a PIN session', () => {
    const g = load(freshTabs());
    const r = g.handleDetailedRead({ token: admin });
    expect(r.ok).toBe(true);
    expect(r.state.tier).toBe('detailed');
  });

  it('refuses an anggota token, which has no business reading who holds what', () => {
    const g = load(freshTabs());
    const r = g.handleDetailedRead({ token: token({ sub: 'u', role: 'anggota', name: 'M' }) });
    expect(r).toMatchObject({ ok: false, error: 'not-admin' });
  });

  it('refuses when neither credential is present', () => {
    const g = load(freshTabs());
    expect(g.handleDetailedRead({})).toMatchObject({ ok: false, error: 'no_session' });
  });
});

describe('the roster', () => {
  const load2 = () => load(freshTabs());

  it('refuses to issue a PIN without an admin token', () => {
    const g = load2();
    expect(g.handleSetUserPin({ name: 'Budi', role: 'anggota', pin: '1234' }).ok).toBe(false);
  });

  it('refuses a role outside the three', () => {
    const g = load2();
    expect(g.handleSetUserPin({ token: admin, name: 'Budi', role: 'Admin', pin: '1234' }))
      .toMatchObject({ ok: false, error: 'bad_role' });
  });

  it.each([['12'], ['abcd'], ['123456789'], ['']])('refuses the PIN %s', (pin) => {
    const g = load2();
    expect(g.handleSetUserPin({ token: admin, name: 'Budi', role: 'anggota', pin }))
      .toMatchObject({ ok: false, error: 'bad_pin' });
  });

  it('ALLOWS a PIN somebody else has, and names who shares it', () => {
    const g = load2();
    expect(g.handleSetUserPin({ token: admin, name: 'Budi', role: 'anggota', pin: '4321' }).ok).toBe(true);
    const second = g.handleSetUserPin({ token: admin, name: 'Sari', role: 'anggota', pin: '4321' });
    // Refusing cost the admin a retry and bought nothing: a shared PIN now asks which of the
    // two at sign-in. The count is reported so the screen can offer to pick another anyway.
    expect(second.ok).toBe(true);
    expect(second.sharedWith).toEqual(['Budi']);
  });

  it('lets one person keep their own PIN while changing their name', () => {
    const g = load2();
    const first = g.handleSetUserPin({ token: admin, name: 'Budi', role: 'anggota', pin: '4321' });
    const again = g.handleSetUserPin({
      token: admin, userId: first.userId, name: 'Budi Santoso', role: 'anggota', pin: '4321',
    });
    expect(again.ok).toBe(true);
    expect(again.users).toHaveLength(1);
    expect(again.users[0].name).toBe('Budi Santoso');
  });

  it('never returns a hash, a salt or the PIN', () => {
    const g = load2();
    const r = g.handleSetUserPin({ token: admin, name: 'Budi', role: 'anggota', pin: '4321' });
    const text = JSON.stringify(r);
    expect(text).not.toContain('4321');
    expect(text).not.toContain('pinHash');
    expect(text).not.toContain('salt');
    expect(Object.keys(r.users[0]).sort())
      .toEqual(['disabled', 'name', 'phone', 'role', 'type', 'userId']);
  });

  it("reissues a retired person's PIN, and their old rows stay theirs anyway", () => {
    /* The old rule reserved it, on the reasoning that reissuing would make historical rows read
       as the new person's. That reasoning was WRONG: the log stores `actorUserId`, not the PIN,
       and a new person gets a new id. Nothing in the past changes. */
    const g = load2();
    const budi = g.handleSetUserPin({ token: admin, name: 'Budi', role: 'anggota', pin: '4321' });
    g.handleSetUserActive({ token: admin, userId: budi.userId, disabled: true });
    const sari = g.handleSetUserPin({ token: admin, name: 'Sari', role: 'anggota', pin: '4321' });
    expect(sari.ok).toBe(true);
    expect(sari.userId).not.toBe(budi.userId);
    // And a retired PIN opens nothing, so the two never collide at sign-in either.
    expect(sari.sharedWith).toEqual([]);
  });

  it('will not disable admin_utama, which the spec draws as Tetap', () => {
    const g = load2();
    const made = g.handleSetUserPin({ token: utama, name: 'Bos', role: 'admin_utama', pin: '9999' });
    // Even admin_utama cannot switch off an admin_utama — the spec draws that account as Tetap.
    expect(g.handleSetUserActive({ token: utama, userId: made.userId, disabled: true }))
      .toMatchObject({ ok: false, error: 'admin_utama_permanent' });
  });

  it('lists nobody before anybody is added', () => {
    expect(load2().handleListUsers({ token: admin })).toMatchObject({ ok: true, users: [] });
  });
});

const REQ_HEADER = ['requestId', 'type', 'name', 'itemId', 'assetId', 'qty', 'unit', 'price',
  'reason', 'url', 'status', 'requestedBy', 'requestedTs', 'decidedBy', 'decidedTs', 'note'];

describe('filing a request needs a PIN, not an admin', () => {
  const DEVICE = JSON.stringify([
    { deviceId: 'DEV-1', label: 'Kios', secret: 'rahasia-uji', revoked: false },
  ]);
  const base = { name: 'Kain pel', qty: 2, unit: 'buah', reason: 'sudah tipis' };
  /** Loads a gateway with one enrolled device and one registered marbot, and signs them in. */
  const signedIn = (tabs: Record<string, Tab>) => {
    const g = load(tabs, { DEVICES: DEVICE });
    return { g, ok: { ...base, session: marbotSession(g) } };
  };

  it('refuses with no session at all', () => {
    const { g, ok } = signedIn(freshTabs());
    expect(g.handleSubmitRequest({ ...ok, session: undefined }))
      .toMatchObject({ ok: false, error: 'no_session' });
  });

  it('accepts an anggota session — no Clerk token anywhere', () => {
    const tabs = freshTabs();
    const { g, ok } = signedIn(tabs);
    expect(g.handleSubmitRequest(ok).ok).toBe(true);
    expect(tabs.Requests).toHaveLength(2);
  });

  it('takes requestedBy from the SESSION, never from the body', () => {
    const tabs = freshTabs();
    const { g, ok } = signedIn(tabs);
    const me = g.handleListUsers({ token: admin }).users[0].userId;
    g.handleSubmitRequest({ ...ok, requestedBy: 'USR-orang-lain' });
    expect(tabs.Requests[1][REQ_HEADER.indexOf('requestedBy')]).toBe(me);
  });

  it('always files as diajukan, whatever the body says', () => {
    const tabs = freshTabs();
    const { g, ok } = signedIn(tabs);
    g.handleSubmitRequest({ ...ok, status: 'selesai' });
    expect(tabs.Requests[1][REQ_HEADER.indexOf('status')]).toBe('diajukan');
  });

  it('requires a reason, because a request nobody can judge gets chased instead', () => {
    const { g, ok } = signedIn(freshTabs());
    expect(g.handleSubmitRequest({ ...ok, reason: '  ' }))
      .toMatchObject({ ok: false, error: 'reason_required' });
  });

  it('requires a name and a positive quantity', () => {
    const { g, ok } = signedIn(freshTabs());
    expect(g.handleSubmitRequest({ ...ok, name: '' })).toMatchObject({ ok: false, error: 'name_required' });
    expect(g.handleSubmitRequest({ ...ok, qty: 0 })).toMatchObject({ ok: false, error: 'bad_qty' });
  });

  it('does not echo the row back — the submitter cannot read this tab', () => {
    const { g, ok } = signedIn(freshTabs());
    expect(Object.keys(g.handleSubmitRequest(ok)).sort()).toEqual(['ok', 'requestId']);
  });

  it('appends, never replaces: an existing request survives', () => {
    const tabs = freshTabs();
    tabs.Requests.push(REQ_HEADER.map((c) => (c === 'requestId' ? 'REQ-lama' : '')));
    const { g, ok } = signedIn(tabs);
    g.handleSubmitRequest(ok);
    expect(tabs.Requests[1][0]).toBe('REQ-lama');
    expect(tabs.Requests).toHaveLength(3);
  });

  it('writes an unpriced request blank, not zero', () => {
    const tabs = freshTabs();
    const { g, ok } = signedIn(tabs);
    g.handleSubmitRequest(ok);
    expect(tabs.Requests[1][REQ_HEADER.indexOf('price')]).toBe('');
  });
});

describe('an admin can file one too', () => {
  it('accepts a Clerk token where a PIN would do', () => {
    const tabs = freshTabs();
    const r = load(tabs).handleSubmitRequest({
      token: admin, name: 'Sapu', qty: 1, unit: 'buah', reason: 'patah',
    });
    expect(r.ok).toBe(true);
    // The author is the admin's own id, from the verified token.
    expect(tabs.Requests[1][REQ_HEADER.indexOf('requestedBy')]).toBe('usr_1');
  });

  it('still refuses an anggota Clerk token', () => {
    expect(load(freshTabs()).handleSubmitRequest({
      token: token({ sub: 'u', role: 'anggota', name: 'M' }),
      name: 'Sapu', qty: 1, reason: 'patah',
    })).toMatchObject({ ok: false, error: 'not-admin' });
  });
});

describe('the request id, so photos are not orphaned', () => {
  const DEVICE2 = JSON.stringify([
    { deviceId: 'DEV-1', label: 'Kios', secret: 'rahasia-uji', revoked: false },
  ]);
  const signedIn2 = (tabs: Record<string, Tab>) => {
    const g = load(tabs, { DEVICES: DEVICE2 });
    return { g, ok: { name: 'Kain pel', qty: 1, unit: 'buah', reason: 'tipis', session: marbotSession(g) } };
  };

  it("keeps the client's id, which is what its photos are filed under", () => {
    const { g, ok } = signedIn2(freshTabs());
    expect(g.handleSubmitRequest({ ...ok, requestId: 'REQ-abc12345' }).requestId)
      .toBe('REQ-abc12345');
  });

  it('mints its own when the id is malformed', () => {
    const { g, ok } = signedIn2(freshTabs());
    expect(g.handleSubmitRequest({ ...ok, requestId: '../../etc' }).requestId)
      .toMatch(/^REQ-[0-9a-f]{8}$/);
  });

  it('mints its own rather than colliding with a row that exists', () => {
    const tabs = freshTabs();
    const { g, ok } = signedIn2(tabs);
    g.handleSubmitRequest({ ...ok, requestId: 'REQ-abc12345' });
    const second = g.handleSubmitRequest({ ...ok, requestId: 'REQ-abc12345' });
    expect(second.requestId).not.toBe('REQ-abc12345');
    expect(tabs.Requests).toHaveLength(3);
  });
});

describe('signing in when a PIN belongs to two people', () => {
  const device = { deviceSecret: 'rahasia-uji' };

  function withUsers(names: [string, string][]) {
    const tabs = freshTabs();
    const g = load(tabs, {
      DEVICES: JSON.stringify([{ deviceId: 'DEV-1', label: 'Kios', secret: 'rahasia-uji', revoked: false }]),
    });
    names.forEach(([name, pin]) =>
      g.handleSetUserPin({ token: admin, name, role: 'anggota', pin }));
    return g;
  }

  it('lets a unique PIN straight through — the fast path is unchanged', () => {
    const g = withUsers([['Budi', '4321'], ['Sari', '8888']]);
    const r = g.handleOpenSession({ ...device, pin: '4321' });
    expect(r.ok).toBe(true);
    expect(r.session.actorName).toBe('Budi');
    expect(r.choose).toBeUndefined();
  });

  it('asks which of the two when the PIN is shared', () => {
    const g = withUsers([['Budi', '4321'], ['Sari', '4321']]);
    const r = g.handleOpenSession({ ...device, pin: '4321' });
    expect(r.ok).toBe(true);
    expect(r.session).toBeUndefined();
    expect(r.choose.map((c: { name: string }) => c.name).sort()).toEqual(['Budi', 'Sari']);
  });

  it('opens the session once a name is picked', () => {
    const g = withUsers([['Budi', '4321'], ['Sari', '4321']]);
    const who = g.handleOpenSession({ ...device, pin: '4321' }).choose
      .find((c: { name: string }) => c.name === 'Sari');
    const r = g.handleOpenSession({ ...device, pin: '4321', userId: who.userId });
    expect(r.session.actorName).toBe('Sari');
  });

  it('naming somebody does NOT let you be them without their PIN', () => {
    const g = withUsers([['Budi', '4321'], ['Sari', '9999']]);
    const sari = g.handleListUsers({ token: admin }).users
      .find((u: { name: string }) => u.name === 'Sari');
    // Budi's PIN, Sari's name.
    expect(g.handleOpenSession({ ...device, pin: '4321', userId: sari.userId }))
      .toMatchObject({ ok: false, error: 'invalid_pin' });
  });

  it('still refuses a PIN nobody has', () => {
    const g = withUsers([['Budi', '4321']]);
    expect(g.handleOpenSession({ ...device, pin: '0000' }))
      .toMatchObject({ ok: false, error: 'invalid_pin' });
  });
});

describe('enrolling a device', () => {
  it('refuses without an admin token — a device secret is a credential', () => {
    expect(load(freshTabs()).handleEnrollDevice({ label: 'HP Budi' }).ok).toBe(false);
  });

  it('refuses an anggota token', () => {
    expect(load(freshTabs()).handleEnrollDevice({
      token: token({ sub: 'u', role: 'anggota', name: 'M' }), label: 'HP Budi',
    })).toMatchObject({ ok: false, error: 'not-admin' });
  });

  it('needs a label, so the list is not a column of identical rows', () => {
    expect(load(freshTabs()).handleEnrollDevice({ token: admin, label: '  ' }))
      .toMatchObject({ ok: false, error: 'label_required' });
  });

  it('returns the secret ONCE, and never again', () => {
    const g = load(freshTabs());
    const made = g.handleEnrollDevice({ token: admin, label: 'HP Budi' });
    expect(made.secret).toMatch(/^[0-9a-f-]{60,}$/);

    // Every later view of the roster of devices omits it.
    const listed = g.handleListDevices({ token: admin }).devices;
    expect(listed).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain(made.secret);
    expect(Object.keys(listed[0]).sort()).toEqual(['deviceId', 'enrolledTs', 'label', 'revoked']);
  });

  it('issues a different secret every time', () => {
    const g = load(freshTabs());
    const a = g.handleEnrollDevice({ token: admin, label: 'A' }).secret;
    const b = g.handleEnrollDevice({ token: admin, label: 'B' }).secret;
    expect(a).not.toBe(b);
  });

  it('lets the new secret open a session straight away', () => {
    const g = load(freshTabs());
    g.handleSetUserPin({ token: admin, name: 'Budi', role: 'anggota', pin: '4321' });
    const made = g.handleEnrollDevice({ token: admin, label: 'HP Budi' });
    expect(g.handleOpenSession({ deviceSecret: made.secret, pin: '4321' }).session.actorName)
      .toBe('Budi');
  });
});

describe('revoking a device', () => {
  function enrolled() {
    const g = load(freshTabs());
    g.handleSetUserPin({ token: admin, name: 'Budi', role: 'anggota', pin: '4321' });
    return { g, made: g.handleEnrollDevice({ token: admin, label: 'HP Budi' }) };
  }

  it('stops it reaching the PIN endpoint at all', () => {
    const { g, made } = enrolled();
    g.handleSetDeviceRevoked({ token: admin, deviceId: made.deviceId, revoked: true });
    expect(g.handleOpenSession({ deviceSecret: made.secret, pin: '4321' }))
      .toMatchObject({ ok: false, error: 'device_not_enrolled' });
  });

  it('is reversible — a phone found in a drawer is not a second identity', () => {
    const { g, made } = enrolled();
    g.handleSetDeviceRevoked({ token: admin, deviceId: made.deviceId, revoked: true });
    g.handleSetDeviceRevoked({ token: admin, deviceId: made.deviceId, revoked: false });
    expect(g.handleOpenSession({ deviceSecret: made.secret, pin: '4321' }).ok).toBe(true);
  });

  it('keeps the row, so "why did this stop working?" has an answer', () => {
    const { g, made } = enrolled();
    g.handleSetDeviceRevoked({ token: admin, deviceId: made.deviceId, revoked: true });
    const listed = g.handleListDevices({ token: admin }).devices;
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ deviceId: made.deviceId, revoked: true, label: 'HP Budi' });
  });

  it('refuses an id that does not exist rather than silently doing nothing', () => {
    expect(load(freshTabs()).handleSetDeviceRevoked({ token: admin, deviceId: 'DEV-x', revoked: true }))
      .toMatchObject({ ok: false, error: 'no_such_device' });
  });

  it('renames without touching the secret', () => {
    const { g, made } = enrolled();
    g.handleRenameDevice({ token: admin, deviceId: made.deviceId, label: 'HP Budi (baru)' });
    expect(g.handleListDevices({ token: admin }).devices[0].label).toBe('HP Budi (baru)');
    expect(g.handleOpenSession({ deviceSecret: made.secret, pin: '4321' }).ok).toBe(true);
  });
});

const plainAdmin = token({ sub: 'usr_plain', role: 'admin', name: 'Admin Biasa' });

describe('only admin_utama may touch another admin', () => {
  it('lets admin_utama create an admin', () => {
    const g = load(freshTabs());
    expect(g.handleSetUserPin({ token: utama, name: 'Rudi', role: 'admin', pin: '5555' }).ok)
      .toBe(true);
  });

  it('refuses an ordinary admin creating one — no quiet promotions', () => {
    const g = load(freshTabs());
    expect(g.handleSetUserPin({ token: plainAdmin, name: 'Rudi', role: 'admin', pin: '5555' }))
      .toMatchObject({ ok: false, error: 'needs_admin_utama' });
  });

  it('still lets an ordinary admin issue an anggota PIN — the daily job', () => {
    const g = load(freshTabs());
    expect(g.handleSetUserPin({ token: plainAdmin, name: 'Budi', role: 'anggota', pin: '4321' }).ok)
      .toBe(true);
  });

  it("refuses an ordinary admin editing an existing admin's row", () => {
    const g = load(freshTabs());
    const rudi = g.handleSetUserPin({ token: utama, name: 'Rudi', role: 'admin', pin: '5555' });
    expect(g.handleSetUserPin({
      token: plainAdmin, userId: rudi.userId, name: 'Rudi', role: 'anggota', pin: '1111',
    })).toMatchObject({ ok: false, error: 'needs_admin_utama' });
  });

  it('refuses an ordinary admin switching another admin off', () => {
    const g = load(freshTabs());
    const rudi = g.handleSetUserPin({ token: utama, name: 'Rudi', role: 'admin', pin: '5555' });
    expect(g.handleSetUserActive({ token: plainAdmin, userId: rudi.userId, disabled: true }))
      .toMatchObject({ ok: false, error: 'needs_admin_utama' });
  });

  it('lets an ordinary admin retire an anggota', () => {
    const g = load(freshTabs());
    const budi = g.handleSetUserPin({ token: plainAdmin, name: 'Budi', role: 'anggota', pin: '4321' });
    expect(g.handleSetUserActive({ token: plainAdmin, userId: budi.userId, disabled: true }).ok)
      .toBe(true);
  });
});

describe('inviting an admin', () => {
  const withKey = (tabs: Record<string, Tab>) => load(tabs, { CLERK_SECRET_KEY: 'sk_test_x' });

  it('does nothing at all without a secret key — the capability is opt-in', () => {
    // Deploying this code must not, by itself, give the gateway the power to mint identities.
    const g = load(freshTabs());
    expect(g.handleInviteAdmin({ token: utama, email: 'a@b.c', role: 'admin' }))
      .toMatchObject({ ok: false, error: 'clerk_not_configured' });
    expect(clerkCalls).toHaveLength(0);
  });

  it('refuses an ordinary admin — this creates identities, not inventory rows', () => {
    const g = withKey(freshTabs());
    expect(g.handleInviteAdmin({ token: admin, email: 'a@b.c', role: 'admin' }))
      .toMatchObject({ ok: false, error: 'needs_admin_utama' });
    expect(clerkCalls).toHaveLength(0);
  });

  it('NEVER invites an admin_utama, however it is asked', () => {
    const g = withKey(freshTabs());
    expect(g.handleInviteAdmin({ token: utama, email: 'a@b.c', role: 'admin_utama' }))
      .toMatchObject({ ok: false, error: 'bad_role' });
    expect(g.handleInviteAdmin({ token: utama, email: 'a@b.c', role: 'anggota' }))
      .toMatchObject({ ok: false, error: 'bad_role' });
    expect(clerkCalls).toHaveLength(0);
  });

  it('refuses something that is not an email before spending a call on it', () => {
    const g = withKey(freshTabs());
    expect(g.handleInviteAdmin({ token: utama, email: 'budi', role: 'admin' }))
      .toMatchObject({ ok: false, error: 'bad_email' });
    expect(clerkCalls).toHaveLength(0);
  });

  it('sends the role as public_metadata, which is where the JWT reads it from', () => {
    const g = withKey(freshTabs());
    clerkReplies = [
      { code: 200, body: { id: 'inv_9', email_address: 'rudi@masjid.id' } },
      { code: 200, body: { data: [] } },
    ];
    const r = g.handleInviteAdmin({ token: utama, email: 'rudi@masjid.id', role: 'admin' });
    expect(r.ok).toBe(true);

    const sent = JSON.parse(String(clerkCalls[0].options.payload));
    expect(clerkCalls[0].url).toContain('/invitations');
    expect(sent).toMatchObject({
      email_address: 'rudi@masjid.id',
      public_metadata: { role: 'admin' },
    });
    // No password anywhere: the invited person sets their own, in Clerk.
    expect(JSON.stringify(sent)).not.toContain('password');
  });

  it('pins the Clerk API version, so a dated breaking change cannot arrive silently', () => {
    const g = withKey(freshTabs());
    clerkReplies = [{ code: 200, body: { id: 'i' } }, { code: 200, body: { data: [] } }];
    g.handleInviteAdmin({ token: utama, email: 'a@b.c', role: 'admin' });
    const headers = (clerkCalls[0].options.headers ?? {}) as Record<string, string>;
    expect(headers['Clerk-API-Version']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(headers.Authorization).toBe('Bearer sk_test_x');
  });

  it('writes who invited whom to AdminLog', () => {
    const tabs = freshTabs();
    const g = withKey(tabs);
    clerkReplies = [
      { code: 200, body: { id: 'inv_9', email_address: 'rudi@masjid.id' } },
      { code: 200, body: { data: [] } },
    ];
    g.handleInviteAdmin({ token: utama, email: 'rudi@masjid.id', role: 'admin' });
    const row = tabs.AdminLog[tabs.AdminLog.length - 1];
    expect(row[2]).toBe('Bos');
    expect(row[3]).toBe('invite_admin');
    expect(row[4]).toContain('rudi@masjid.id');
  });

  it("passes Clerk's own refusal through rather than inventing one", () => {
    const g = withKey(freshTabs());
    clerkReplies = [{ code: 422, body: { errors: [{ long_message: 'duplicate invitation' }] } }];
    const r = g.handleInviteAdmin({ token: utama, email: 'a@b.c', role: 'admin' });
    expect(r).toMatchObject({ ok: false, error: 'clerk_422' });
    expect(r.message).toContain('duplicate invitation');
  });
});

describe('closing a request', () => {
  const REQ = ['requestId', 'type', 'name', 'itemId', 'assetId', 'qty', 'unit', 'price', 'reason',
    'url', 'status', 'requestedBy', 'requestedTs', 'decidedBy', 'decidedTs', 'note'];

  function withRequest(type = 'perbaikan') {
    const tabs = freshTabs();
    const row = REQ.map((c) => {
      if (c === 'requestId') return 'REQ-1';
      if (c === 'type') return type;
      if (c === 'name') return 'Pisau potong #1';
      if (c === 'assetId') return 'ALQ-1-001';
      if (c === 'status') return 'diajukan';
      if (c === 'qty') return '1';
      if (c === 'unit') return 'buah';
      return '';
    });
    tabs.Requests.push(row);
    return { tabs, g: load(tabs) };
  }

  it('refuses without an admin token', () => {
    expect(withRequest().g.handleFinishRequest({ requestId: 'REQ-1' }).ok).toBe(false);
  });

  it('closes the request AND puts the unit back, in one call', () => {
    const { tabs, g } = withRequest();
    const r = g.handleFinishRequest({
      token: admin, requestId: 'REQ-1', assetId: 'ALQ-1-001', toStatus: 'available',
    });
    expect(r.ok).toBe(true);

    expect(tabs.Requests[1][REQ.indexOf('status')]).toBe('selesai');
    expect(tabs.Requests[1][REQ.indexOf('decidedBy')]).toBe('usr_1');

    const txn = tabs.Transactions[1];
    expect(txn[TXN_HEADER.indexOf('type')]).toBe('status_change');
    expect(txn[TXN_HEADER.indexOf('assetId')]).toBe('ALQ-1-001');
    expect(txn[TXN_HEADER.indexOf('toStatus')]).toBe('available');
  });

  it('does not append twice when pressed twice', () => {
    const { tabs, g } = withRequest();
    const call = () => g.handleFinishRequest({
      token: admin, requestId: 'REQ-1', assetId: 'ALQ-1-001', toStatus: 'available',
    });
    call();
    const second = call();
    expect(second.ok).toBe(true);
    expect(second.appended).toBeNull();
    expect(tabs.Transactions).toHaveLength(2);
  });

  it('cancels without touching the log — nothing physical happened', () => {
    const { tabs, g } = withRequest('beli');
    g.handleFinishRequest({ token: admin, requestId: 'REQ-1', status: 'dibatalkan', note: 'tidak jadi' });
    expect(tabs.Requests[1][REQ.indexOf('status')]).toBe('dibatalkan');
    expect(tabs.Requests[1][REQ.indexOf('note')]).toBe('tidak jadi');
    expect(tabs.Transactions).toHaveLength(1);
  });

  it('refuses an id that is not there rather than writing a movement for nothing', () => {
    const { tabs, g } = withRequest();
    expect(g.handleFinishRequest({ token: admin, requestId: 'REQ-nope' }))
      .toMatchObject({ ok: false, error: 'no_such_request' });
    expect(tabs.Requests[1][REQ.indexOf('status')]).toBe('diajukan');
  });
});

describe('updateRowById', () => {
  it('changes only the fields it was given', () => {
    const tabs = freshTabs();
    tabs.Items.push(['itm-9', 'B', 'Sapu', 'cat-1', 'consumable', 'buah', 'quantity', '2', 'TRUE', 'k', 'a']);
    const g = load(tabs);
    expect(g.updateRowById('Items', 'itemId', 'itm-9', { name: 'Sapu ijuk' })).toBe(true);
    expect(tabs.Items[2][2]).toBe('Sapu ijuk');
    // Everything else survives — a patch is not a replacement.
    expect(tabs.Items[2][1]).toBe('B');
    expect(tabs.Items[2][9]).toBe('k');
  });

  it('says so when the id is not there', () => {
    expect(load(freshTabs()).updateRowById('Items', 'itemId', 'nope', { name: 'x' })).toBe(false);
  });
});

describe('suggesting a PIN', () => {
  it('refuses without an admin token', () => {
    expect(load(freshTabs()).handleSuggestPin({}).ok).toBe(false);
  });

  it('returns four digits', () => {
    const r = load(freshTabs()).handleSuggestPin({ token: admin });
    expect(r.ok).toBe(true);
    expect(r.pin).toMatch(/^\d{4}$/);
  });

  it('never suggests one somebody already has', () => {
    const g = load(freshTabs());
    // Fill a slice of the space, then check every suggestion avoids all of it.
    const taken = ['1111', '2222', '3333', '4444', '5555'];
    taken.forEach((pin, i) =>
      g.handleSetUserPin({ token: admin, name: 'U' + i, role: 'anggota', pin }));
    for (let i = 0; i < 40; i++) {
      expect(taken).not.toContain(g.handleSuggestPin({ token: admin }).pin);
    }
  });

  it('is random, not sequential — a pattern is guessable from one person typing theirs', () => {
    const g = load(freshTabs());
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) seen.add(g.handleSuggestPin({ token: admin }).pin);
    // Twenty draws from 10,000 landing on one value would mean it is not random at all.
    expect(seen.size).toBeGreaterThan(10);
  });

  it('accepts the suggestion it just made', () => {
    const g = load(freshTabs());
    const pin = g.handleSuggestPin({ token: admin }).pin;
    expect(g.handleSetUserPin({ token: admin, name: 'Budi', role: 'anggota', pin }).ok).toBe(true);
  });
});

describe('signing in with a phone number instead of an enrolled device', () => {
  function roster() {
    const tabs = freshTabs();
    const g = load(tabs, {
      DEVICES: JSON.stringify([{ deviceId: 'DEV-1', label: 'Kios', secret: 'rahasia', revoked: false }]),
    });
    g.handleSetUserPin({
      token: admin, name: 'Budi', role: 'anggota', type: 'marbot', phone: '0812 3456 7890', pin: '4321',
    });
    g.handleSetUserPin({
      token: admin, name: 'Sari', role: 'anggota', type: 'staf', phone: '081299998888', pin: '4321',
    });
    return g;
  }

  it('opens a session with the right phone and PIN', () => {
    const r = roster().handleOpenSession({ phone: '081234567890', pin: '4321' });
    expect(r.ok).toBe(true);
    expect(r.session.actorName).toBe('Budi');
  });

  it('needs NO enrolled device at all — that is the whole point', () => {
    const r = roster().handleOpenSession({ phone: '081234567890', pin: '4321' });
    expect(r.session).toBeDefined();
  });

  it('reads a number the same however it was typed', () => {
    const g = roster();
    for (const written of ['0812-3456-7890', '+62 812 3456 7890', '0812 3456 7890']) {
      expect(g.handleOpenSession({ phone: written, pin: '4321' }).session.actorName).toBe('Budi');
    }
  });

  it('never disambiguates on the phone path — the number already said who', () => {
    // Budi and Sari share the PIN 4321 deliberately. On a device it would ask which; here it
    // cannot, because the number is the answer.
    const g = roster();
    expect(g.handleOpenSession({ phone: '081299998888', pin: '4321' }).session.actorName).toBe('Sari');
  });

  it('refuses somebody else’s PIN on your number', () => {
    const g = roster();
    g.handleSetUserPin({ token: admin, name: 'Rudi', role: 'anggota', phone: '081277776666', pin: '9999' });
    expect(g.handleOpenSession({ phone: '081234567890', pin: '9999' }))
      .toMatchObject({ ok: false, error: 'invalid_pin' });
  });

  it('answers an UNREGISTERED number exactly like a wrong PIN', () => {
    // Anything else turns this endpoint into a way to test who belongs to the masjid.
    const g = roster();
    const unknown = g.handleOpenSession({ phone: '080000000000', pin: '4321' });
    const wrong = g.handleOpenSession({ phone: '081234567890', pin: '0000' });
    expect(unknown.error).toBe(wrong.error);
    expect(JSON.stringify(unknown)).not.toContain('phone');
  });

  it('locks that NUMBER after five failures, not the whole masjid', () => {
    const g = roster();
    for (let i = 0; i < 5; i++) g.handleOpenSession({ phone: '081234567890', pin: '0000' });
    expect(g.handleOpenSession({ phone: '081234567890', pin: '4321' }))
      .toMatchObject({ ok: false, error: 'locked' });
    // Sari is untouched — a per-account lock must not be a per-masjid one.
    expect(g.handleOpenSession({ phone: '081299998888', pin: '4321' }).ok).toBe(true);
  });

  it('still lets an enrolled device in with a PIN alone', () => {
    // Both models stay live: a shared gudang tablet is not going to type a phone number.
    const r = roster().handleOpenSession({ deviceSecret: 'rahasia', pin: '9999' });
    expect(r.ok).toBe(false);
    expect(roster().handleOpenSession({ deviceSecret: 'rahasia', pin: '4321' }).ok).toBe(true);
  });
});

describe('the phone number on the roster', () => {
  it('is unique — two people cannot be "the person with this number"', () => {
    const g = load(freshTabs());
    g.handleSetUserPin({ token: admin, name: 'Budi', role: 'anggota', phone: '081234567890', pin: '1111' });
    expect(g.handleSetUserPin({
      token: admin, name: 'Sari', role: 'anggota', phone: '0812-3456-7890', pin: '2222',
    })).toMatchObject({ ok: false, error: 'phone_taken' });
  });

  it('lets somebody keep their own number when their row is edited', () => {
    const g = load(freshTabs());
    const budi = g.handleSetUserPin({
      token: admin, name: 'Budi', role: 'anggota', phone: '081234567890', pin: '1111',
    });
    expect(g.handleSetUserPin({
      token: admin, userId: budi.userId, name: 'Budi S', role: 'anggota',
      phone: '081234567890', pin: '1111',
    }).ok).toBe(true);
  });

  it('records the member type, which is a different axis from the role', () => {
    const g = load(freshTabs());
    g.handleSetUserPin({ token: admin, name: 'Pak Aji', role: 'anggota', type: 'security', pin: '3333' });
    expect(g.handleListUsers({ token: admin }).users[0].type).toBe('security');
  });

  it('falls back to marbot for an unknown type rather than storing nonsense', () => {
    const g = load(freshTabs());
    g.handleSetUserPin({ token: admin, name: 'X', role: 'anggota', type: 'presiden', pin: '3333' });
    expect(g.handleListUsers({ token: admin }).users[0].type).toBe('marbot');
  });
});

describe('how long a session lives', () => {
  function roster() {
    const g = load(freshTabs(), {
      DEVICES: JSON.stringify([{ deviceId: 'DEV-1', label: 'Kios', secret: 'rahasia', revoked: false }]),
    });
    g.handleSetUserPin({
      token: admin, name: 'Budi', role: 'anggota', phone: '081234567890', pin: '4321',
    });
    return g;
  }

  it('gives a PHONE session an hour, so a shelf is worked through on one PIN', () => {
    const s = roster().handleOpenSession({ phone: '081234567890', pin: '4321' }).session;
    expect(s.kind).toBe('phone');
    expect(s.expiresInMs).toBe(60 * 60 * 1000);
  });

  it('keeps a shared TABLET on the short window — §58.5 has not changed there', () => {
    // Whoever walks up next to a gudang tablet must not inherit the last person's session.
    const s = roster().handleOpenSession({ deviceSecret: 'rahasia', pin: '4321' }).session;
    expect(s.kind).toBe('device');
    expect(s.expiresInMs).toBe(15 * 60 * 1000);
  });

  it('SLIDES a phone session on use — the hour is idle time, not a stopwatch', () => {
    const g = roster();
    const token = g.handleOpenSession({ phone: '081234567890', pin: '4321' }).session.token;
    const before = clerkCache.get('session:' + token);
    expect(g.requireSession(token).ok).toBe(true);
    // Still there, and re-armed rather than counting down from when it was issued.
    expect(clerkCache.get('session:' + token)).toBe(before);
  });

  it('does NOT slide a device session', () => {
    const g = roster();
    const token = g.handleOpenSession({ deviceSecret: 'rahasia', pin: '4321' }).session.token;
    expect(g.requireSession(token).kind).toBe('device');
  });

  it('refuses a token it has never seen', () => {
    expect(roster().requireSession('tebakan')).toMatchObject({ ok: false, error: 'session_expired' });
  });
});

describe('revoking somebody who is already signed in', () => {
  function live() {
    const g = load(freshTabs());
    const budi = g.handleSetUserPin({
      token: admin, name: 'Budi', role: 'anggota', phone: '081234567890', pin: '4321',
    });
    const token = g.handleOpenSession({ phone: '081234567890', pin: '4321' }).session.token;
    return { g, token, userId: budi.userId };
  }

  it('ends the live session immediately, not in an hour', () => {
    // Otherwise "we can revoke a stolen phone" is untrue for up to an hour — which is exactly
    // the window somebody reaches for revocation to close.
    const { g, token, userId } = live();
    expect(g.requireSession(token).ok).toBe(true);
    g.handleSetUserActive({ token: admin, userId, disabled: true });
    expect(g.requireSession(token)).toMatchObject({ ok: false, error: 'session_revoked' });
  });

  it('stops the writes that session was for', () => {
    const { g, token, userId } = live();
    g.handleSetUserActive({ token: admin, userId, disabled: true });
    expect(g.handleSubmitRequest({
      session: token, name: 'Kain pel', qty: 1, unit: 'buah', reason: 'tipis',
    })).toMatchObject({ ok: false, error: 'session_revoked' });
  });

  it('lets them back in when re-enabled', () => {
    const { g, userId } = live();
    g.handleSetUserActive({ token: admin, userId, disabled: true });
    g.handleSetUserActive({ token: admin, userId, disabled: false });
    // A new PIN, deliberately: the old token was destroyed rather than suspended.
    expect(g.handleOpenSession({ phone: '081234567890', pin: '4321' }).ok).toBe(true);
  });
});

describe('editing somebody who registered before phones existed', () => {
  function existing() {
    const g = load(freshTabs(), {
      DEVICES: JSON.stringify([{ deviceId: 'DEV-1', label: 'Kios', secret: 'rahasia', revoked: false }]),
    });
    const budi = g.handleSetUserPin({ token: admin, name: 'Budi', role: 'anggota', pin: '4321' });
    return { g, userId: budi.userId };
  }

  it('adds a phone number WITHOUT reissuing the PIN', () => {
    // The old form always wrote a new hash, so adding a number meant telling somebody a new PIN
    // for no reason. Two different acts had one door.
    const { g, userId } = existing();
    expect(g.handleSetUserDetails({
      token: admin, userId, name: 'Budi', role: 'anggota', type: 'marbot', phone: '081234567890',
    }).ok).toBe(true);

    // The PIN they were given still works.
    expect(g.handleOpenSession({ deviceSecret: 'rahasia', pin: '4321' }).ok).toBe(true);
    // And now the number does too.
    expect(g.handleOpenSession({ phone: '081234567890', pin: '4321' }).session.actorName).toBe('Budi');
  });

  it('corrects a name and a type without touching anything else', () => {
    const { g, userId } = existing();
    g.handleSetUserDetails({
      token: admin, userId, name: 'Budi Santoso', role: 'anggota', type: 'security', phone: '',
    });
    const u = g.handleListUsers({ token: admin }).users[0];
    expect(u).toMatchObject({ name: 'Budi Santoso', type: 'security' });
    expect(g.handleOpenSession({ deviceSecret: 'rahasia', pin: '4321' }).ok).toBe(true);
  });

  it('refuses a number somebody else holds', () => {
    const { g, userId } = existing();
    g.handleSetUserPin({ token: admin, name: 'Sari', role: 'anggota', phone: '081299998888', pin: '1111' });
    expect(g.handleSetUserDetails({
      token: admin, userId, name: 'Budi', role: 'anggota', type: 'marbot', phone: '081299998888',
    })).toMatchObject({ ok: false, error: 'phone_taken' });
  });

  it('will not let an ordinary admin promote somebody this way either', () => {
    // The edit form carries `role`, so it is a second door onto the same decision.
    const { g, userId } = existing();
    expect(g.handleSetUserDetails({
      token: token({ sub: 'usr_p', role: 'admin', name: 'Admin Biasa' }),
      userId, name: 'Budi', role: 'admin', type: 'marbot', phone: '',
    })).toMatchObject({ ok: false, error: 'needs_admin_utama' });
  });

  it('refuses an id that is not there', () => {
    expect(existing().g.handleSetUserDetails({
      token: admin, userId: 'USR-nope', name: 'X', role: 'anggota', type: 'marbot', phone: '',
    })).toMatchObject({ ok: false, error: 'no_such_user' });
  });
});
