import { describe, it, expect } from 'vitest';
import { deriveState, activeTxns } from './deriveState';
import type { Item, AssetInstance, StockLine, Txn } from './types';

const DAY = 24 * 60 * 60 * 1000;

const sabun: Item = {
  itemId: 'ITM-S', barcode: 'b', name: 'Sabun', categoryId: 'CAT-KEBERSIHAN',
  kind: 'consumable', unit: 'galon', trackBy: 'quantity',
  minStock: 5, active: true,
};
/* Quantity lives on stock lines now, not on the item. One unplaced line keeps these fixtures
   about the folding rules rather than about racks; the per-rack cases are their own describe. */
const stock: StockLine[] = [{ itemId: 'ITM-S', locationId: '', initialStock: 10 }];
const pisauItem: Item = {
  itemId: 'ITM-P', barcode: 'p', name: 'Pisau', categoryId: 'CAT-PHBI',
  kind: 'equipment', unit: 'buah', trackBy: 'instance',
  minStock: 0, active: true,
};
const pisau: AssetInstance = { assetId: 'A-P7', itemId: 'ITM-P', label: 'Pisau #7', acquiredTs: 0, active: true };

let seq = 0;
function tx(p: Partial<Txn>): Txn {
  seq += 1;
  return { txnId: 'TX' + seq, clientTxnId: 'c' + seq, ts: 0, type: 'adjust', qtyDelta: 0, actorUserId: 'u', ...p };
}

describe('consumable quantity', () => {
  it('starts at initialStock, available', () => {
    const s = deriveState([sabun], [], [], 0, stock);
    expect(s.items['ITM-S'].qty).toBe(10);
    expect(s.items['ITM-S'].status).toBe('available');
  });

  it('pemakaian decrements permanently', () => {
    const s = deriveState([sabun], [], [tx({ type: 'pemakaian', itemId: 'ITM-S', qtyDelta: -3 })], 0, stock);
    expect(s.items['ITM-S'].qty).toBe(7);
    expect(s.items['ITM-S'].status).toBe('available');
  });

  it('crosses to low at/below minStock', () => {
    const s = deriveState([sabun], [], [tx({ type: 'pemakaian', itemId: 'ITM-S', qtyDelta: -6 })], 0, stock);
    expect(s.items['ITM-S'].qty).toBe(4);
    expect(s.items['ITM-S'].status).toBe('low');
  });

  it('hits out at zero', () => {
    const s = deriveState([sabun], [], [tx({ type: 'pemakaian', itemId: 'ITM-S', qtyDelta: -10 })], 0, stock);
    expect(s.items['ITM-S'].qty).toBe(0);
    expect(s.items['ITM-S'].status).toBe('out');
  });
});

describe('24-jam rule (pengambilan outstanding window)', () => {
  it('counts outstanding within 24h', () => {
    const now = 5 * DAY;
    const s = deriveState([sabun], [], [tx({ type: 'pengambilan', itemId: 'ITM-S', qtyDelta: -2, ts: now })], now, stock);
    expect(s.items['ITM-S'].qty).toBe(8);
    expect(s.items['ITM-S'].outstanding).toBe(2);
  });

  it('drops from outstanding after 24h (stock stays consumed)', () => {
    const now = 5 * DAY;
    const taken = tx({ type: 'pengambilan', itemId: 'ITM-S', qtyDelta: -2, ts: now - 2 * DAY });
    const s = deriveState([sabun], [], [taken], now, stock);
    expect(s.items['ITM-S'].qty).toBe(8);
    expect(s.items['ITM-S'].outstanding).toBe(0);
  });

  it('pengembalian within window restocks (net zero)', () => {
    const now = 1 * DAY;
    const take = tx({ type: 'pengambilan', itemId: 'ITM-S', qtyDelta: -2, ts: 0 });
    const back = tx({ type: 'pengembalian', itemId: 'ITM-S', qtyDelta: +2, ts: 1000 });
    const s = deriveState([sabun], [], [take, back], now, stock);
    expect(s.items['ITM-S'].qty).toBe(10);
  });
});

describe('equipment lifecycle', () => {
  it('peminjaman → out with holder', () => {
    const s = deriveState([pisauItem], [pisau], [tx({ type: 'peminjaman', assetId: 'A-P7', recipient: 'Pos Potong 1', ts: 100 })], 200);
    expect(s.instances['A-P7'].status).toBe('out');
    expect(s.instances['A-P7'].holder).toBe('Pos Potong 1');
    expect(s.outByHolder['Pos Potong 1']).toHaveLength(1);
  });

  it('pengembalian normal → available', () => {
    const txns = [
      tx({ type: 'peminjaman', assetId: 'A-P7', recipient: 'Pos Potong 1' }),
      tx({ type: 'pengembalian', assetId: 'A-P7', condition: 'normal' }),
    ];
    expect(deriveState([pisauItem], [pisau], txns, 0).instances['A-P7'].status).toBe('available');
  });

  it('pengembalian rusak → broken (in rusak list)', () => {
    const txns = [
      tx({ type: 'peminjaman', assetId: 'A-P7', recipient: 'Pos Potong 1' }),
      tx({ type: 'pengembalian', assetId: 'A-P7', condition: 'rusak' }),
    ];
    const s = deriveState([pisauItem], [pisau], txns, 0);
    expect(s.instances['A-P7'].status).toBe('broken');
    expect(s.rusak.map((d) => d.instance.assetId)).toContain('A-P7');
  });

  it('pengembalian hilang → lost (in hilang list)', () => {
    const txns = [
      tx({ type: 'peminjaman', assetId: 'A-P7', recipient: 'Budi' }),
      tx({ type: 'pengembalian', assetId: 'A-P7', condition: 'hilang' }),
    ];
    const s = deriveState([pisauItem], [pisau], txns, 0);
    expect(s.instances['A-P7'].status).toBe('lost');
    expect(s.hilang.map((d) => d.instance.assetId)).toContain('A-P7');
  });
});

describe('out-with-a-holder (in_use deleted, session v1.6)', () => {
  // `digunakan`/`in_use` recorded no borrower, which defeated the stated goal
  // ("things go missing"). A durable that leaves is now always a loan with a holder.
  it('peminjaman records who has it', () => {
    const s = deriveState([pisauItem], [pisau], [tx({ type: 'peminjaman', assetId: 'A-P7', recipient: 'Pak Yusuf', ts: 50 })], 100);
    expect(s.instances['A-P7'].status).toBe('out');
    expect(s.instances['A-P7'].holder).toBe('Pak Yusuf');
    expect(s.outByHolder['Pak Yusuf'].map((d) => d.instance.assetId)).toEqual(['A-P7']);
  });

  it('a loan with no recipient still surfaces, bucketed as unknown', () => {
    const s = deriveState([pisauItem], [pisau], [tx({ type: 'peminjaman', assetId: 'A-P7' })], 0);
    expect(s.outByHolder['?']).toHaveLength(1);
  });

  it('an admin status_change can still retire an asset', () => {
    const txns = [tx({ type: 'status_change', assetId: 'A-P7', toStatus: 'retired' })];
    expect(deriveState([pisauItem], [pisau], txns, 0).instances['A-P7'].status).toBe('retired');
  });
});

describe('nullable minStock (Setting Minimum "-")', () => {
  it('null min is never "low", but still "out" at zero', () => {
    const nm: Item = { ...sabun, itemId: 'ITM-N', minStock: null };
    const nmStock: StockLine[] = [{ itemId: 'ITM-N', locationId: '', initialStock: 10 }];
    expect(deriveState([nm], [], [tx({ type: 'pemakaian', itemId: 'ITM-N', qtyDelta: -8 })], 0, nmStock).items['ITM-N'].status).toBe('available');
    expect(deriveState([nm], [], [tx({ type: 'pemakaian', itemId: 'ITM-N', qtyDelta: -10 })], 0, nmStock).items['ITM-N'].status).toBe('out');
  });
});

describe('append-only integrity', () => {
  it('reversal removes the original effect (history untouched)', () => {
    const orig = tx({ txnId: 'TX_ORIG', type: 'peminjaman', assetId: 'A-P7', recipient: 'Pos Potong 1' });
    const rev = tx({ type: 'reversal', reversesTxnId: 'TX_ORIG' });
    const s = deriveState([pisauItem], [pisau], [orig, rev], 0);
    expect(s.instances['A-P7'].status).toBe('available'); // as if the borrow never happened
  });

  it('clientTxnId dedupes a double-submit', () => {
    const a = tx({ clientTxnId: 'dup', type: 'pemakaian', itemId: 'ITM-S', qtyDelta: -3 });
    const b = tx({ clientTxnId: 'dup', type: 'pemakaian', itemId: 'ITM-S', qtyDelta: -3 });
    expect(deriveState([sabun], [], [a, b], 0, stock).items['ITM-S'].qty).toBe(7); // applied once, not twice
  });

  it('activeTxns sorts by ts', () => {
    const later = tx({ ts: 200 });
    const earlier = tx({ ts: 100 });
    expect(activeTxns([later, earlier]).map((t) => t.ts)).toEqual([100, 200]);
  });
});

describe('digunakan, restored (Part XVII)', () => {
  // The spec offers it as one of five keterangan and it belongs in HISTORI DATA. What was
  // wrong was never the word — it was giving it a state that recorded no holder.
  it('takes a durable out, with whoever has it, exactly like peminjaman', () => {
    const s = deriveState([pisauItem], [pisau],
      [tx({ type: 'digunakan', assetId: 'A-P7', recipient: 'Panitia Jumat', ts: 50 })], 100);
    expect(s.instances['A-P7'].status).toBe('out');
    expect(s.instances['A-P7'].holder).toBe('Panitia Jumat');
  });

  it('is returned by pengembalian like any other loan', () => {
    const txns = [
      tx({ type: 'digunakan', assetId: 'A-P7', recipient: 'Panitia' }),
      tx({ type: 'pengembalian', assetId: 'A-P7', condition: 'normal' }),
    ];
    expect(deriveState([pisauItem], [pisau], txns, 0).instances['A-P7'].status).toBe('available');
  });

  it('reduces a counted item and expects it back', () => {
    const s = deriveState([sabun], [], [tx({ type: 'digunakan', itemId: 'ITM-S', qtyDelta: -3 })], 0, stock);
    expect(s.items['ITM-S'].qty).toBe(7);
    expect(s.items['ITM-S'].outstanding).toBe(3);
  });
});

describe('takenTotal — the spec PENGAMBILAN counter', () => {
  it('counts everything ever taken out, and never counts returns back off it', () => {
    const txns = [
      tx({ type: 'pemakaian', itemId: 'ITM-S', qtyDelta: -2 }),
      tx({ type: 'pengambilan', itemId: 'ITM-S', qtyDelta: -3 }),
      tx({ type: 'pengembalian', itemId: 'ITM-S', qtyDelta: 3 }),
    ];
    const s = deriveState([sabun], [], txns, 0, stock);
    expect(s.items['ITM-S'].takenTotal).toBe(5);   // a cumulative counter, not a balance
    expect(s.items['ITM-S'].qty).toBe(8);          // the balance is separate
  });

  it('an admin adjustment is not "taken" — it corrects the books, nobody carried anything', () => {
    const s = deriveState([sabun], [], [tx({ type: 'adjust', itemId: 'ITM-S', qtyDelta: -4 })], 0, stock);
    expect(s.items['ITM-S'].takenTotal).toBe(0);
  });
});

// --- One item, several racks ----------------------------------------------------------------
//
// This is why quantity moved off the item. Before, counting rack A1 wrote what you found there
// over the item's WHOLE quantity, so the stock on A3 silently vanished. The reducer now folds
// per rack and sums at the end, which is the only ordering where a rack count means anything.

describe('stock split across racks', () => {
  const split: StockLine[] = [
    { itemId: 'ITM-S', locationId: 'LOC-A1', initialStock: 4 },
    { itemId: 'ITM-S', locationId: 'LOC-A3', initialStock: 6 },
  ];

  it('totals every rack, and reports the split alongside it', () => {
    const s = deriveState([sabun], [], [], 0, split).items['ITM-S'];
    expect(s.qty).toBe(10);
    expect(s.byLocation).toEqual({ 'LOC-A1': 4, 'LOC-A3': 6 });
  });

  it('takes stock off the rack the movement names, and leaves the rest untouched', () => {
    const s = deriveState(
      [sabun], [],
      [tx({ type: 'pemakaian', itemId: 'ITM-S', qtyDelta: -3, locationId: 'LOC-A1' })],
      0, split,
    ).items['ITM-S'];
    expect(s.byLocation).toEqual({ 'LOC-A1': 1, 'LOC-A3': 6 });
    expect(s.qty).toBe(7);
  });

  it('compares the minimum against the total, not against one shelf', () => {
    // A1 is down to 1 against a minimum of 5, but there are still ten in the gudang. Alarming
    // on the shelf would send somebody shopping for something we already have.
    const s = deriveState(
      [sabun], [],
      [tx({ type: 'pemakaian', itemId: 'ITM-S', qtyDelta: -3, locationId: 'LOC-A1' })],
      0, split,
    ).items['ITM-S'];
    expect(s.status).toBe('available');
  });

  it('folds a movement with no rack onto the unplaced pile', () => {
    // Visibly wrong beats quietly wrong: a log written before movements carried a rack should
    // show up somewhere a person can see it, not be spread over the shelves by guesswork.
    const s = deriveState(
      [sabun], [], [tx({ type: 'pemakaian', itemId: 'ITM-S', qtyDelta: -2 })], 0, split,
    ).items['ITM-S'];
    expect(s.byLocation).toEqual({ 'LOC-A1': 4, 'LOC-A3': 6, '': -2 });
  });
});

describe('a labelled item counts its units, not its opening quantity', () => {
  // The bug this fixes: four senter, one borrowed, and the stock list still said four. An
  // instance move carries `qtyDelta: 0`, so the quantity fold never touched it.
  const senter = (): Item => ({
    itemId: 'ITM-S', barcode: 'ALQ-ITM-S', name: 'Senter', categoryId: 'CAT-K',
    kind: 'equipment', unit: 'buah', trackBy: 'instance', minStock: null, active: true,
  });
  const units = (n: number): AssetInstance[] => Array.from({ length: n }, (_, k) => ({
    assetId: `ALQ-ITM-S-00${k + 1}`, itemId: 'ITM-S', label: `Senter #${k + 1}`,
    acquiredTs: 0, active: true,
  }));
  const lines: StockLine[] = [{ itemId: 'ITM-S', locationId: 'LOC-A1', initialStock: 4 }];
  let n = 0;
  const move = (assetId: string, p: Partial<Txn> & Pick<Txn, 'type'>): Txn => {
    n += 1;
    return {
      txnId: `T${n}`, clientTxnId: `C${n}`, ts: 1000 + n, assetId, qtyDelta: 0,
      actorUserId: 'USR-1', ...p,
    };
  };

  it('does not count a borrowed unit as stock somebody can take', () => {
    const s = deriveState([senter()], units(4), [
      move('ALQ-ITM-S-001', { type: 'peminjaman', recipient: 'Ronda malam' }),
    ], 9999, lines);
    expect(s.items['ITM-S'].qty).toBe(3);
  });

  it('still says we own it, because a borrowed thing is coming back', () => {
    const s = deriveState([senter()], units(4), [
      move('ALQ-ITM-S-001', { type: 'peminjaman' }),
    ], 9999, lines);
    expect(s.items['ITM-S'].ownedQty).toBe(4);
  });

  it('drops a lost unit out of both figures — it left the asset base entirely', () => {
    const s = deriveState([senter()], units(4), [
      move('ALQ-ITM-S-001', { type: 'peminjaman' }),
      move('ALQ-ITM-S-001', { type: 'pengembalian', condition: 'hilang' }),
    ], 9999, lines);
    expect(s.items['ITM-S']).toMatchObject({ qty: 3, ownedQty: 3 });
  });

  it('keeps a broken unit as owned but not available — it is ours, it does not work', () => {
    const s = deriveState([senter()], units(4), [
      move('ALQ-ITM-S-002', { type: 'peminjaman' }),
      move('ALQ-ITM-S-002', { type: 'pengembalian', condition: 'rusak' }),
    ], 9999, lines);
    expect(s.items['ITM-S']).toMatchObject({ qty: 3, ownedQty: 4 });
  });

  it('goes low when too many are out to meet the minimum', () => {
    // Consistent with a consumable, where taking stock out is what triggers the alarm.
    const item = { ...senter(), minStock: 2 };
    const s = deriveState([item], units(4), [
      move('ALQ-ITM-S-001', { type: 'peminjaman' }),
      move('ALQ-ITM-S-002', { type: 'peminjaman' }),
    ], 9999, lines);
    expect(s.items['ITM-S'].status).toBe('low');
  });

  it('falls back to the shelved count when folded without any units', () => {
    // A caller that does not build instances must not see every labelled item drop to zero.
    const s = deriveState([senter()], [], [], 9999, lines);
    expect(s.items['ITM-S']).toMatchObject({ qty: 4, ownedQty: 4 });
  });

  it('leaves a counted item alone — its two figures are one answer', () => {
    const ember: Item = { ...senter(), itemId: 'ITM-E', trackBy: 'quantity', name: 'Ember' };
    const s = deriveState([ember], [], [], 9999,
      [{ itemId: 'ITM-E', locationId: 'LOC-A1', initialStock: 8 }]);
    expect(s.items['ITM-E']).toMatchObject({ qty: 8, ownedQty: 8 });
  });
});

describe('an inspection', () => {
  it('changes nothing at all — it is a dated assertion, and the date is the point', () => {
    const item: Item = {
      itemId: 'ITM-0001', barcode: 'ALQ-ITM-0001', name: 'Pisau', categoryId: 'CAT-PHBI',
      kind: 'equipment', unit: 'buah', trackBy: 'instance', minStock: null, active: true,
    };
    const unit: AssetInstance = {
      assetId: 'ALQ-ITM-0001-001', itemId: 'ITM-0001', label: 'Pisau #1',
      acquiredTs: 0, active: true,
    };
    const check: Txn = {
      txnId: 'T1', clientTxnId: 'c1', ts: 1000, type: 'pemeriksaan',
      assetId: unit.assetId, qtyDelta: 0, actorUserId: 'USR-1',
    };
    const stock = [{ itemId: 'ITM-0001', locationId: '', initialStock: 1 }];

    const before = deriveState([item], [unit], [], 2000, stock);
    const after = deriveState([item], [unit], [check], 2000, stock);

    expect(after.instances[unit.assetId].status).toBe(before.instances[unit.assetId].status);
    expect(after.items['ITM-0001'].qty).toBe(before.items['ITM-0001'].qty);
  });
});

describe('borrowing something that is counted rather than labelled', () => {
  /*
   * Reported from the live register: an alat pel was taken with a PIN, the movement reached the
   * log with `qtyDelta: -1`, and the screen went on saying four. `peminjaman` was written for
   * INSTANCE-tracked equipment, where "out" is a status on a numbered unit — a mop, a tarpaulin
   * or a cable roll has no unit to carry it, so its "out" has to be the number.
   */
  const mop = (): Item => ({
    itemId: 'ITM-0008', barcode: 'ALQ-ITM-0008', name: 'Alat pel', categoryId: 'CAT-KEBERSIHAN',
    kind: 'equipment', unit: 'set', trackBy: 'quantity', minStock: null, active: true,
  });
  const lines = [{ itemId: 'ITM-0008', locationId: 'LOC-K1', initialStock: 4 }];
  const loan = (n: number): Txn => ({
    txnId: `T${n}`, clientTxnId: `c${n}`, ts: 1000 + n, type: 'peminjaman',
    itemId: 'ITM-0008', locationId: 'LOC-K1', qtyDelta: -1, actorUserId: 'USR-1',
  });

  it('takes it off the shelf, like any other thing that left', () => {
    const d = deriveState([mop()], [], [loan(1), loan(2)], 5000, lines);
    expect(d.items['ITM-0008'].qty).toBe(2);
  });

  it('takes it off the RACK it came from, not off the total in the abstract', () => {
    const d = deriveState([mop()], [], [loan(1)], 5000, lines);
    expect(d.items['ITM-0008'].byLocation['LOC-K1']).toBe(3);
  });

  it('counts toward PENGAMBILAN, because it was taken out', () => {
    expect(deriveState([mop()], [], [loan(1)], 5000, lines).items['ITM-0008'].takenTotal).toBe(1);
  });

  it('comes back on a pengembalian', () => {
    const back: Txn = {
      txnId: 'T9', clientTxnId: 'c9', ts: 3000, type: 'pengembalian',
      itemId: 'ITM-0008', locationId: 'LOC-K1', qtyDelta: 1, actorUserId: 'USR-1',
    };
    expect(deriveState([mop()], [], [loan(1), back], 5000, lines).items['ITM-0008'].qty).toBe(4);
  });
});
