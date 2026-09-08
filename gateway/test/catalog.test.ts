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
    getRange: (row: number, col: number, numRows: number, numCols: number) => ({
      getValues: () => tabs[name].slice(row - 1, row - 1 + numRows),
      clearContent: () => { tabs[name] = tabs[name].slice(0, row - 1); },
      setValues: (vals: string[][]) => {
        while (tabs[name].length < row - 1) tabs[name].push(new Array(numCols).fill(''));
        vals.forEach((v, i) => { tabs[name][row - 1 + i] = v.map(String); });
      },
    }),
  });
  return { getSheetByName: (n: string) => (tabs[n] ? sheet(n) : null) };
}

function load(tabs: Record<string, Tab>, props: Record<string, string> = {}) {
  const store: Record<string, string> = { CLERK_JWT_KEY: KEY, CLERK_ISSUER: ISS, ...props };
  const sandbox: Record<string, unknown> = {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => store[k] ?? null,
        setProperty: (k: string, v: string) => { store[k] = v; },
      }),
    },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => fakeBook(tabs), openById: () => fakeBook(tabs), flush: () => {} },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ContentService: {
      MimeType: { TEXT: 'text' },
      createTextOutput: (s: string) => ({ setMimeType: () => JSON.parse(s) }),
    },
    Utilities: {
      getUuid: () => randomUUID(),
      computeHmacSha256Signature: (v: string, k: string) => [...createHmac('sha256', k).update(v).digest()],
      base64EncodeWebSafe: (b: number[]) => b64url(Buffer.from(b)),
      base64DecodeWebSafe: (s: string) => [...Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')],
      newBlob: (b: number[]) => ({ getDataAsString: () => Buffer.from(b).toString('utf8') }),
    },
  };
  const src = ['auth.gs', 'sheets.gs', 'Code.gs']
    .map((f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'))
    .join('\n;\n');
  return new Function(
    ...Object.keys(sandbox),
    `${src}; return { handlePutCatalog, handleWhoami, handleDetailedRead, writeTab, txnRow, catalogRev,
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
  it('appends one catalog_edit row naming the admin and the tabs', () => {
    const tabs = freshTabs();
    const g = load(tabs);
    g.handlePutCatalog({ token: admin, tabs: { Items: [{ itemId: 'a' }], Categories: [] } });
    const row = tabs.Transactions[1];
    expect(row[TXN_HEADER.indexOf('type')]).toBe('catalog_edit');
    expect(row[TXN_HEADER.indexOf('actorUserId')]).toBe('usr_1');
    expect(row[TXN_HEADER.indexOf('note')]).toBe('Items=1 Categories=0');
    expect(row).toHaveLength(TXN_HEADER.length);
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
