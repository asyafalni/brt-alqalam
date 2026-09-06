import { describe, it, expect } from 'vitest';
import { deriveState } from './deriveState';
import { groupByZone, racksNeedingAttention, rollupLocations, UNASSIGNED } from './locations';
import type { Item, Location, Txn } from './types';

const loc = (p: Partial<Location> = {}): Location => ({
  locationId: 'LOC-B3', code: 'B3', name: 'Rak sabun', zone: 'Gudang Utama',
  order: 1, active: true, ...p,
});

let seq = 0;
const item = (p: Partial<Item> = {}): Item => {
  seq += 1;
  return {
    itemId: `ITM-${seq}`, barcode: `b${seq}`, name: `Barang ${seq}`, categoryId: 'CAT-K',
    kind: 'consumable', unit: 'buah', trackBy: 'quantity',
    minStock: 5, initialStock: 10, active: true, ...p,
  };
};

const roll = (locations: Location[], items: Item[], txns: Txn[] = []) =>
  rollupLocations(locations, items, deriveState(items, [], txns, 0));

const tx = (p: Partial<Txn>): Txn =>
  ({ txnId: 't', clientTxnId: 'c', ts: 0, type: 'pemakaian', qtyDelta: 0, actorUserId: 'u', ...p });

describe('rollupLocations', () => {
  it('a rack shows the worst state on it — that is what earns a walk', () => {
    const b3 = loc();
    const healthy = item({ locationId: 'LOC-B3', initialStock: 20 });
    const empty = item({ locationId: 'LOC-B3', initialStock: 0 });
    const [rack] = roll([b3], [healthy, empty]);

    expect(rack.status).toBe('out');
    expect(rack.itemCount).toBe(2);
    expect(rack.unitCount).toBe(20);
    expect(rack.outCount).toBe(1);
  });

  it('low outranks available but not out', () => {
    const low = item({ locationId: 'LOC-B3', initialStock: 3, minStock: 5 });
    expect(roll([loc()], [low])[0].status).toBe('low');
    expect(roll([loc()], [low, item({ locationId: 'LOC-B3', initialStock: 0 })])[0].status).toBe('out');
  });

  it('a rack with nothing on it reads as empty, not available', () => {
    expect(roll([loc()], [])[0]).toMatchObject({ status: 'empty', itemCount: 0, unitCount: 0 });
  });

  it('reflects derived stock, not starting stock', () => {
    const sabun = item({ itemId: 'ITM-S', locationId: 'LOC-B3', initialStock: 10, minStock: 5 });
    const rack = roll([loc()], [sabun], [tx({ itemId: 'ITM-S', qtyDelta: -8 })])[0];
    expect(rack.unitCount).toBe(2);
    expect(rack.status).toBe('low');
  });

  it('surfaces unplaced items as their own bucket — the pile in the corner, made visible', () => {
    const racks = roll([loc()], [item({ locationId: 'LOC-B3' }), item()]);
    expect(racks).toHaveLength(2);
    expect(racks[1].location).toEqual(UNASSIGNED);
    expect(racks[1].itemCount).toBe(1);
  });

  it('hides the unplaced bucket when everything has a home', () => {
    expect(roll([loc()], [item({ locationId: 'LOC-B3' })])).toHaveLength(1);
  });

  it('skips retired racks', () => {
    expect(roll([loc({ active: false })], [])).toHaveLength(0);
  });

  it('orders by zone, then by the order field, then by code', () => {
    const racks = roll([
      loc({ locationId: 'C', code: 'C1', zone: 'Gudang Utama', order: 2 }),
      loc({ locationId: 'A', code: 'A1', zone: 'Gudang Utama', order: 1 }),
      loc({ locationId: 'Z', code: 'Z1', zone: 'Gudang PHBI', order: 1 }),
    ], []);
    expect(racks.map((r) => r.location.code)).toEqual(['Z1', 'A1', 'C1']);
  });
});

describe('groupByZone', () => {
  it('groups racks into the blocks the board draws, preserving order', () => {
    const zones = groupByZone(roll([
      loc({ locationId: 'A', code: 'A1', zone: 'Gudang Utama' }),
      loc({ locationId: 'B', code: 'B1', zone: 'Gudang Utama', order: 2 }),
      loc({ locationId: 'P', code: 'P1', zone: 'Ruang Kebersihan' }),
    ], []));

    expect(zones.map((z) => z.zone)).toEqual(['Gudang Utama', 'Ruang Kebersihan']);
    expect(zones[0].racks.map((r) => r.location.code)).toEqual(['A1', 'B1']);
  });
});

describe('racksNeedingAttention', () => {
  it('counts only racks someone has to walk to', () => {
    const racks = roll([
      loc({ locationId: 'A', code: 'A1' }),
      loc({ locationId: 'B', code: 'B1' }),
      loc({ locationId: 'C', code: 'C1' }),
    ], [
      item({ locationId: 'A', initialStock: 20 }),   // available
      item({ locationId: 'B', initialStock: 3 }),    // low
      item({ locationId: 'C', initialStock: 0 }),    // out
    ]);
    expect(racksNeedingAttention(racks)).toBe(2);    // empty racks are not an alarm
  });
});
