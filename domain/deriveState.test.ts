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
