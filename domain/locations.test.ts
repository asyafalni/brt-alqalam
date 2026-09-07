import { describe, it, expect } from 'vitest';
import { deriveState } from './deriveState';
import { groupByZone, racksNeedingAttention, rollupLocations, UNASSIGNED } from './locations';
import type { Item, Location, StockLine, Txn } from './types';

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
    minStock: 5, active: true, ...p,
  };
};

/**
 * Quantity and placement are stock LINES now, not fields on the item, so a fixture has to say
 * both — which is the point: the same item can appear on two racks, and these helpers make
 * that as easy to write as one.
 */
const at = (i: Item, locationId: string, initialStock = 10): StockLine =>
  ({ itemId: i.itemId, locationId, initialStock });

const roll = (locations: Location[], stock: StockLine[], items: Item[], txns: Txn[] = []) =>
  rollupLocations(locations, items, deriveState(items, [], txns, 0, stock));

const tx = (p: Partial<Txn>): Txn =>
  ({ txnId: 't', clientTxnId: 'c', ts: 0, type: 'pemakaian', qtyDelta: 0, actorUserId: 'u', ...p });

describe('rollupLocations', () => {
  it('a rack shows the worst state on it — that is what earns a walk', () => {
    const healthy = item();
    const empty = item();
    const [rack] = roll([loc()], [at(healthy, 'LOC-B3', 20), at(empty, 'LOC-B3', 0)], [healthy, empty]);

    expect(rack.status).toBe('out');
    expect(rack.itemCount).toBe(2);
    expect(rack.unitCount).toBe(20);
    expect(rack.outCount).toBe(1);
  });

  it('low outranks available but not out', () => {
    const low = item({ minStock: 5 });
    expect(roll([loc()], [at(low, 'LOC-B3', 3)], [low])[0].status).toBe('low');

    const gone = item();
    expect(
      roll([loc()], [at(low, 'LOC-B3', 3), at(gone, 'LOC-B3', 0)], [low, gone])[0].status,
    ).toBe('out');
  });

  it('a rack with nothing on it reads as empty, not available', () => {
    expect(roll([loc()], [], [])[0]).toMatchObject({ status: 'empty', itemCount: 0, unitCount: 0 });
  });

  it('reflects derived stock, not starting stock', () => {
    const sabun = item({ itemId: 'ITM-S', minStock: 5 });
    const rack = roll(
      [loc()], [at(sabun, 'LOC-B3', 10)], [sabun],
      [tx({ itemId: 'ITM-S', qtyDelta: -8, locationId: 'LOC-B3' })],
    )[0];
    expect(rack.unitCount).toBe(2);
    expect(rack.status).toBe('low');
  });

  it('surfaces unplaced items as their own bucket — the pile in the corner, made visible', () => {
    const placed = item();
    const loose = item();
    const racks = roll([loc()], [at(placed, 'LOC-B3'), at(loose, '')], [placed, loose]);
    expect(racks).toHaveLength(2);
    expect(racks[1].location).toEqual(UNASSIGNED);
    expect(racks[1].itemCount).toBe(1);
  });

  it('hides the unplaced bucket when everything has a home', () => {
    const placed = item();
    expect(roll([loc()], [at(placed, 'LOC-B3')], [placed])).toHaveLength(1);
  });

  it('skips retired racks', () => {
    expect(roll([loc({ active: false })], [], [])).toHaveLength(0);
  });

  it('orders by zone, then by the order field, then by code', () => {
    const racks = roll([
      loc({ locationId: 'C', code: 'C1', zone: 'Gudang Utama', order: 2 }),
      loc({ locationId: 'A', code: 'A1', zone: 'Gudang Utama', order: 1 }),
      loc({ locationId: 'Z', code: 'Z1', zone: 'Gudang PHBI', order: 1 }),
    ], [], []);
    expect(racks.map((r) => r.location.code)).toEqual(['Z1', 'A1', 'C1']);
  });
});

// --- The reason quantity left the item ------------------------------------------------------

describe('one item kept on two racks', () => {
  const a1 = loc({ locationId: 'LOC-A1', code: 'A1' });
  const a3 = loc({ locationId: 'LOC-A3', code: 'A3' });

  it('appears on both racks, each counting only what is on it', () => {
    const sabun = item({ itemId: 'ITM-S' });
    const [rackA1, rackA3] = roll(
      [a1, a3], [at(sabun, 'LOC-A1', 4), at(sabun, 'LOC-A3', 6)], [sabun],
    );
    expect(rackA1.itemCount).toBe(1);
    expect(rackA1.unitCount).toBe(4);
    expect(rackA3.unitCount).toBe(6);
  });

  it('colours a rack by what is ON IT, not by the item total', () => {
    // A1 has run out while A3 is full. Colouring A1 by the total would hide the one shelf
    // somebody actually has to restock; colouring A3 red would send them to the wrong one.
    const sabun = item({ itemId: 'ITM-S', minStock: 2 });
    const [rackA1, rackA3] = roll(
      [a1, a3], [at(sabun, 'LOC-A1', 0), at(sabun, 'LOC-A3', 20)], [sabun],
    );
    expect(rackA1.status).toBe('out');
    expect(rackA3.status).toBe('available');
  });

  it('a shelf drawn down to zero still belongs to the rack', () => {
    // "We keep sabun here and it has run out" is not "sabun was never kept here". Dropping the
    // row would take the restock off the board entirely.
    const sabun = item({ itemId: 'ITM-S' });
    const [rackA1] = roll(
      [a1, a3], [at(sabun, 'LOC-A1', 4), at(sabun, 'LOC-A3', 6)], [sabun],
      [tx({ itemId: 'ITM-S', qtyDelta: -4, locationId: 'LOC-A1' })],
    );
    expect(rackA1.itemCount).toBe(1);
    expect(rackA1.unitCount).toBe(0);
    expect(rackA1.status).toBe('out');
  });
});

describe('groupByZone', () => {
  it('groups racks into the blocks the board draws, preserving order', () => {
    const zones = groupByZone(roll([
      loc({ locationId: 'A', code: 'A1', zone: 'Gudang Utama' }),
      loc({ locationId: 'B', code: 'B1', zone: 'Gudang Utama', order: 2 }),
      loc({ locationId: 'P', code: 'P1', zone: 'Ruang Kebersihan' }),
    ], [], []));

    expect(zones.map((z) => z.zone)).toEqual(['Gudang Utama', 'Ruang Kebersihan']);
    expect(zones[0].racks.map((r) => r.location.code)).toEqual(['A1', 'B1']);
  });
});

describe('racksNeedingAttention', () => {
  it('counts only racks someone has to walk to', () => {
    const ok = item();
    const low = item({ minStock: 5 });
    const gone = item();
    const racks = roll([
      loc({ locationId: 'A', code: 'A1' }),
      loc({ locationId: 'B', code: 'B1' }),
      loc({ locationId: 'C', code: 'C1' }),
    ], [at(ok, 'A', 20), at(low, 'B', 3), at(gone, 'C', 0)], [ok, low, gone]);
    expect(racksNeedingAttention(racks)).toBe(2);    // empty racks are not an alarm
  });
});
