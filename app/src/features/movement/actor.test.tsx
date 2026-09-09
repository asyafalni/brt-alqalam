import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@octanejs/testing-library';
import { MovementSheet } from './MovementSheet';
import type { MovementTarget } from './MovementSheet';
import type { Item } from '../../../../domain/types';

afterEach(cleanup);

const item: Item = {
  itemId: 'ITM-0001', barcode: 'ALQ-ITM-0001', name: 'Sabun cuci tangan',
  categoryId: 'CAT-KEBERSIHAN', kind: 'consumable', unit: 'galon',
  trackBy: 'quantity', minStock: null, active: true,
};
const target: MovementTarget = { item, direction: 'keluar' };

const sheet = (over: Partial<Parameters<typeof MovementSheet>[0]> = {}) => render(
  <MovementSheet
    target={target}
    locations={[]}
    onCommit={() => {}}
    onClose={() => {}}
    {...over}
  />,
);

/*
 * A phone session is reused for an HOUR without asking for anything (§58.5). Between the PIN and
 * the record there was nothing on screen naming the person the register was about to blame —
 * so a bar of soap could be logged against a colleague who went home, with no way to notice.
 */
describe('who the register is about to blame', () => {
  it('names them before Simpan, not on the receipt afterwards', () => {
    const r = sheet({ actor: 'Budi' });
    expect(r.getByText('Budi')).toBeTruthy();
  });

  it('offers a way out, because the tenth time it is the wrong person', () => {
    let ended = false;
    const r = sheet({ actor: 'Budi', onNotMe: () => { ended = true; } });
    fireEvent.click(r.getByText('Bukan kamu?'));
    expect(ended).toBe(true);
  });

  it('says nothing when no visit is open — the PIN sheet is about to ask', () => {
    const r = sheet({ actor: '' });
    expect(r.queryByText('Bukan kamu?')).toBeNull();
  });

  it('says nothing on an unconnected phone, where there is no roster to be anybody in', () => {
    // That mode already carries its own, louder banner: this record is going nowhere near the
    // spreadsheet. A second line about attribution would be attribution to nobody.
    const r = sheet({ actor: 'Budi', destination: 'local' });
    expect(r.queryByText('Bukan kamu?')).toBeNull();
    expect(r.getByText(/belum tersambung/i)).toBeTruthy();
  });
});
