import { describe, it, expect } from 'vitest';
import { createGatewayClient, GatewayError } from './gatewayClient';
import type { FetchLike } from './gatewayClient';
import type { SessionToken } from './ports';

const URL_ = 'https://script.google.com/macros/s/AKfy/exec';
const SESSION: SessionToken = { value: 'sess-1', actorUserId: 'USR-1', actorName: 'Budi' };

interface Call { url: string; method?: string; headers?: Record<string, string>; body?: string }

/** Records what was sent, so the transport constraints can be asserted, not assumed. */
function stub(reply: (body: unknown, call: Call) => unknown, opts: { status?: number; raw?: string } = {}) {
  const calls: Call[] = [];
  const fetchLike: FetchLike = async (url, init) => {
    const call: Call = { url, ...init };
    calls.push(call);
    const parsed = init?.body ? JSON.parse(init.body) : undefined;
    const text = opts.raw ?? JSON.stringify(reply(parsed, call));
    return { ok: (opts.status ?? 200) < 400, status: opts.status ?? 200, text: async () => text };
  };
  return { calls, client: createGatewayClient({ url: URL_, deviceSecret: 'dev-secret', fetch: fetchLike }) };
}

const STATE = {
  categories: [{ categoryId: 'CAT-K', name: 'Kebersihan', order: '1', active: 'TRUE' }],
  locations: [{ locationId: 'LOC-A1', code: 'A1', name: 'Rak sabun', zone: 'Gudang', order: '1', active: 'TRUE' }],
  items: [{
    itemId: 'ITM-0001', barcode: 'ALQ-ITM-0001', name: 'Sabun', categoryId: 'CAT-K',
    kind: 'consumable', unit: 'galon', trackBy: 'quantity', minStock: '5', active: 'TRUE',
  }],
  stock: [{ itemId: 'ITM-0001', locationId: 'LOC-A1', initialStock: '12' }],
  instances: [],
  txns: [{
    txnId: 'T1', clientTxnId: 'c1', ts: '2026-09-06T10:00:00.000Z', type: 'pemakaian',
    itemId: 'ITM-0001', assetId: '', qtyDelta: '-2', recipient: '', actorUserId: 'USR-1',
    condition: '', note: '', toStatus: '', reversesTxnId: '',
  }],
};

describe('transport — the constraints Apps Script actually imposes', () => {
  it('posts text/plain and no custom headers, because a preflight cannot be answered', async () => {
    const { calls, client } = stub(() => ({ ok: true, appended: [], duplicates: [] }));
    await client.log.append(SESSION, { clientTxnId: 'c9', direction: 'keluar', qty: 1, itemId: 'ITM-0001' });

    const [call] = calls;
    expect(call.method).toBe('POST');
    expect(call.headers).toEqual({ 'Content-Type': 'text/plain;charset=utf-8' });
    // Anything else here — Authorization, application/json — triggers a preflight that Apps
    // Script has no way to respond to, and the failure carries no useful error.
    expect(Object.keys(call.headers!)).toEqual(['Content-Type']);
  });

  it('names the deployment-access trap when the gateway answers with HTML', async () => {
    const { client } = stub(() => ({}), { raw: '<!DOCTYPE html><html>Sign in to continue' });
    await expect(client.ping()).rejects.toThrow(/Who has access/);
  });

  it('reports a network failure as offline rather than a rejection', async () => {
    const client = createGatewayClient({
      url: URL_, deviceSecret: 'd',
      fetch: async () => { throw new TypeError('Failed to fetch'); },
    });
    await expect(client.ping()).rejects.toMatchObject({ code: 'offline' });
  });

  it('surfaces the gateway error code, not a generic failure', async () => {
    const { client } = stub(() => ({ ok: false, error: 'session_expired' }));
    await expect(client.catalog.load()).rejects.toBeInstanceOf(GatewayError);
    await expect(client.catalog.load()).rejects.toMatchObject({ code: 'session_expired' });
  });
});

describe('reading state', () => {
  it('coerces sheet strings into domain types, exactly as the CSV path does', async () => {
    const { client } = stub(() => ({ ok: true, state: STATE }));
    const snapshot = await client.catalog.load();

    expect(snapshot.issues).toEqual([]);
    expect(snapshot.items[0]).toMatchObject({
      itemId: 'ITM-0001', minStock: 5, active: true, kind: 'consumable',
    });
    // Quantity and placement arrive as their own rows now, one per rack.
    expect(snapshot.stock).toEqual([{ itemId: 'ITM-0001', locationId: 'LOC-A1', initialStock: 12 }]);
    expect(snapshot.categories[0].order).toBe(1);
  });

  it('parses the log with real timestamps and signed deltas', async () => {
    const { client } = stub(() => ({ ok: true, state: STATE }));
    const page = await client.transactions.read();

    expect(page.issues).toEqual([]);
    expect(page.txns[0]).toMatchObject({ type: 'pemakaian', qtyDelta: -2 });
    expect(page.txns[0].ts).toBe(Date.parse('2026-09-06T10:00:00.000Z'));
  });

  it('quarantines a bad row instead of dropping it or poisoning the good ones', async () => {
    const broken = { ...STATE, stock: [...STATE.stock, { itemId: 'ITM-0002', locationId: '', initialStock: 'sepuluh' }] };
    const { client } = stub(() => ({ ok: true, state: broken }));
    const snapshot = await client.catalog.load();

    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.issues).toHaveLength(1);
    expect(snapshot.issues[0].message).toContain('bukan angka');
  });

  it('tolerates a gateway that omits a tab entirely', async () => {
    const { client } = stub(() => ({ ok: true, state: {} }));
    await expect(client.catalog.load()).resolves.toMatchObject({ items: [], issues: [] });
  });
});

describe('opening a session with a PIN', () => {
  it('returns the person the PIN resolved to', async () => {
    const { calls, client } = stub(() => ({
      ok: true, session: { token: 'sess-9', actorUserId: 'USR-2', actorName: 'Siti', role: 'anggota' },
    }));
    const result = await client.auth.open('1234', 'dev-secret');

    expect(result).toMatchObject({ status: 'ok', session: { value: 'sess-9', actorName: 'Siti' } });
    // The PIN travels in the body — there is nowhere else for it to go.
    expect(JSON.parse(calls[0].body!)).toMatchObject({ op: 'openSession', pin: '1234', deviceSecret: 'dev-secret' });
  });

  it('treats a wrong PIN and an unenrolled device the same way the gateway does', async () => {
    for (const error of ['invalid_pin', 'device_not_enrolled']) {
      const { client } = stub(() => ({ ok: false, error }));
      await expect(client.auth.open('9999', 'dev')).resolves.toEqual({ status: 'invalid' });
    }
  });

  it('passes the lockout wait through, so the UI can say how long', async () => {
    const { client } = stub(() => ({ ok: false, error: 'locked', retryAfterMs: 300000 }));
    await expect(client.auth.open('9999', 'dev')).resolves.toEqual({ status: 'locked', retryAfterMs: 300000 });
  });
});

describe('appending', () => {
  const cmd = { clientTxnId: 'c-42', direction: 'keluar' as const, qty: 2, itemId: 'ITM-0001' };
  const appendedRow = { ...STATE.txns[0], txnId: 'T9', clientTxnId: 'c-42' };

  it('returns the row the server actually wrote, with its own timestamp', async () => {
    const { client } = stub(() => ({ ok: true, appended: [appendedRow], duplicates: [] }));
    const outcome = await client.log.append(SESSION, cmd);

    expect(outcome.status).toBe('appended');
    if (outcome.status === 'appended') {
      expect(outcome.txn.txnId).toBe('T9');
      expect(outcome.txn.actorUserId).toBe('USR-1');
    }
  });

  it('a duplicate is a SUCCESS, not a failure', async () => {
    // This is what idempotency is for: a retry after a dropped response must not read as an
    // error, or the operator taps again and creates a real double entry.
    const { client } = stub(() => ({ ok: true, appended: [appendedRow], duplicates: ['c-42'] }));
    const outcome = await client.log.append(SESSION, cmd);
    expect(outcome.status).toBe('duplicate');
  });

  it('queues rather than rejects when the network is down', async () => {
    const client = createGatewayClient({
      url: URL_, deviceSecret: 'd',
      fetch: async () => { throw new TypeError('Failed to fetch'); },
    });
    await expect(client.log.append(SESSION, cmd))
      .resolves.toEqual({ status: 'queued', clientTxnId: 'c-42' });
  });

  it('rejects with the gateway reason when the gateway says no', async () => {
    const { client } = stub(() => ({ ok: false, error: 'session_expired' }));
    const outcome = await client.log.append(SESSION, cmd);
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'session_expired' });
  });

  it('rejects rather than inventing a row when the gateway returns none', async () => {
    const { client } = stub(() => ({ ok: true, appended: [], duplicates: [] }));
    expect((await client.log.append(SESSION, cmd)).status).toBe('rejected');
  });
});
