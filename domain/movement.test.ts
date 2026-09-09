import { describe, it, expect } from 'vitest';
import { movementSeries, startOfDay } from './movement';
import type { Txn } from './types';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-09T10:00:00').getTime();

const txn = (daysAgo: number, qtyDelta: number, over: Partial<Txn> = {}): Txn => ({
  txnId: `T${daysAgo}:${qtyDelta}`, clientTxnId: `c${daysAgo}:${qtyDelta}`,
  ts: NOW - daysAgo * DAY, type: qtyDelta < 0 ? 'pemakaian' : 'pengembalian',
  itemId: 'ITM-0001', qtyDelta, actorUserId: 'USR-1', ...over,
});

describe('bucketing the log by day', () => {
  it('splits what left from what came back', () => {
    const s = movementSeries([txn(1, -3), txn(1, 2)], NOW);
    const day = s.days.find((d) => d.ts === startOfDay(NOW - DAY))!;
    expect(day.out).toBe(3);
    expect(day.in).toBe(2);
  });

  it('reports units OUT as a positive number, because a chart axis is not a ledger', () => {
    expect(movementSeries([txn(0, -5)], NOW).totalOut).toBe(5);
  });

  it('fills the quiet days rather than skipping them', () => {
    // A gap that is not drawn is a gap that reads as "no data" instead of "nothing happened",
    // and on a usage chart those mean opposite things.
    const s = movementSeries([txn(6, -1), txn(0, -1)], NOW);
    expect(s.days).toHaveLength(7);
    expect(s.days.filter((d) => d.out === 0)).toHaveLength(5);
  });

  it('never draws a two-point chart, which would read as a trend', () => {
    expect(movementSeries([txn(0, -1)], NOW).days.length).toBeGreaterThanOrEqual(7);
  });

  it('caps the window instead of compressing a year into the same width', () => {
    const s = movementSeries([txn(400, -1), txn(0, -2)], NOW);
    expect(s.days).toHaveLength(30);
  });

  it('leaves movements older than the window out of the TOTALS too', () => {
    // A total that disagrees with the chart above it is a number somebody takes to a takmir
    // meeting and is wrong there.
    const s = movementSeries([txn(400, -99), txn(0, -2)], NOW);
    expect(s.totalOut).toBe(2);
  });

  it('averages per week, because a masjid runs on a weekly rhythm', () => {
    // 14 units over a 7-day window is 14 a week, not "2 a day" — which lands between Jumat and
    // a quiet Tuesday and describes neither.
    const s = movementSeries([txn(0, -14)], NOW, { minDays: 7, maxDays: 7 });
    expect(s.perWeek).toBe(14);
  });

  it('has nothing to draw when nothing has moved', () => {
    expect(movementSeries([], NOW).days).toEqual([]);
    expect(movementSeries([txn(0, 0)], NOW).days).toEqual([]);
  });

  it('scales off a peak of at least one, so a flat window still draws an axis', () => {
    expect(movementSeries([txn(0, -1)], NOW).peak).toBeGreaterThan(0);
  });
});

describe('what moved, not only how much', () => {
  it('breaks a day down by item, biggest first', () => {
    const s = movementSeries([
      txn(1, -1, { itemId: 'ITM-0001' }),
      txn(1, -4, { itemId: 'ITM-0002' }),
      txn(1, -2, { itemId: 'ITM-0001' }),
    ], NOW);
    const day = s.days.find((d) => d.ts === startOfDay(NOW - DAY))!;
    expect(day.items.map((r) => [r.key, r.out])).toEqual([['ITM-0002', 4], ['ITM-0001', 3]]);
  });

  it('keeps the breakdown adding up to the total it sits under', () => {
    // Derived here rather than in the tooltip, so a chart and its own detail cannot disagree.
    const s = movementSeries([txn(0, -3, { itemId: 'A' }), txn(0, -2, { itemId: 'B' })], NOW);
    const day = s.days[s.days.length - 1];
    expect(day.items.reduce((n, r) => n + r.out, 0)).toBe(day.out);
  });

  it('keys a per-unit movement by its assetId, which the UI resolves back to a name', () => {
    const s = movementSeries(
      [txn(0, -1, { itemId: undefined, assetId: 'ALQ-ITM-0007-002' })], NOW,
    );
    expect(s.days[s.days.length - 1].items[0].key).toBe('ALQ-ITM-0007-002');
  });

  it('separates what left from what came back, per item', () => {
    const s = movementSeries([txn(0, -5, { itemId: 'A' }), txn(0, 2, { itemId: 'A' })], NOW);
    const row = s.days[s.days.length - 1].items[0];
    expect([row.out, row.in]).toEqual([5, 2]);
  });
});
