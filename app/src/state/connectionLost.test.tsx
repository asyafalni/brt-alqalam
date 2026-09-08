// A connection that goes missing must not look like a working one.
//
// Every screen renders from `draft`, and with no connection that is this device's own stock-take
// copy — full-looking, plausible, months old, under exactly the same headings as the register.
// Somebody would act on it. This is the same mistake as showing "none" for withheld data or "no
// data" for data still loading, and it is the worst of the three because the numbers look right.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@octanejs/testing-library';
import { App } from '../App';
import { clearConnection, connectionLost, saveConnection } from './connection';

const GW = 'https://script.google.com/macros/s/AAA/exec';

beforeEach(() => { localStorage.clear(); location.hash = '#/'; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); location.hash = '#/'; });

describe('remembering that a device was connected', () => {
  it('is false for a device that never connected', () => {
    expect(connectionLost(null)).toBe(false);
  });

  it('is false while it is still connected', () => {
    const c = saveConnection(GW);
    expect(connectionLost(c)).toBe(false);
  });

  it('is TRUE when the connection object vanishes on its own', () => {
    saveConnection(GW);
    // What a cleared browser storage looks like — the connection gone, the note surviving,
    // which is exactly the pairing this exists to detect.
    localStorage.removeItem('brt.gateway.connection');
    expect(connectionLost(null)).toBe(true);
  });

  it('is false after a DELIBERATE disconnect — that is a choice, not a loss', () => {
    saveConnection(GW);
    clearConnection();
    expect(connectionLost(null)).toBe(false);
  });
});

describe('what the screen shows', () => {
  it('replaces the register rather than rendering the local draft under the same headings', async () => {
    saveConnection(GW);
    localStorage.removeItem('brt.gateway.connection');
    // A draft with real-looking content, which is what makes the silent fallback dangerous.
    localStorage.setItem('brt.stocktake.draft.v6', JSON.stringify({
      items: [{
        itemId: 'itm-1', barcode: '', name: 'Sabun cuci', categoryId: 'cat-1',
        kind: 'consumable', unit: 'botol', trackBy: 'quantity', minStock: 2, active: true,
      }],
      categories: [{ categoryId: 'cat-1', name: 'Kebersihan', order: 1, active: true }],
      locations: [], stock: [], txns: [], requests: [],
    }));

    const r = render(App);
    await vi.waitFor(() => expect(r.getByText(/Sambungan ke spreadsheet hilang/)).toBeTruthy());
    // The stale item must not be on screen at all.
    expect(r.queryByText('Sabun cuci')).toBeNull();
  });

  it('offers the way back, and says the queue is safe', async () => {
    saveConnection(GW);
    localStorage.removeItem('brt.gateway.connection');
    const r = render(App);
    await vi.waitFor(() => expect(r.getByRole('button', { name: /Sambungkan lagi/ })).toBeTruthy());
    expect(r.getByText(/belum terkirim tetap aman/)).toBeTruthy();
  });

  it('leaves a never-connected device alone — that is the stock-take, not a fault', async () => {
    const r = render(App);
    await vi.waitFor(() => expect(r.queryByText(/Sambungan ke spreadsheet hilang/)).toBeNull());
  });
});
