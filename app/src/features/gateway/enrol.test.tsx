// Enrolling a phone from the admin's QR.
//
// This is the only credential the app ever puts on screen or in a URL, so the tests are about
// what must NOT happen: a secret left in the address bar, a code accepted without being checked,
// a revoked phone let in anyway.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@octanejs/testing-library';
import { App } from '../../App';
import { parseRoute, routeToHash } from '../../state/route';

const GW = 'https://script.google.com/macros/s/AAA/exec';
const SECRET = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee-ffff';

const state = {
  ok: true,
  state: {
    tier: 'public', rev: 1, serverTs: new Date().toISOString(),
    categories: [], locations: [], items: [], stock: [], instances: [], txns: [],
  },
};

/** The gateway's reply to the setup probe: a deliberately impossible PIN. */
const refusePin = { ok: false, error: 'invalid_pin' };

function stub(...replies: unknown[]) {
  const f = vi.fn();
  replies.forEach((r) => f.mockResolvedValueOnce(new Response(JSON.stringify(r))));
  f.mockResolvedValue(new Response(JSON.stringify(state)));
  vi.stubGlobal('fetch', f);
  return f;
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); location.hash = '#/'; });

describe('the enrolment link', () => {
  it('carries the gateway address as well as the secret', () => {
    // A marbot's phone has never opened this app; a secret alone would still leave them typing
    // a 120-character Apps Script URL.
    const hash = routeToHash({ name: 'daftar', gateway: GW, secret: SECRET });
    expect(parseRoute(hash)).toEqual({ name: 'daftar', gateway: GW, secret: SECRET });
  });

  it('is not a route at all when half of it is missing', () => {
    expect(parseRoute('#/daftar?g=' + encodeURIComponent(GW)).name).toBe('beranda');
    expect(parseRoute('#/daftar?s=' + SECRET).name).toBe('beranda');
  });
});

describe('scanning it', () => {
  it('connects the device without anything being typed', async () => {
    stub(state, refusePin);
    location.hash = routeToHash({ name: 'daftar', gateway: GW, secret: SECRET });
    const r = render(App);
    await vi.waitFor(() => expect(r.getByText(/Perangkat ini siap/)).toBeTruthy());

    const saved = JSON.parse(localStorage.getItem('brt.gateway.connection') ?? '{}');
    expect(saved).toMatchObject({ url: GW, deviceSecret: SECRET });
  });

  it('CHECKS the secret rather than trusting the QR', async () => {
    const f = stub(state, refusePin);
    location.hash = routeToHash({ name: 'daftar', gateway: GW, secret: SECRET });
    render(App);
    await vi.waitFor(() => expect(f.mock.calls.length).toBeGreaterThan(1));
    const probe = JSON.parse(String(f.mock.calls[1][1].body));
    expect(probe).toMatchObject({ op: 'openSession', deviceSecret: SECRET });
    // An impossible PIN, so nobody has to type a real one into a setup screen.
    expect(probe.pin).toBe('000000000');
  });

  it('refuses a revoked code, at setup rather than at a shelf', async () => {
    stub(state, { ok: false, error: 'device_not_enrolled' });
    location.hash = routeToHash({ name: 'daftar', gateway: GW, secret: SECRET });
    const r = render(App);
    await vi.waitFor(() => expect(r.getByText(/Tidak bisa mendaftar/)).toBeTruthy());
    expect(r.getByText(/sudah tidak berlaku/)).toBeTruthy();
    expect(localStorage.getItem('brt.gateway.connection')).toBeNull();
  });

  it('saves nothing when the address answers a login page', async () => {
    const f = vi.fn(async () => new Response('<!DOCTYPE html><html>'));
    vi.stubGlobal('fetch', f);
    location.hash = routeToHash({ name: 'daftar', gateway: GW, secret: SECRET });
    const r = render(App);
    await vi.waitFor(() => expect(r.getByText(/Tidak bisa mendaftar/)).toBeTruthy());
    expect(localStorage.getItem('brt.gateway.connection')).toBeNull();
  });
});
