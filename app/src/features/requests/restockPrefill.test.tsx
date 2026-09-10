// Filing a purchase for something the register already knows about.
//
// The low-stock list identifies the problem; until this existed the only way to act on it was
// to open Pengajuan and retype the name, the unit and the quantity — all three of which the
// register already holds. That is the tap §0.0 exists to remove, and it is also the reason the
// "Sudah diajukan" bar on Beranda could never move off zero: nothing linked a low item to a
// request.

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@octanejs/testing-library';
import { RequestForm } from './RequestForm';
import type { Item } from '../../../../domain/types';

afterEach(cleanup);

const item = (itemId: string, name: string, unit: string): Item => ({
  itemId, barcode: `ALQ-${itemId}`, name, categoryId: 'CAT-KEBERSIHAN',
  kind: 'consumable', unit, trackBy: 'quantity', minStock: 5, active: true,
});

const ITEMS = [item('ITM-0001', 'Sabun cuci tangan', 'botol'), item('ITM-0002', 'Karbol', 'liter')];

const form = (prefill?: { type: 'beli'; itemId?: string }) => render(() => (
  <RequestForm
    items={ITEMS}
    instances={[]}
    requestId="REQ-1"
    prefill={prefill}
    onSubmit={() => {}}
    onCancel={() => {}}
  />
));

describe('a purchase prefilled from the low-stock list', () => {
  it('arrives on the existing item, not on "Barang baru"', () => {
    /* §94: one more catalog row called "Sabun cuci tangan" is exactly the mess §0 says the
       register exists to clear up. A restock has to name the thing we already own. */
    const r = form({ type: 'beli', itemId: 'ITM-0001' });
    expect((r.getByLabelText('Barang') as HTMLSelectElement).value).toBe('ITM-0001');
  });

  it('takes the name and the unit from the catalog, so neither is retyped', () => {
    const r = form({ type: 'beli', itemId: 'ITM-0001' });
    expect(r.container.textContent).toContain('botol');
    // The free-text name field is not even offered: the item is known.
    expect(r.queryByLabelText('Nama barang')).toBeNull();
  });

  it('still opens blank when nothing was prefilled', () => {
    const r = form({ type: 'beli' });
    expect((r.getByLabelText('Barang') as HTMLSelectElement).value).not.toBe('ITM-0001');
    expect(r.getByLabelText('Nama barang')).toBeTruthy();
  });

  it('does not fill in the REASON, which is the one thing only a person knows', () => {
    // §95: a request nobody can judge is one somebody has to chase the requester about, and
    // "stok menipis" typed by the app answers nothing a glance at the list would not.
    const r = form({ type: 'beli', itemId: 'ITM-0001' });
    expect((r.getByLabelText('Kenapa perlu dibeli?') as HTMLTextAreaElement).value).toBe('');
  });
});
