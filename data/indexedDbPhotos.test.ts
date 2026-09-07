import { describe, it, expect, vi } from 'vitest';
import { createIndexedDbPhotoStore, fitWithin } from './indexedDbPhotos';
import { PhotoStoreError } from './photoStore';

// WHAT IS AND IS NOT COVERED HERE, stated plainly rather than left to be discovered.
//
// This package's vitest runs in plain Node: there is no `indexedDB`, no `createImageBitmap`
// and no `OffscreenCanvas` (verified — `data/package.json` pulls in no DOM environment, and
// the brief forbids adding one). So the two halves of the adapter that need a browser — the
// actual read/write round trip through IndexedDB, and the resize/re-encode pipeline — CANNOT
// be exercised here, and no test below pretends to.
//
// UNTESTED, and it should stay on the record: storing and reading back a blob; the itemId
// index; the in-transaction MAX_PHOTOS_PER_ITEM check and its abort; QuotaExceededError
// classification; `url()` producing a working object URL; and every line of `downscale`,
// including the OffscreenCanvas-to-<canvas> fallback and the "keep the smaller of the two"
// branch. Those need a real browser (or `fake-indexeddb` plus a canvas polyfill, neither of
// which is a dependency of this package) — the honest place to prove them is the app's
// happy-dom suite or a manual pass on the actual tablet.
//
// What IS covered: the pure sizing arithmetic, and the failure the UI is most likely to meet
// and least likely to handle — a device where the photo store simply does not exist.

describe('fitWithin', () => {
  it('scales a phone photo down to the long edge', () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  it('uses the long edge whichever way the photo is turned', () => {
    expect(fitWithin(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('never upscales — a small photo is left exactly as it is', () => {
    expect(fitWithin(900, 600, 1600)).toEqual({ width: 900, height: 600 });
    expect(fitWithin(1600, 1200, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  it('keeps a very wide panorama at least one pixel tall', () => {
    // A zero-height canvas throws; a one-pixel-tall picture is merely useless.
    expect(fitWithin(20000, 40, 1600).height).toBeGreaterThanOrEqual(1);
  });

  it('does not divide by zero on a degenerate image', () => {
    expect(fitWithin(0, 0, 1600)).toEqual({ width: 0, height: 0 });
  });

  it('rounds rather than truncating, so the aspect ratio survives', () => {
    expect(fitWithin(1000, 333, 100)).toEqual({ width: 100, height: 33 });
  });
});

describe('when the browser has no photo store at all', () => {
  // Private browsing, a locked-down profile, or storage disabled. The point of these tests is
  // that the UI gets something it can RENDER — never a silent empty list, and never a raw
  // DOMException with no message worth showing.
  const store = createIndexedDbPhotoStore();

  const failure = async (run: () => Promise<unknown>): Promise<PhotoStoreError> => {
    try {
      await run();
    } catch (e) {
      expect(e).toBeInstanceOf(PhotoStoreError);
      return e as PhotoStoreError;
    }
    throw new Error('expected the call to reject');
  };

  it('reports list() as unavailable instead of returning nothing', async () => {
    const e = await failure(() => store.list('ITM-1'));
    expect(e.code).toBe('unavailable');
    expect(e.message).not.toBe('');
  });

  it('reports put() as unavailable rather than losing the photo quietly', async () => {
    const e = await failure(() => store.put('ITM-1', new Blob(['x'], { type: 'image/jpeg' })));
    expect(e.code).toBe('unavailable');
  });

  it('reports remove() as unavailable', async () => {
    const e = await failure(() => store.remove('ph-1'));
    expect(e.code).toBe('unavailable');
  });

  it('does not cache the failure — a second attempt still tries, so a retry can work', async () => {
    // The usual cause is another tab holding the database open; the user can close it. A
    // cached rejected promise would make the retry impossible without reloading the kiosk.
    await failure(() => store.list('ITM-1'));
    const again = await failure(() => store.list('ITM-1'));
    expect(again.code).toBe('unavailable');
  });
});

describe('revoke', () => {
  const store = createIndexedDbPhotoStore();

  it('releases an object URL', () => {
    const spy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    store.revoke('blob:http://localhost/abc');
    expect(spy).toHaveBeenCalledWith('blob:http://localhost/abc');
    spy.mockRestore();
  });

  it('ignores a remote URL, so the UI can revoke unconditionally on unmount', () => {
    // The caller cannot tell which kind of store handed it the URL, so this must be safe for
    // the https URLs a future Drive-backed store would return.
    const spy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    expect(() => store.revoke('https://drive.google.com/uc?id=abc')).not.toThrow();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('PhotoStoreError', () => {
  it('is a real Error carrying a code the UI can branch on', () => {
    const e = new PhotoStoreError('quota', 'Penyimpanan penuh');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('PhotoStoreError');
    expect(e.code).toBe('quota');
  });
});
