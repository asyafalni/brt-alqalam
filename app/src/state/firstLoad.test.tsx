// "Nothing here" and "not here yet" are different facts, and this is the third time that
// distinction has cost something in this app.
//
// A connected device renders every screen from `draft`, and until the gateway answers the
// fallback is the LOCAL draft — which on a connected tablet is empty. So the dashboard said
// "Belum ada data" and offered to load demo rows, while the register was still in flight: a
// screen telling somebody their masjid owns nothing, with a button that would make it worse.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@octanejs/testing-library';
import { App } from '../App';

const GW = 'https://script.google.com/macros/s/AAA/exec';

/** A fetch that never settles — exactly the state this screen exists for. */
const hang = () => new Promise<Response>(() => {});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('brt.gateway.connection', JSON.stringify({ url: GW, connectedTs: 1 }));
  location.hash = '#/';
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); location.hash = '#/'; });

describe('while the register is still arriving', () => {
  it('says it is loading instead of saying the masjid owns nothing', () => {
    vi.stubGlobal('fetch', vi.fn(hang));
    const r = render(App);
    expect(r.getByText(/Memuat register/)).toBeTruthy();
    expect(r.queryByText(/Belum ada data/)).toBeNull();
  });

  it('does not offer to load demo rows over a register that is on its way', () => {
    vi.stubGlobal('fetch', vi.fn(hang));
    const r = render(App);
    expect(r.queryByText(/Muat contoh data/)).toBeNull();
  });

  it('shows a progress indicator, not just words', () => {
    vi.stubGlobal('fetch', vi.fn(hang));
    const r = render(App);
    expect(r.container.querySelector('.progress-indeterminate')).toBeTruthy();
    expect(r.container.querySelector('.animate-spin')).toBeTruthy();
  });
});

describe('when the first read fails', () => {
  it('says so and offers a retry rather than an empty catalog', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('nope'))));
    const r = render(App);
    await vi.waitFor(() => expect(r.getByText(/Tidak bisa memuat register/)).toBeTruthy());
    expect(r.getByRole('button', { name: /Coba lagi/ })).toBeTruthy();
    expect(r.queryByText(/Belum ada data/)).toBeNull();
  });
});

describe('a device that was never connected', () => {
  it('shows the ordinary empty state — there is nothing in flight to wait for', () => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(hang));
    const r = render(App);
    expect(r.queryByText(/Memuat register/)).toBeNull();
    expect(r.getByText(/Belum ada data/)).toBeTruthy();
  });
});

describe('opening the app a second time', () => {
  /*
   * Apps Script's floor is its own start-up — 1.3–2.5s measured live for a call that touches no
   * sheet — so the read cannot be made faster. What changed is whether anybody has to watch it:
   * the last register is painted at once, the fresh copy is already in flight, and the progress
   * bar says so the whole time.
   */
  const emptyState = () => ({
    categories: [], locations: [], items: [], stock: [], instances: [], requests: [], txns: [],
    serverTs: 0, tier: 'public', rev: 1, quarantined: [],
  });

  it('shows the last register instead of a loading screen', () => {
    vi.stubGlobal('fetch', vi.fn(hang));
    localStorage.setItem('brt.register.cache', JSON.stringify({
      url: GW,
      fetchedTs: Date.now(),
      state: {
        ...emptyState(),
        items: [{
          itemId: 'ITM-0001', barcode: 'ALQ-ITM-0001', name: 'Sabun cuci',
          categoryId: 'CAT-KEBERSIHAN', kind: 'consumable', unit: 'botol',
          trackBy: 'quantity', minStock: null, active: true,
        }],
        stock: [{ itemId: 'ITM-0001', locationId: '', initialStock: 4 }],
      },
    }));

    const r = render(App);
    expect(r.queryByText(/Memuat register/)).toBeNull();
    /* And the dashboard rendered from the CACHE, not from the empty local draft — which would
       show the very "belum ada data" screen this whole file exists to prevent. */
    expect(r.queryByText(/Belum ada barang/)).toBeNull();
    expect(r.getByText(/Jenis barang/)).toBeTruthy();
  });

  it('still waits when the cache belongs to another gateway', () => {
    // A reconnect to a different sheet must not paint the old masjid's register.
    vi.stubGlobal('fetch', vi.fn(hang));
    localStorage.setItem('brt.register.cache', JSON.stringify({
      url: 'https://script.google.com/macros/s/OTHER/exec',
      fetchedTs: Date.now(),
      state: emptyState(),
    }));

    expect(render(App).getByText(/Memuat register/)).toBeTruthy();
  });
});
