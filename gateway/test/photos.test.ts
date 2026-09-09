// Photos in Drive, behind the gateway.
//
// The two things that can go wrong here are both invisible from a screen: a photo served to
// somebody with no session, and a per-item ceiling that is advice rather than a rule. Neither
// shows up until the day it matters, so there is a test per failure.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

type Tab = string[][];

/** Files Drive was asked to hold, so assertions can read them back. */
let drive: Map<string, { name: string; bytes: number[]; mime: string; trashed: boolean }>;
let folders: string[];

function fakeBook(tabs: Record<string, Tab>) {
  const sheet = (name: string) => ({
    getDataRange: () => ({ getValues: () => tabs[name] }),
    getLastRow: () => tabs[name].length,
    setFrozenRows: () => {},
    deleteRow: (row: number) => { tabs[name].splice(row - 1, 1); },
    appendRow: (row: unknown[]) => { tabs[name].push(row.map(String)); },
    getRange: (row: number, col: number, numRows: number, numCols: number) => ({
      getValues: () => tabs[name].slice(row - 1, row - 1 + numRows)
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
    insertSheet: (n: string) => { tabs[n] = []; return sheet(n); },
  };
}

let cache: Map<string, string>;

function load(tabs: Record<string, Tab>, props: Record<string, string> = {}) {
  drive = new Map();
  folders = [];
  cache = new Map();
  const store: Record<string, string> = { PIN_PEPPER: 'test-pepper', ...props };

  const sandbox: Record<string, unknown> = {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => store[k] ?? null,
        setProperty: (k: string, v: string) => { store[k] = v; },
        deleteProperty: (k: string) => { delete store[k]; },
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k: string) => (cache.has(k) ? cache.get(k)! : null),
        put: (k: string, v: string) => { cache.set(k, v); },
        remove: (k: string) => { cache.delete(k); },
      }),
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => fakeBook(tabs),
      openById: () => fakeBook(tabs),
      flush: () => {},
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ContentService: {
      MimeType: { TEXT: 'text' },
      createTextOutput: (s: string) => ({ setMimeType: () => JSON.parse(s) }),
    },
    UrlFetchApp: {
      /* Reading bytes goes to the REST endpoint with the script's own token, because
         `alt=media` is not reachable through the advanced service. */
      fetch: (fetchUrl: string) => {
        const id = decodeURIComponent((/files\/([^?]+)/.exec(fetchUrl) ?? [])[1] ?? '');
        if (!drive.has(id)) return { getResponseCode: () => 404, getBlob: () => null };
        const f = drive.get(id)!;
        return {
          getResponseCode: () => 200,
          getBlob: () => ({ getContentType: () => f.mime, getBytes: () => f.bytes }),
        };
      },
    },
    ScriptApp: { getOAuthToken: () => 'ya29.fake' },
    /*
     * The Drive ADVANCED SERVICE, not `DriveApp`. The real one demands the full `drive` scope
     * for `createFolder` — read and write every file in the owner's account — from a script
     * that answers ANYONE_ANONYMOUS. This fake exposes nothing that could enumerate a Drive,
     * which is the property the production code is choosing.
     */
    Drive: {
      Files: {
        create: (
          meta: { name: string; mimeType?: string; parents?: string[] },
          blob?: { getBytes: () => number[]; getContentType: () => string } | null,
        ) => {
          if (meta.mimeType === 'application/vnd.google-apps.folder') {
            folders.push(meta.name);
            return { id: 'folder-1' };
          }
          const id = `file-${drive.size + 1}`;
          drive.set(id, {
            name: meta.name,
            bytes: blob ? blob.getBytes() : [],
            mime: blob ? blob.getContentType() : 'application/octet-stream',
            trashed: false,
          });
          return { id };
        },
        get: (id: string) => {
          if (id === 'folder-1') return { id, trashed: false };
          if (!drive.has(id)) throw new Error('gone');
          return { id, trashed: drive.get(id)!.trashed };
        },
        update: (patch: { trashed?: boolean }, id: string) => {
          if (!drive.has(id)) throw new Error('gone');
          if (patch.trashed != null) drive.get(id)!.trashed = patch.trashed;
          return { id };
        },
      },
    },
    Utilities: {
      getUuid: () => randomUUID(),
      base64Decode: (s: string) => [...Buffer.from(s, 'base64')],
      base64Encode: (b: number[]) => Buffer.from(b).toString('base64'),
      newBlob: (bytes: number[], mime: string, name: string) => ({
        getBytes: () => bytes, getContentType: () => mime, getName: () => name,
      }),
    },
  };

  const src = ['auth.gs', 'sheets.gs', 'roster.gs', 'devices.gs', 'clerk.gs', 'photos.gs', 'Code.gs']
    .map((f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'))
    .join('\n;\n');
  return new Function(
    ...Object.keys(sandbox),
    `${src}; return { handlePutPhoto, handleListPhotos, handleGetPhoto, handleDeletePhoto,
       photoFolderId, REQUIRED_TABS };`,
  )(...Object.values(sandbox));
}

const PHOTO_HEADER = ['photoId', 'itemId', 'driveFileId', 'takenTs', 'width', 'height', 'bytes', 'caption'];
const freshTabs = (): Record<string, Tab> => ({
  Photos: [PHOTO_HEADER.slice()],
  AdminLog: [['ts', 'who', 'action', 'detail']],
});

/** A live PIN session, seeded the way the other suites do. */
const SESSION = 'sess-photo-1';
function withSession(tabs: Record<string, Tab>) {
  /* The roster lives in Script Properties, never in the sheet — "no putting pin and password
     on google sheet". `requireSession` re-reads it on EVERY call, so a token alone is not
     enough: revoking somebody has to bite before their hour is up. */
  const api = load(tabs, {
    USERS: JSON.stringify([{ userId: 'USR-1', name: 'Budi', role: 'anggota', type: 'marbot' }]),
  });
  cache.set(`session:${SESSION}`, JSON.stringify({
    userId: 'USR-1', name: 'Budi', role: 'anggota', kind: 'phone', exp: Date.now() + 3_600_000,
  }));
  return api;
}

const ONE_PIXEL = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');

describe('a photo is not public', () => {
  it('refuses to store one without a session', () => {
    const api = load(freshTabs());
    const r = api.handlePutPhoto({ itemId: 'ITM-1', dataBase64: ONE_PIXEL });
    expect(r.ok).toBe(false);
  });

  it('refuses to serve one without a session', () => {
    // The whole reason bytes come back through this script rather than as a Drive link: a
    // link-public folder would put every photo behind a world-readable URL (§12.4).
    const api = load(freshTabs());
    expect(api.handleGetPhoto({ photoId: 'PH-1' }).ok).toBe(false);
  });

  it('never makes the Drive folder shareable, and never asks for the whole Drive', () => {
    // `DriveApp` is absent from this sandbox entirely: reaching for it — which would demand
    // the full `drive` scope on a publicly-callable script — throws rather than passing.
    const api = load(freshTabs());
    api.photoFolderId();
    expect(folders).toEqual(['BRT Inventaris — Foto']);
  });
});

describe('storing one', () => {
  let api: ReturnType<typeof load>;
  let tabs: Record<string, Tab>;
  beforeEach(() => { tabs = freshTabs(); api = withSession(tabs); });

  it('puts the bytes in Drive and the JOIN in the sheet', () => {
    // The register stays readable without touching Drive at all — a photo is found by reading
    // a sheet, like everything else here.
    const r = api.handlePutPhoto({
      session: SESSION, itemId: 'ITM-1', dataBase64: ONE_PIXEL, mimeType: 'image/jpeg',
      width: 800, height: 600, bytes: 4,
    });
    expect(r.ok).toBe(true);
    expect(drive.size).toBe(1);
    expect(tabs.Photos).toHaveLength(2);
    expect(tabs.Photos[1][1]).toBe('ITM-1');
  });

  it('enforces the per-item ceiling as a RULE, not as advice', () => {
    // Only the gateway can count without a race: a check in the UI is two devices
    // photographing the same shelf into seven rows.
    for (let i = 0; i < 6; i += 1) {
      expect(api.handlePutPhoto({ session: SESSION, itemId: 'ITM-1', dataBase64: ONE_PIXEL }).ok).toBe(true);
    }
    expect(api.handlePutPhoto({ session: SESSION, itemId: 'ITM-1', dataBase64: ONE_PIXEL }))
      .toMatchObject({ ok: false, error: 'too_many' });
  });

  it('counts per item, so a full shelf does not block the next one', () => {
    for (let i = 0; i < 6; i += 1) api.handlePutPhoto({ session: SESSION, itemId: 'ITM-1', dataBase64: ONE_PIXEL });
    expect(api.handlePutPhoto({ session: SESSION, itemId: 'ITM-2', dataBase64: ONE_PIXEL }).ok).toBe(true);
  });

  it('refuses something far too big rather than timing out', () => {
    const huge = 'A'.repeat(9 * 1024 * 1024);
    expect(api.handlePutPhoto({ session: SESSION, itemId: 'ITM-1', dataBase64: huge }))
      .toMatchObject({ ok: false, error: 'too_large' });
  });
});

describe('reading them back', () => {
  let api: ReturnType<typeof load>;
  let tabs: Record<string, Tab>;
  beforeEach(() => { tabs = freshTabs(); api = withSession(tabs); });

  it('lists metadata only — a list screen must not pull megabytes', () => {
    api.handlePutPhoto({ session: SESSION, itemId: 'ITM-1', dataBase64: ONE_PIXEL, bytes: 4 });
    const r = api.handleListPhotos({ session: SESSION, itemId: 'ITM-1' });
    expect(r.photos).toHaveLength(1);
    expect(JSON.stringify(r)).not.toContain(ONE_PIXEL);
  });

  it('returns the bytes for one', () => {
    const put = api.handlePutPhoto({ session: SESSION, itemId: 'ITM-1', dataBase64: ONE_PIXEL });
    const got = api.handleGetPhoto({ session: SESSION, photoId: put.photo.photoId });
    expect(got.dataBase64).toBe(ONE_PIXEL);
  });

  it('says which thing is missing when the file was deleted in Drive by hand', () => {
    const put = api.handlePutPhoto({ session: SESSION, itemId: 'ITM-1', dataBase64: ONE_PIXEL });
    drive.clear();
    expect(api.handleGetPhoto({ session: SESSION, photoId: put.photo.photoId }))
      .toMatchObject({ ok: false, error: 'file_missing' });
  });
});

describe('deleting one', () => {
  it('takes the row AND the file', () => {
    const tabs = freshTabs();
    const api = withSession(tabs);
    const put = api.handlePutPhoto({ session: SESSION, itemId: 'ITM-1', dataBase64: ONE_PIXEL });

    expect(api.handleDeletePhoto({ session: SESSION, photoId: put.photo.photoId }).ok).toBe(true);
    expect(tabs.Photos).toHaveLength(1);
    expect([...drive.values()][0].trashed).toBe(true);
  });

  it('still removes the row when the file is already gone', () => {
    // Otherwise the list keeps offering a photo that cannot be fetched, which is worse than
    // the orphaned file this leaves behind.
    const tabs = freshTabs();
    const api = withSession(tabs);
    const put = api.handlePutPhoto({ session: SESSION, itemId: 'ITM-1', dataBase64: ONE_PIXEL });
    drive.clear();
    expect(api.handleDeletePhoto({ session: SESSION, photoId: put.photo.photoId }).ok).toBe(true);
    expect(tabs.Photos).toHaveLength(1);
  });
});

describe('the sheet knows about the tab', () => {
  it('lists Photos among the required tabs, so checkSpreadsheet catches a missing one', () => {
    const api = load(freshTabs());
    expect(Object.keys(api.REQUIRED_TABS)).toContain('Photos');
  });
});
