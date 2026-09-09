// "Nobody has asked for anything" and "you are not allowed to see this" are different facts.
//
// The public tier carries no Requests at all (§39), so a connected viewer sees an empty list
// while the spreadsheet holds seven rows. Showing the ordinary empty state there teaches people
// the register has lost their data — which is the exact failure this project keeps calling out.

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@octanejs/testing-library';
import { RequestBoard } from './RequestBoard';
import { useInventory } from '../../state/useInventory';
import type { Draft } from '../../state/useDraft';

const draft: Draft = {
  items: [], categories: [], locations: [], stock: [], txns: [], requests: [],
  requestedItemIds: [],
  readOnly: true, canRecord: false,
  setItems: () => {}, setCategories: () => {}, setLocations: () => {}, setStock: () => {},
  setRequests: () => {}, setTxns: () => {}, setRepair: () => {}, setPurchase: () => {},
  setCatalog: () => {}, reset: () => {}, loadDemo: () => {}, loadFrom: () => {},
};

function Board({ withheld }: { withheld: boolean }) {
  const inventory = useInventory(draft, 0);
  return <RequestBoard draft={draft} inventory={inventory} now={0} withheld={withheld} />;
}

afterEach(cleanup);

describe('an empty Pengajuan screen', () => {
  it('offers to add one when the list is genuinely empty', () => {
    const r = render(() => <Board withheld={false} />);
    expect(r.getByText(/Belum ada pengajuan/)).toBeTruthy();
  });

  it('explains itself instead when the tier is withholding them', () => {
    const r = render(() => <Board withheld />);
    expect(r.getByText(/tidak ditampilkan di sini/i)).toBeTruthy();
    // The reason has to be there, or it reads as a bug rather than a rule.
    expect(r.getByText(/menyebut nama orang/i)).toBeTruthy();
    expect(r.queryByText(/Belum ada pengajuan/)).toBeNull();
  });
});
