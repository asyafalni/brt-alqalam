// The shared photo tier, against a fake gateway.
//
// What matters here is not that a photo round-trips — it is that a photo never leaves through
// a door it should not: no Drive URL, no credential in a query string, and a session read at
// call time rather than captured once.

import { describe, it, expect, vi } from 'vitest';
import { createDrivePhotoStore } from './drivePhotos';
import { PhotoStoreError } from './photoStore';

const URL_ = 'https://script.google.com/macros/s/AKfycbTEST/exec';

const reply = (body: unknown) =>
  vi.fn(async (_url: URL | RequestInfo, _init?: RequestInit) => new Response(JSON.stringify(body), { status: 200 }));

const bodyOf = (f: ReturnType<typeof reply>, n = 0) =>
  JSON.parse(String(f.mock.calls[n][1]?.body));

describe('talking to the gateway at all', () => {
  it('sends a CORS simple request, because nothing can answer a preflight', () => {
    // Apps Script has no `doOptions` and `TextOutput` cannot set headers. Getting this wrong is
    // unfixable later, so it is asserted rather than assumed.
    const f = reply({ ok: true, photos: [] });
    const store = createDrivePhotoStore(URL_, () => 'sess-1', f);
    return store.list('ITM-1').then(() => {
      const init = f.mock.calls[0][1] as RequestInit;
      expect((init.headers as Record<string, string>)['Content-Type']).toBe('text/plain');
      expect(Object.keys(init.headers as object)).toEqual(['Content-Type']);
    });
  });

  it('puts the session in the BODY, never in the URL', async () => {
    // A token in a query string is written into browser history and every log in between.
    const f = reply({ ok: true, photos: [] });
    await createDrivePhotoStore(URL_, () => 'sess-1', f).list('ITM-1');
    expect(String(f.mock.calls[0][0])).not.toContain('sess-1');
    expect(bodyOf(f).session).toBe('sess-1');
  });

  it('reads the session at CALL time, not once at construction', async () => {
    // A session slides and expires. A token captured when the store was made is an hour-old
    // token by the time somebody scrolls to a photo.
    let live = 'first';
    const f = reply({ ok: true, photos: [] });
    const store = createDrivePhotoStore(URL_, () => live, f);
    await store.list('ITM-1');
    live = 'second';
    await store.list('ITM-1');
    expect(bodyOf(f, 1).session).toBe('second');
  });
});

describe('when there is no session', () => {
  it('says what to DO, rather than that the store is unavailable', async () => {
    // "No store here at all" is true and useless to somebody looking at an empty gallery.
    const f = reply({ ok: true, photos: [] });
    const store = createDrivePhotoStore(URL_, () => null, f);
    await expect(store.list('ITM-1')).rejects.toMatchObject({ code: 'unavailable' });
    await expect(store.list('ITM-1')).rejects.toThrow(/PIN/);
    expect(f).not.toHaveBeenCalled();
  });

  it('translates an expired one the same way', async () => {
    const f = reply({ ok: false, error: 'session_expired' });
    const store = createDrivePhotoStore(URL_, () => 'stale', f);
    await expect(store.list('ITM-1')).rejects.toThrow(/PIN/);
  });
});

describe('the gateway\'s refusals become the port\'s', () => {
  const cases: [string, string][] = [
    ['too_many', 'too_many'],
    ['too_large', 'quota'],
    ['not_found', 'not_found'],
    ['file_missing', 'not_found'],
  ];
  for (const [from, to] of cases) {
    it(`maps ${from} to ${to}, so no screen has to know about the gateway`, async () => {
      const f = reply({ ok: false, error: from });
      const store = createDrivePhotoStore(URL_, () => 'sess-1', f);
      await expect(store.remove('PH-1')).rejects.toBeInstanceOf(PhotoStoreError);
      await expect(store.remove('PH-1')).rejects.toMatchObject({ code: to });
    });
  }

  it('calls an unreachable gateway unavailable rather than letting the throw escape', async () => {
    const f = vi.fn(async (_url: URL | RequestInfo, _init?: RequestInit): Promise<Response> => {
      throw new TypeError('Failed to fetch');
    });
    const store = createDrivePhotoStore(URL_, () => 'sess-1', f);
    await expect(store.list('ITM-1')).rejects.toMatchObject({ code: 'unavailable' });
  });
});

describe('what comes back', () => {
  it('is ordered by the domain, not by whatever the sheet returned', async () => {
    const f = reply({ ok: true, photos: [
      { photoId: 'B', itemId: 'ITM-1', takenTs: 200, width: 1, height: 1, bytes: 1 },
      { photoId: 'A', itemId: 'ITM-1', takenTs: 100, width: 1, height: 1, bytes: 1 },
    ] });
    const got = await createDrivePhotoStore(URL_, () => 'sess-1', f).list('ITM-1');
    expect(got.map((p) => p.photoId)).toEqual(['A', 'B']);
  });

  it('never hands out a Drive link — the folder is not shareable and must stay that way', async () => {
    const f = reply({ ok: true, photos: [] });
    await createDrivePhotoStore(URL_, () => 'sess-1', f).list('ITM-1');
    expect(String(f.mock.calls[0][0])).not.toContain('drive.google.com');
  });
});
