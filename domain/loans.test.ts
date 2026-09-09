import { describe, it, expect } from 'vitest';
import { DAY, loanAge, loansByAge, overdueLoans } from './loans';
import type { AssetInstance, DerivedInstance } from './types';

const NOW = Date.parse('2026-09-09T10:00:00Z');

const instance = (assetId: string): AssetInstance => ({
  assetId, itemId: 'ITM-0001', label: assetId, acquiredTs: 0, active: true,
});
const out = (assetId: string, daysAgo: number): DerivedInstance => ({
  instance: instance(assetId), status: 'out', holder: 'Pak Yusuf', since: NOW - daysAgo * DAY,
});

describe('how long a thing has been out', () => {
  it('is nothing to worry about in the first week', () => {
    expect(loanAge(NOW - 6 * DAY, NOW).level).toBe('baru');
  });

  it('gets louder at a week, at a fortnight, and at a month', () => {
    // A gradient, not a deadline: the system never refuses anything and never marks a thing
    // lost by itself. It only makes the oldest loan the loudest.
    expect(loanAge(NOW - 7 * DAY, NOW).level).toBe('ditanya');
    expect(loanAge(NOW - 14 * DAY, NOW).level).toBe('lama');
    expect(loanAge(NOW - 40 * DAY, NOW).level).toBe('mungkin-hilang');
  });

  it('counts whole days, the way a person would say it', () => {
    expect(loanAge(NOW - 9 * DAY - 1000, NOW).days).toBe(9);
  });

  it('treats a missing date as new, not as ancient', () => {
    // Inventing an age out of missing data would put a phantom at the top of the list, above
    // real loans somebody could actually go and chase.
    expect(loanAge(undefined, NOW)).toEqual({ days: 0, level: 'baru' });
  });

  it('never reports a negative age from a clock that ran backwards', () => {
    expect(loanAge(NOW + 5 * DAY, NOW).days).toBe(0);
  });
});

describe('the list that reaches somebody', () => {
  it('puts the oldest first, so the one worth chasing arrives at the top by itself', () => {
    const rows = loansByAge([out('A', 2), out('B', 40), out('C', 9)], NOW);
    expect(rows.map((r) => r.instance.instance.assetId)).toEqual(['B', 'C', 'A']);
  });

  it('ignores everything that is not out — broken is a repair queue, not a loan', () => {
    const broken: DerivedInstance = { instance: instance('D'), status: 'broken', since: NOW - 99 * DAY };
    expect(loansByAge([broken, out('A', 1)], NOW).map((r) => r.instance.instance.assetId))
      .toEqual(['A']);
  });

  it('counts only the ones past the first rung', () => {
    expect(overdueLoans([out('A', 2), out('B', 8), out('C', 40)], NOW)).toBe(2);
  });
});
