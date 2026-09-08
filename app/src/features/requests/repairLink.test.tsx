// The path a marbot actually takes to report a broken tool.
//
// "Ajukan perbaikan" on the Aset screen navigates to #/pengajuan with the unit prefilled. Once
// that screen became admin-only, the link bounced every non-admin back to Beranda — making it a
// dead button for exactly the people most likely to press it, since the person who FINDS a
// broken knife is a marbot, not somebody with a Clerk password.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@octanejs/testing-library';
import { App } from '../../App';

const GW = 'https://script.google.com/macros/s/AAA/exec';

/** Enough of a register that the app is past its first load. */
const state = {
  ok: true,
  state: {
    tier: 'public',
    rev: 1,
    serverTs: new Date().toISOString(),
    categories: [{ categoryId: 'cat-1', name: 'Kebersihan', order: '1', active: 'TRUE' }],
    locations: [],
    items: [{
      itemId: 'itm-1', barcode: 'ALQ-PISAU', name: 'Pisau potong', categoryId: 'cat-1',
      kind: 'equipment', unit: 'buah', trackBy: 'instance', minStock: '(-)', active: 'TRUE',
      // Instances are DERIVED from the item and its quantity (`instancesFor`), not read from
      // the AssetInstances tab — so the id below is `<barcode>-001`, generated, not stored.
    }],
    stock: [{ itemId: 'itm-1', locationId: '', initialStock: '2' }],
    instances: [],
    txns: [],
  },
};

const ok = () => Promise.resolve(new Response(JSON.stringify(state)));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('brt.gateway.connection',
    JSON.stringify({ url: GW, deviceSecret: 'kode', connectedTs: 1 }));
  vi.stubGlobal('fetch', vi.fn(ok));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); location.hash = '#/'; });

describe('a prefilled repair link, on a device with no admin', () => {
  it('opens the form instead of bouncing to Beranda', async () => {
    location.hash = '#/pengajuan?t=perbaikan&a=ALQ-PISAU-001';
    const r = render(App);
    await vi.waitFor(() => expect(r.getByLabelText('Barang apa?')).toBeTruthy());
  });

  it('names the unit, so the request is not "one of the six knives"', async () => {
    location.hash = '#/pengajuan?t=perbaikan&a=ALQ-PISAU-001';
    const r = render(App);
    await vi.waitFor(() => {
      expect((r.getByLabelText('Barang apa?') as HTMLInputElement).value)
        .toBe('Pisau potong #1');
    });
    expect(r.getByText(/ALQ-PISAU-001/)).toBeTruthy();
  });

  it('opens on Perbaikan, not on Beli baru', async () => {
    location.hash = '#/pengajuan?t=perbaikan&a=ALQ-PISAU-001';
    const r = render(App);
    await vi.waitFor(() => expect(r.getByLabelText('Barang apa?')).toBeTruthy());
    expect(r.getByRole('button', { name: 'Perbaikan' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('lands them back on Aset, where the unit is — not on Beranda', async () => {
    location.hash = '#/pengajuan?t=perbaikan&a=ALQ-PISAU-001';
    const r = render(App);
    await vi.waitFor(() => expect(r.getByLabelText('Barang apa?')).toBeTruthy());
    // Somebody working down a list of broken units should not have to find their place again.
    expect(location.hash).toBe('#/aset');
  });

  it('still keeps the LIST away from them — a bare link goes nowhere', async () => {
    location.hash = '#/pengajuan';
    const r = render(App);
    await vi.waitFor(() => expect(r.queryByLabelText('Barang apa?')).toBeNull());
    // Beranda, not the requests screen.
    expect(r.queryByText(/Yang diminta untuk dibeli atau diperbaiki/)).toBeNull();
  });
});
