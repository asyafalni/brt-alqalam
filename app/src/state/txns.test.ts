import { describe, it, expect } from 'vitest';
import { mergeTxns, unsettled } from './txns';
import type { Txn } from '../../../domain/types';

const txn = (clientTxnId: string, txnId = clientTxnId.toUpperCase()): Txn => ({
  txnId, clientTxnId, ts: 1, type: 'pemakaian', itemId: 'ITM-0001', qtyDelta: -1,
  actorUserId: 'u1',
});

describe('showing an appended movement before the poll catches up', () => {
  it('shows it immediately', () => {
    expect(mergeTxns([], [txn('c1')]).map((t) => t.clientTxnId)).toEqual(['c1']);
  });

  it('does NOT show it twice once the register carries it', () => {
    // The bug this exists to stop: the row appeared once from the read and once from the local
    // copy, so Histori Data listed one withdrawal as two.
    const merged = mergeTxns([txn('c1', 'T-1')], [txn('c1', 'T-1')]);
    expect(merged).toHaveLength(1);
  });

  it('matches on clientTxnId, not txnId — the gateway assigns the other one', () => {
    const merged = mergeTxns([txn('c1', 'T-99')], [txn('c1', 'LOCAL')]);
    expect(merged).toHaveLength(1);
    expect(merged[0].txnId).toBe('T-99');
  });

  it('keeps the register identity when there is nothing to add', () => {
    // Identity, not just contents: a fresh array every render is what stopped `useInventory`
    // memoising, so the whole log was re-folded on every keystroke.
    const reg = [txn('c1')];
    expect(mergeTxns(reg, [])).toBe(reg);
    expect(mergeTxns(reg, [txn('c1')])).toBe(reg);
  });
});

describe('forgetting local copies the register has caught up with', () => {
  it('drops the settled ones', () => {
    expect(unsettled([txn('c1')], [txn('c1'), txn('c2')]).map((t) => t.clientTxnId))
      .toEqual(['c2']);
  });

  it('keeps its identity while nothing has settled, so no render is provoked', () => {
    const fresh = [txn('c2')];
    expect(unsettled([txn('c1')], fresh)).toBe(fresh);
  });
});
