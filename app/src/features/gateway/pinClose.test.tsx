// When the keypad is allowed to go away.
//
// Reported from live use: "kenapa waktu mengambil dan memeriksa PIN sangat lama stuck di PIN
// entry keypad?" — and it was, for as long as the append took. Apps Script's start-up is the
// floor here and was measured between 1.6 and 41 seconds on the live gateway, so the wait is
// real and is not going away. What was ours was leaving the PIN pad on screen through all of
// it: the pad asks one question, "who is this", and a session token is that question answered.
// Everything after it is the register's business, and the progress bar and the receipt already
// report it.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@octanejs/testing-library';
import { App } from '../../App';
import { saveConnection } from '../../state/connection';

const GW = 'https://script.google.com/macros/s/AAA/exec';
const SECRET = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee-ffff';

const register = {
  ok: true,
  state: {
    tier: 'public',
    rev: 1,
    serverTs: new Date().toISOString(),
    categories: [{ categoryId: 'CAT-1', name: 'Kebersihan', order: 1, active: true }],
    locations: [],
    items: [{
      itemId: 'ITM-0001', barcode: 'ALQ-ITM-0001', name: 'Sabun cuci tangan',
      categoryId: 'CAT-1', kind: 'consumable', unit: 'botol',
      trackBy: 'quantity', minStock: '', active: true,
    }],
    stock: [{ itemId: 'ITM-0001', locationId: '', initialStock: 9 }],
    instances: [],
    txns: [],
  },
};

const session = {
  ok: true,
  session: {
    token: 'sesi-1', actorUserId: 'usr-1', actorName: 'Budi',
    role: 'anggota', kind: 'device', expiresInMs: 60_000,
  },
};

/** Holds the append open, the way a cold Apps Script deployment does. */
function harness() {
  let release: (() => void) | null = null;
  const fetchMock = vi.fn(async (input: unknown, init?: { body?: unknown }) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const op = String(body.op ?? String(input).split('op=')[1] ?? 'state');
    if (op === 'openSession') return new Response(JSON.stringify(session));
    if (op === 'append') {
      return new Promise<Response>((resolve) => {
        release = () => resolve(new Response(JSON.stringify({ ok: true, appended: [] })));
      });
    }
    return new Response(JSON.stringify(register));
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, releaseAppend: () => release?.() };
}

/** Item page → Ambil → qty → Simpan → the PIN pad. */
async function toKeypad(r: ReturnType<typeof render>) {
  await vi.waitFor(() => expect(r.getByText('Sabun cuci tangan')).toBeTruthy());
  fireEvent.click(r.getByRole('button', { name: 'Ambil barang' }));
  await vi.waitFor(() => expect(r.getByRole('button', { name: /Simpan/ })).toBeTruthy());
  fireEvent.click(r.getByRole('button', { name: /Simpan/ }));
  await vi.waitFor(() => expect(r.getByText('Masukkan PIN')).toBeTruthy());
  for (const d of '1234') fireEvent.click(r.getByRole('button', { name: d }));
  fireEvent.click(r.getByRole('button', { name: /Lanjut/ }));
}

beforeEach(() => { localStorage.clear(); location.hash = '#/barang?i=ITM-0001'; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); location.hash = '#/'; });

describe('the PIN pad', () => {
  it('closes as soon as the session opens, not when the append lands', async () => {
    const { fetchMock, releaseAppend } = harness();
    saveConnection(GW, SECRET);
    const r = render(App);
    await toKeypad(r);

    // The append is in flight and deliberately unanswered — the slow case, held open.
    await vi.waitFor(() => expect(
      fetchMock.mock.calls.some((c) => String(c[1]?.body ?? '').includes('"op":"append"')),
    ).toBe(true));
    await vi.waitFor(() => expect(r.queryByText('Masukkan PIN')).toBeNull());

    // And the wait is still reported, so "closed" does not read as "done".
    expect(r.getByLabelText(/Menyimpan catatan/)).toBeTruthy();

    releaseAppend();
    await vi.waitFor(() => expect(r.getByText(/Tercatat/)).toBeTruthy());
  });

  it('comes BACK when the refusal is one only a PIN can answer', async () => {
    const fetchMock = vi.fn(async (input: unknown, init?: { body?: unknown }) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const op = String(body.op ?? String(input).split('op=')[1] ?? 'state');
      if (op === 'openSession') return new Response(JSON.stringify(session));
      // The gateway forgot the session between opening it and being handed it — rare, and the
      // one failure whose fix really is to type the PIN again.
      if (op === 'append') return new Response(JSON.stringify({ ok: false, error: 'session_expired' }));
      return new Response(JSON.stringify(register));
    });
    vi.stubGlobal('fetch', fetchMock);
    saveConnection(GW, SECRET);
    const r = render(App);
    await toKeypad(r);

    await vi.waitFor(() => expect(r.getByText('Masukkan PIN')).toBeTruthy());
    // With the reason on it, rather than an empty pad that looks like the first tap did nothing.
    await vi.waitFor(() => expect(r.getByText(/Masukkan PIN lagi/i)).toBeTruthy());
  });
});
