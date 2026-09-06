import { describe, it, expect } from 'vitest';
import { deriveState } from '../../../../domain/deriveState';
import type { Item, Txn } from '../../../../domain/types';
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

const scan = (target: 'item' | 'asset', id: string, txns: Txn[] = []) =>
  resolveScan(target, id, items, SEED_CATEGORIES, derive(txns), TS0);

describe('resolveScan — the scan guard', () => {
  it('resolves a rack label by itemId or by the printed barcode', () => {
    for (const id of ['ITM-0001', 'ALQ-ITM-0001']) {
      const r = scan('item', id);
      expect(r).toMatchObject({ found: true, qty: 10, status: 'available' });
      if (r.found) expect(r.item.name).toBe('Sabun');
    }
  });

  it('resolves a unit label back to the item that owns it', () => {
    const r = scan('asset', 'ALQ-ITM-0002-002');
    expect(r.found).toBe(true);
    if (r.found) {
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
    const r = resolveScan('item', 'ITM-0001', [], SEED_CATEGORIES, deriveState([], [], [], TS0), TS0);
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
    expect(itemStatusBadge('out').dot).not.toBe(instanceStatusBadge('out').dot);
  });

  it('rusak and hilang never share a colour — they demand different actions', () => {
    expect(instanceStatusBadge('broken').chip).toContain('rusak');
    expect(instanceStatusBadge('lost').chip).toContain('hilang');
    expect(instanceStatusBadge('broken').chip).not.toBe(instanceStatusBadge('lost').chip);
  });

  it('every class string is a literal Tailwind can actually see', () => {
    // `bg-${color}` generates no CSS and fails silently — the badge renders colourless.
    for (const status of ['available', 'out', 'broken', 'lost', 'retired']) {
      const badge = instanceStatusBadge(status);
      expect(badge.dot).toMatch(/^bg-[a-z]+$/);
      expect(badge.chip).toMatch(/^bg-[a-z]+\/15 text-[a-z]+$/);
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
