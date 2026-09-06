import { describe, it, expect } from 'vitest';
import { deriveState } from '../../../../domain/deriveState';
import type { Item, Location, Txn } from '../../../../domain/types';
import { SEED_CATEGORIES } from '../../data/seedCategories';
import { createItem, instancesFor } from '../stocktake/draft';
import type { DraftInput } from '../stocktake/draft';
import { instanceStatusBadge, itemStatusBadge, resolveScan, statusBadge } from './resolve';

const input = (p: Partial<DraftInput> = {}): DraftInput => ({
  name: 'Sabun', categoryId: 'CAT-KEBERSIHAN', unit: 'galon',
  kind: 'consumable', initialStock: 10, minStock: 5, ...p,
});
const TS0 = Date.parse('2026-09-06T00:00:00Z');

const sabun = createItem(input(), []);
const pisau = createItem(input({ name: 'Pisau', kind: 'equipment', initialStock: 3 }), [sabun]);
const items: Item[] = [sabun, pisau];
const instances = items.flatMap((i) => instancesFor(i, TS0));

const derive = (txns: Txn[] = []) => deriveState(items, instances, txns, TS0);
const tx = (p: Partial<Txn>): Txn =>
  ({ txnId: 'T1', clientTxnId: 'c1', ts: TS0, type: 'adjust', qtyDelta: 0, actorUserId: 'u', ...p });

const rak: Location = {
  locationId: 'LOC-B3', code: 'B3', name: 'Rak sabun', zone: 'Gudang Utama', order: 1, active: true,
};
const placed: Item[] = [{ ...sabun, locationId: 'LOC-B3' }, pisau];

const scan = (target: 'item' | 'asset' | 'location', id: string, txns: Txn[] = []) =>
  resolveScan(target, id, items, SEED_CATEGORIES, [rak], derive(txns), TS0);

describe('resolveScan — the scan guard', () => {
  it('resolves a rack label by itemId or by the printed barcode', () => {
    for (const id of ['ITM-0001', 'ALQ-ITM-0001']) {
      const r = scan('item', id);
      expect(r).toMatchObject({ found: true, qty: 10, status: 'available' });
        if (r.found && r.kind === 'thing') expect(r.item.name).toBe('Sabun');
    }
  });

  it('resolves a unit label back to the item that owns it', () => {
    const r = scan('asset', 'ALQ-ITM-0002-002');
    expect(r.found).toBe(true);
    if (r.found && r.kind === 'thing') {
      expect(r.item.name).toBe('Pisau');
      expect(r.instance?.label).toBe('Pisau #2');
      expect(r.categoryName).toBe('Kebersihan');
    }
  });

  it('says so when the label is not in the catalog', () => {
    expect(scan('item', 'ITM-9999')).toMatchObject({ found: false, reason: 'unknown' });
    expect(scan('asset', 'ALQ-ITM-0002-099')).toMatchObject({ found: false, reason: 'unknown' });
  });

  it('distinguishes an empty catalog from an unknown label', () => {
    const r = resolveScan('item', 'ITM-0001', [], SEED_CATEGORIES, [], deriveState([], [], [], TS0), TS0);
    expect(r).toMatchObject({ found: false, reason: 'no-catalog' });
  });

  it('shows the DERIVED quantity, not the starting one', () => {
    const r = scan('item', 'ITM-0001', [tx({ type: 'pemakaian', itemId: 'ITM-0001', qtyDelta: -7 })]);
    expect(r).toMatchObject({ qty: 3, status: 'low' });   // 3 <= minStock 5
  });

  it('reports a borrowed unit as out, so a second scan cannot double-lend it', () => {
    const r = scan('asset', 'ALQ-ITM-0002-001',
      [tx({ type: 'peminjaman', assetId: 'ALQ-ITM-0002-001', recipient: 'Pak Yusuf' })]);
    expect(r).toMatchObject({ found: true, status: 'out' });
  });
});

describe('status vocabulary', () => {
  it('"out" reads as Habis for stock but Dipinjam for a unit — the knife still exists', () => {
    expect(itemStatusBadge('out').label).toBe('Habis');
    expect(instanceStatusBadge('out').label).toBe('Dipinjam');
    expect(itemStatusBadge('out').chip).not.toBe(instanceStatusBadge('out').chip);
  });

  it('rusak and hilang never share a colour — they demand different actions', () => {
    expect(instanceStatusBadge('broken').chip).toContain('orange');
    expect(instanceStatusBadge('lost').chip).toContain('rose');
    expect(instanceStatusBadge('broken').chip).not.toBe(instanceStatusBadge('lost').chip);
  });

  it('keeps the three the template already ships, unchanged', () => {
    // SmartInv StockBadge.tsx:10-14 — Safe / Low / Out of Stock.
    expect(itemStatusBadge('available').chip).toBe('bg-green-50 text-green-700 border-green-100');
    expect(itemStatusBadge('low').chip).toBe('bg-amber-50 text-amber-700 border-amber-100');
    expect(itemStatusBadge('out').chip).toBe('bg-red-50 text-red-700 border-red-100');
  });

  it('every class string is a literal Tailwind can actually see', () => {
    // `bg-${family}-50` generates no CSS and fails silently — colourless badges.
    for (const status of ['available', 'out', 'broken', 'lost', 'retired']) {
      const badge = instanceStatusBadge(status);
      expect(badge.rail).toMatch(/^bg-[a-z]+-\d{3}$/);
      expect(badge.chip).toMatch(/^bg-[a-z]+-\d{2,3} text-[a-z]+-\d{3} border-[a-z]+-\d{2,3}$/);
    }
  });

  it('picks the right vocabulary for whatever was scanned', () => {
    const borrowed = scan('asset', 'ALQ-ITM-0002-001',
      [tx({ type: 'peminjaman', assetId: 'ALQ-ITM-0002-001' })]);
    expect(statusBadge(borrowed).label).toBe('Dipinjam');

    const empty = scan('item', 'ITM-0001', [tx({ type: 'pemakaian', itemId: 'ITM-0001', qtyDelta: -10 })]);
    expect(statusBadge(empty).label).toBe('Habis');
  });

  it('never renders a raw status string at an unknown value', () => {
    expect(itemStatusBadge('sesuatu').label).toBe('Tidak diketahui');
  });
});

describe('scanning a rack — the label that actually goes on a shelf', () => {
  it('answers "what is on this rack"', () => {
    const derived = deriveState(placed, instances, [], TS0);
    const r = resolveScan('location', 'LOC-B3', placed, SEED_CATEGORIES, [rak], derived, TS0);

    expect(r.found).toBe(true);
    if (r.found && r.kind === 'rack') {
      expect(r.rack.location.code).toBe('B3');
      expect(r.contents.map((i) => i.name)).toEqual(['Sabun']);
      expect(r.rack.status).toBe('available');
    }
  });

  it('shows the worst status on the shelf, since that is what earns the walk', () => {
    const empty: Item[] = [{ ...sabun, locationId: 'LOC-B3', initialStock: 0 }];
    const derived = deriveState(empty, [], [], TS0);
    const r = resolveScan('location', 'LOC-B3', empty, SEED_CATEGORIES, [rak], derived, TS0);
    if (r.found && r.kind === 'rack') expect(r.rack.status).toBe('out');
    expect(statusBadge(r).label).toBe('Habis');
  });

  it('an unknown rack label says so rather than showing an empty shelf', () => {
    const r = resolveScan('location', 'LOC-ZZ', placed, SEED_CATEGORIES, [rak], derive(), TS0);
    expect(r).toMatchObject({ found: false, reason: 'unknown' });
  });
});
