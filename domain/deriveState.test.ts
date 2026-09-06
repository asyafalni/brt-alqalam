import { describe, it, expect } from 'vitest';
import { deriveState, activeTxns } from './deriveState';
import type { Item, AssetInstance, Txn } from './types';

const DAY = 24 * 60 * 60 * 1000;

const sabun: Item = {
  itemId: 'ITM-S', barcode: 'b', name: 'Sabun', categoryId: 'CAT-KEBERSIHAN',
  kind: 'consumable', unit: 'galon', trackBy: 'quantity',
  minStock: 5, initialStock: 10, active: true,
};
const pisauItem: Item = {
  itemId: 'ITM-P', barcode: 'p', name: 'Pisau', categoryId: 'CAT-PHBI',
  kind: 'equipment', unit: 'buah', trackBy: 'instance',
  minStock: 0, initialStock: 0, active: true,
};
const pisau: AssetInstance = { assetId: 'A-P7', itemId: 'ITM-P', label: 'Pisau #7', acquiredTs: 0, active: true };

let seq = 0;
function tx(p: Partial<Txn>): Txn {
  seq += 1;
  return { txnId: 'TX' + seq, clientTxnId: 'c' + seq, ts: 0, type: 'adjust', qtyDelta: 0, actorUserId: 'u', ...p };
}

describe('consumable quantity', () => {
  it('starts at initialStock, available', () => {
    const s = deriveState([sabun], [], [], 0);
    expect(s.items['ITM-S'].qty).toBe(10);
    expect(s.items['ITM-S'].status).toBe('available');
  });

  it('pemakaian decrements permanently', () => {
    const s = deriveState([sabun], [], [tx({ type: 'pemakaian', itemId: 'ITM-S', qtyDelta: -3 })], 0);
    expect(s.items['ITM-S'].qty).toBe(7);
    expect(s.items['ITM-S'].status).toBe('available');
  });

  it('crosses to low at/below minStock', () => {
    const s = deriveState([sabun], [], [tx({ type: 'pemakaian', itemId: 'ITM-S', qtyDelta: -6 })], 0);
    expect(s.items['ITM-S'].qty).toBe(4);
    expect(s.items['ITM-S'].status).toBe('low');
  });

  it('hits out at zero', () => {
    const s = deriveState([sabun], [], [tx({ type: 'pemakaian', itemId: 'ITM-S', qtyDelta: -10 })], 0);
    expect(s.items['ITM-S'].qty).toBe(0);
    expect(s.items['ITM-S'].status).toBe('out');
  });
});

describe('24-jam rule (pengambilan outstanding window)', () => {
  it('counts outstanding within 24h', () => {
    const now = 5 * DAY;
    const s = deriveState([sabun], [], [tx({ type: 'pengambilan', itemId: 'ITM-S', qtyDelta: -2, ts: now })], now);
    expect(s.items['ITM-S'].qty).toBe(8);
    expect(s.items['ITM-S'].outstanding).toBe(2);
  });

  it('drops from outstanding after 24h (stock stays consumed)', () => {
    const now = 5 * DAY;
    const taken = tx({ type: 'pengambilan', itemId: 'ITM-S', qtyDelta: -2, ts: now - 2 * DAY });
    const s = deriveState([sabun], [], [taken], now);
    expect(s.items['ITM-S'].qty).toBe(8);
    expect(s.items['ITM-S'].outstanding).toBe(0);
  });

  it('pengembalian within window restocks (net zero)', () => {
    const now = 1 * DAY;
    const take = tx({ type: 'pengambilan', itemId: 'ITM-S', qtyDelta: -2, ts: 0 });
    const back = tx({ type: 'pengembalian', itemId: 'ITM-S', qtyDelta: +2, ts: 1000 });
    const s = deriveState([sabun], [], [take, back], now);
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
    expect(deriveState([nm], [], [tx({ type: 'pemakaian', itemId: 'ITM-N', qtyDelta: -8 })], 0).items['ITM-N'].status).toBe('available');
    expect(deriveState([nm], [], [tx({ type: 'pemakaian', itemId: 'ITM-N', qtyDelta: -10 })], 0).items['ITM-N'].status).toBe('out');
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
    expect(deriveState([sabun], [], [a, b], 0).items['ITM-S'].qty).toBe(7); // applied once, not twice
  });

  it('activeTxns sorts by ts', () => {
    const later = tx({ ts: 200 });
    const earlier = tx({ ts: 100 });
    expect(activeTxns([later, earlier]).map((t) => t.ts)).toEqual([100, 200]);
  });
});
