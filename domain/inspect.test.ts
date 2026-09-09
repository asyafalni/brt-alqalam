import { describe, it, expect } from 'vitest';
import { DAY_MS, INSPECT_INTERVAL_DAYS, inspection, lastInspected } from './inspect';
import type { Txn } from './types';

const NOW = Date.parse('2026-09-09T10:00:00Z');
const check = (assetId: string, daysAgo: number, n = 0): Txn => ({
  txnId: `T${assetId}${n}`, clientTxnId: `c${assetId}${n}`, ts: NOW - daysAgo * DAY_MS,
  type: 'pemeriksaan', assetId, qtyDelta: 0, actorUserId: 'USR-1',
});

describe('when a unit was last confirmed good', () => {
  it('takes the most recent check, not the first', () => {
    const seen = lastInspected([check('A', 200), check('A', 5, 2)]);
    expect(seen.get('A')).toBe(NOW - 5 * DAY_MS);
  });

  it('ignores every other kind of movement', () => {
    // Borrowing a knife is not inspecting it. Only a `pemeriksaan` is somebody saying, on a
    // date, that they looked and it was still good.
    const loan: Txn = {
      txnId: 'L', clientTxnId: 'l', ts: NOW, type: 'peminjaman',
      assetId: 'A', qtyDelta: 0, actorUserId: 'USR-1',
    };
    expect(lastInspected([loan]).has('A')).toBe(false);
  });

  it('separates NEVER checked from checked long ago', () => {
    // The worse of the two: a unit nobody has ever looked at has never had its condition
    // confirmed at all — the register is repeating an assumption from the day it was counted.
    expect(inspection(undefined, NOW).level).toBe('belum-pernah');
    expect(inspection(NOW - 400 * DAY_MS, NOW).level).toBe('lama');
  });

  it('gives a durable six months, not the racks\' thirty days', () => {
    // A rack is walked past every week; a Qurban knife is deliberately untouched for most of
    // the year. A monthly alarm on forty knives would be permanently red, and an alarm that is
    // always on is an alarm nobody reads.
    expect(INSPECT_INTERVAL_DAYS).toBe(180);
    expect(inspection(NOW - 179 * DAY_MS, NOW).level).toBe('baru');
    expect(inspection(NOW - 180 * DAY_MS, NOW).level).toBe('lama');
  });

  it('never reports a negative age from a clock that ran backwards', () => {
    expect(inspection(NOW + 5 * DAY_MS, NOW).days).toBe(0);
  });
});
