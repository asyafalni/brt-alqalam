import { describe, it, expect } from 'vitest';
import { itemIcon } from './itemIcon';
import type { Item } from '../../../../domain/types';

const item = (unit: string, kind: Item['kind'] = 'consumable'): Pick<Item, 'unit' | 'kind'> =>
  ({ unit, kind });

describe('itemIcon', () => {
  it('reads the unit first — anything in galon is a liquid whatever it was filed under', () => {
    const liquid = itemIcon(item('galon'), 'Listrik');
    expect(liquid).toBe(itemIcon(item('botol'), 'PHBI'));
    expect(liquid).not.toBe(itemIcon(item('pak'), 'Kebersihan'));
  });

  it('groups units that mean the same physical thing', () => {
    for (const group of [['galon', 'botol', 'liter', 'jerigen'], ['pak', 'dus', 'kardus'], ['kg', 'gram', 'ons']]) {
      const [first, ...rest] = group.map((u) => itemIcon(item(u)));
      rest.forEach((icon) => expect(icon).toBe(first));
    }
  });

  it('is case- and whitespace-tolerant, because people type units by hand', () => {
    expect(itemIcon(item('  GALON '))).toBe(itemIcon(item('galon')));
  });

  it('falls back to the category when the unit says nothing — "buah" is not a shape', () => {
    expect(itemIcon(item('buah'), 'Kebersihan')).not.toBe(itemIcon(item('buah'), 'Listrik'));
    expect(itemIcon(item('buah'), 'Kebersihan')).toBe(itemIcon(item('buah'), 'Alat Kebersihan Harian'));
  });

  it('matches categories on keywords, since they are free-form text', () => {
    expect(itemIcon(item('buah'), 'Sanitasi & Plumbing')).toBe(itemIcon(item('buah'), 'Air bersih'));
  });

  it('separates a tool from a consumable when nothing else distinguishes them', () => {
    expect(itemIcon(item('buah', 'equipment'), 'Lain-lain'))
      .not.toBe(itemIcon(item('buah', 'consumable'), 'Lain-lain'));
  });

  it('always returns something — a half-iconed list reads as broken', () => {
    for (const [unit, cat] of [['', ''], ['sesuatu', 'entah'], ['buah', '']]) {
      expect(typeof itemIcon(item(unit), cat)).toBe('function');
    }
  });
});
