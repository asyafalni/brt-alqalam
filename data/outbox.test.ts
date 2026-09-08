import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { enqueue, pending, pendingCount, settle } from './outbox';
import type { AppendEntry } from './gateway';

const entry = (id: string, over: Partial<AppendEntry> = {}): AppendEntry => ({
  clientTxnId: id, type: 'pemakaian', itemId: 'ITM-1', locationId: 'LOC-A1', qtyDelta: -1, ...over,
});

beforeEach(async () => {
  const all = await pending();
  await settle(all.map((p) => p.clientTxnId));
});

describe('keeping a movement that could not be sent', () => {
  it('holds it, and gives it back', async () => {
    // A withdrawal that fails to send is a withdrawal that goes unrecorded — the marbot has
    // already walked off with the soap.
    await enqueue(entry('C1'), 'Alfin');
    const rows = await pending();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ clientTxnId: 'C1', recordedBy: 'Alfin', attempts: 1 });
    expect(rows[0].entry.locationId).toBe('LOC-A1');
  });

  it('stores no credential of any kind', async () => {
    // The whole point of a per-visit PIN is that nothing is left lying around afterwards that
    // can act on somebody's behalf. A queue is storage at rest on a shared tablet.
    await enqueue(entry('C1'), 'Alfin');
    const text = JSON.stringify(await pending());
    for (const secret of ['pin', 'token', 'session', 'secret', 'deviceSecret']) {
      expect(text.toLowerCase()).not.toContain(secret.toLowerCase());
    }
  });

  it('replaces rather than duplicates when the same entry is queued twice', async () => {
    // A double tap, or a retry that half succeeded. The key is the same `clientTxnId` the
    // gateway de-duplicates on, which is what makes retrying safe at all.
    await enqueue(entry('C1'), 'Alfin');
    await enqueue(entry('C1'), 'Alfin');
    expect(await pendingCount()).toBe(1);
  });

  it('counts the attempts, so an entry that will never send can be spotted', async () => {
    await enqueue(entry('C1'), 'Alfin');
    await enqueue(entry('C1'), 'Alfin');
    expect((await pending())[0].attempts).toBe(2);
  });

  it('keeps the ORIGINAL time and recorder across retries', async () => {
    // The queue records when it happened, not when it was finally sent — and re-queuing must
    // not quietly move a movement forward in time or hand it to somebody else.
    await enqueue(entry('C1'), 'Alfin');
    const first = (await pending())[0];
    await new Promise((r) => setTimeout(r, 5));
    await enqueue(entry('C1'), 'Budi');
    const again = (await pending())[0];
    expect(again.recordedTs).toBe(first.recordedTs);
    expect(again.recordedBy).toBe('Alfin');
  });

  it('gives them back oldest first', async () => {
    // The log is a sequence; sending it out of order invents a different one.
    await enqueue(entry('C1'), 'A');
    await new Promise((r) => setTimeout(r, 5));
    await enqueue(entry('C2'), 'A');
    expect((await pending()).map((p) => p.clientTxnId)).toEqual(['C1', 'C2']);
  });

  it('drops what the gateway accepted, including what it called a duplicate', async () => {
    // A duplicate means the gateway already has it — leaving it queued would make it retry
    // for ever against a row that exists.
    await enqueue(entry('C1'), 'A');
    await enqueue(entry('C2'), 'A');
    await settle(['C1', 'C2']);
    expect(await pendingCount()).toBe(0);
  });

  it('does nothing when asked to settle nothing', async () => {
    await enqueue(entry('C1'), 'A');
    await settle([]);
    expect(await pendingCount()).toBe(1);
  });
});
