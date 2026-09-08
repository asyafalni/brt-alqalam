import { describe, it, expect, vi } from 'vitest';
import {
  append, closeSession, fetchState, GatewayError, openSession, readState,
} from './gateway';

const URL = 'https://script.google.com/macros/s/X/exec';
const reply = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body)));
const raw = (text: string) => vi.fn(async () => new Response(text));

describe('reading the register', () => {
  it('turns the gateway\'s string rows into domain types', () => {
    // The gateway hands back what the sheet holds: everything is a string, and the keys are
    // camelCase while every builder reads lowercase.
    const s = readState({
      items: [{ itemId: 'ITM-1', barcode: 'ALQ-1', name: 'Sabun', categoryId: 'CAT-K',
        kind: 'Bisa habis', unit: 'galon', trackBy: '', minStock: '5', active: 'TRUE' }],
      stock: [{ itemId: 'ITM-1', locationId: 'LOC-A1', initialStock: '12' }],
      serverTs: '2026-09-08T00:00:00Z',
      tier: 'public',
    });
    expect(s.items[0]).toMatchObject({ itemId: 'ITM-1', kind: 'consumable', minStock: 5 });
    expect(s.stock[0]).toEqual({ itemId: 'ITM-1', locationId: 'LOC-A1', initialStock: 12 });
  });

  it('accepts the plain-language values an admin actually types', () => {
    // Part XI: the sheet is edited by people, and `Bisa habis` is what they write.
    const s = readState({ items: [{ itemId: 'I', barcode: 'B', name: 'N', categoryId: 'C',
      kind: 'Barang tetap', unit: 'buah', trackBy: '', minStock: '', active: 'TRUE' }] });
    expect(s.items[0]).toMatchObject({ kind: 'equipment', trackBy: 'instance' });
  });

  it('quarantines a bad row and says which tab it was in, rather than dropping it', () => {
    // A hand-edited sheet is a hostile data source (§58.8). Silently skipping a row is how
    // somebody finds out months later, from the shelf.
    const s = readState({ items: [
      { itemId: 'ITM-1', barcode: 'B', name: 'Sabun', categoryId: 'C', kind: 'Bisa habis',
        unit: 'galon', trackBy: '', minStock: '', active: 'TRUE' },
      { itemId: 'ITM-2', barcode: 'B', name: 'Rusak', categoryId: 'C', kind: 'entah apa',
        unit: 'galon', trackBy: '', minStock: '', active: 'TRUE' },
    ] });
    expect(s.items).toHaveLength(1);
    expect(s.quarantined[0]).toMatchObject({ tab: 'items' });
    expect(s.quarantined[0].issues[0].field).toBe('kind');
  });

  it('takes the time from the SERVER, not the device', () => {
    // The 24-hour rule and the ordering of the whole log rest on it; a tablet with a wrong
    // clock would corrupt both without anything looking wrong.
    expect(readState({ serverTs: '2026-09-08T00:00:00Z' }).serverTs)
      .toBe(Date.parse('2026-09-08T00:00:00Z'));
  });

  it('asks for the detailed tier only when it has a session', async () => {
    const f = reply({ ok: true, state: { tier: 'detailed' } });
    await fetchState(URL, 'tok-1', f);
    expect(String(f.mock.calls[0][0])).toContain('op=stateDetailed');
    expect(String(f.mock.calls[0][0])).toContain('session=tok-1');

    const g = reply({ ok: true, state: { tier: 'public' } });
    await fetchState(URL, undefined, g);
    expect(String(g.mock.calls[0][0])).toContain('op=state');
  });
});

describe('talking to Apps Script at all', () => {
  it('sends a CORS simple request — text/plain, no custom headers', async () => {
    // Not a style choice: Apps Script has no `doOptions` and `TextOutput` cannot set headers,
    // so a preflighted request can never be answered. Getting this wrong is unfixable later.
    const f = reply({ ok: true, session: { token: 't' } });
    await openSession(URL, 'secret', '1234', f);
    const init = f.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('text/plain');
    expect(Object.keys(init.headers as object)).toEqual(['Content-Type']);
    expect(JSON.parse(String(init.body))).toMatchObject({ op: 'openSession' });
  });

  it('reads failure from the BODY, because every reply is HTTP 200', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'invalid_pin' }), { status: 200 }));
    await expect(openSession(URL, 's', '9999', f)).rejects.toMatchObject({ code: 'invalid_pin' });
  });

  it('names the sign-in-page trap when HTML comes back', async () => {
    // `access: ANYONE` instead of ANYONE_ANONYMOUS returns a Google login page with HTTP 200 —
    // a success response full of HTML, which otherwise reads as a bug in our own code.
    await expect(fetchState(URL, undefined, raw('<!DOCTYPE html><html>...')))
      .rejects.toMatchObject({ code: 'not-json' });
  });

  it('calls a dead network offline rather than letting the throw escape raw', async () => {
    const f = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    await expect(fetchState(URL, undefined, f)).rejects.toMatchObject({ code: 'offline' });
  });
});

describe('appending', () => {
  const entry = { clientTxnId: 'C1', type: 'pemakaian', itemId: 'ITM-1', locationId: 'LOC-A1', qtyDelta: -1 };
  const stored = {
    txnId: 'T1', clientTxnId: 'C1', ts: '2026-09-08T00:00:00Z', type: 'pemakaian',
    itemId: 'ITM-1', assetId: '', locationId: 'LOC-A1', qtyDelta: '-1', recipient: '',
    actorUserId: 'USR-1', condition: '', note: '', toStatus: '', reversesTxnId: '',
  };

  it('sends the rack a movement came off', async () => {
    // It was dropped by the gateway once, and every withdrawal landed on the unplaced pile.
    const f = reply({ ok: true, appended: [stored], duplicates: [] });
    await append(URL, 'tok', [entry], f);
    expect(JSON.parse(String((f.mock.calls[0][1] as RequestInit).body)).entries[0].locationId)
      .toBe('LOC-A1');
  });

  it('reports a replay as a duplicate, not as a failure', async () => {
    const f = reply({ ok: true, appended: [], duplicates: ['C1'] });
    await expect(append(URL, 'tok', [entry], f)).resolves
      .toEqual({ appended: [], duplicates: ['C1'] });
  });

  it('refuses a reply that says ok but carries no appended array', async () => {
    // Seen once in ~25 posts against the live gateway: a POST answered with the whole public
    // state. Unreproducible after twelve attempts, so no cause is claimed — but treating it as
    // success would silently lose a movement, and a retry is safe because the gateway
    // de-duplicates on clientTxnId.
    const f = reply({ ok: true, state: { tier: 'public', items: [] } });
    await expect(append(URL, 'tok', [entry], f)).rejects
      .toMatchObject({ code: 'unexpected-reply' });
  });

  it('does not call the network for an empty batch', async () => {
    const f = reply({ ok: true, appended: [] });
    await expect(append(URL, 'tok', [], f)).resolves.toEqual({ appended: [], duplicates: [] });
    expect(f).not.toHaveBeenCalled();
  });

  it('closes a session', async () => {
    const f = reply({ ok: true });
    await closeSession(URL, 'tok', f);
    expect(JSON.parse(String((f.mock.calls[0][1] as RequestInit).body)))
      .toEqual({ op: 'closeSession', session: 'tok' });
  });

  it('is a GatewayError, so a caller can branch on the code', () => {
    expect(new GatewayError('offline')).toBeInstanceOf(Error);
  });
});

describe('the public tier is a different projection, not a lesser copy', () => {
  const row = {
    txnId: 'T1', clientTxnId: 'C1', ts: '2026-09-08T00:00:00Z', type: 'pemakaian',
    itemId: 'ITM-1', locationId: 'LOC-A1', qtyDelta: '-1',
  };

  it('reads a transaction that has had its actor stripped', () => {
    // §39 removes `actorUserId` for unauthenticated readers, and `buildTxn` requires one. Fed
    // the public tier the strict builder quarantined EVERY transaction, and the dashboard would
    // have shown an empty masjid. Found by pointing the adapter at the real gateway.
    const s = readState({ txns: [row], tier: 'public' });
    expect(s.txns).toHaveLength(1);
    expect(s.quarantined).toEqual([]);
    expect(s.txns[0].actorUserId).toBe('WITHHELD');
  });

  it('still demands an actor on the detailed tier', () => {
    // There, a row with no actor is a real defect and must not pass quietly.
    const s = readState({ txns: [row], tier: 'detailed' });
    expect(s.txns).toEqual([]);
    expect(s.quarantined[0].issues[0].field).toBe('actoruserid');
  });

  it('keeps a real actor when the detailed tier supplies one', () => {
    const s = readState({ txns: [{ ...row, actorUserId: 'USR-1' }], tier: 'detailed' });
    expect(s.txns[0].actorUserId).toBe('USR-1');
  });
});
