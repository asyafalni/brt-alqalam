// The shipped sheet templates must parse with zero quarantine. If someone edits a header in
// sheets/*.csv, or a parser rule changes, this fails here rather than in a gudang.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCategories, parseItems, parseInstances, parseLocations, parseTxns, describeIssues } from './parse';

const read = (f: string) => readFileSync(new URL(`../sheets/${f}`, import.meta.url), 'utf8');

describe('sheets/ templates match the parser', () => {
  it('Categories.csv', () => {
    const r = parseCategories(read('Categories.csv'));
    expect(describeIssues(r.quarantined)).toBe('');
    expect(r.ok).toHaveLength(8);
  });

  it('Items.csv — including the plain-language kind labels and "(-)" minimum', () => {
    const r = parseItems(read('Items.csv'));
    expect(describeIssues(r.quarantined)).toBe('');
    expect(r.ok.map((i) => i.kind)).toEqual(['consumable', 'consumable', 'consumable', 'equipment', 'equipment']);
    expect(r.ok.find((i) => i.itemId === 'ITM-0003')?.minStock).toBeNull();      // "(-)"
    expect(r.ok.find((i) => i.itemId === 'ITM-0004')?.trackBy).toBe('instance'); // defaulted from kind
    expect(r.ok.find((i) => i.itemId === 'ITM-0005')?.trackBy).toBe('quantity'); // explicit override
  });

  it('Locations.csv', () => {
    const r = parseLocations(read('Locations.csv'));
    expect(describeIssues(r.quarantined)).toBe('');
    expect(r.ok).toHaveLength(4);
    expect(new Set(r.ok.map((l) => l.zone)).size).toBe(2);
  });

  it('AssetInstances.csv', () => {
    const r = parseInstances(read('AssetInstances.csv'));
    expect(describeIssues(r.quarantined)).toBe('');
    expect(r.ok).toHaveLength(2);
  });

  it('Transactions.csv is a header-only append-only log', () => {
    const r = parseTxns(read('Transactions.csv'));
    expect(r.quarantined).toEqual([]);
    expect(r.ok).toEqual([]);
  });
});
