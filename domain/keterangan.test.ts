import { describe, it, expect } from 'vitest';
import { planMovement, keteranganLabel } from './keterangan';
import type { Item } from './types';

const sabun: Pick<Item, 'kind' | 'trackBy'> = { kind: 'consumable', trackBy: 'quantity' };
const pisau: Pick<Item, 'kind' | 'trackBy'> = { kind: 'equipment', trackBy: 'instance' };
const terpal: Pick<Item, 'kind' | 'trackBy'> = { kind: 'equipment', trackBy: 'quantity' };

describe('planMovement — keterangan is inferred, never chosen', () => {
  it('consumable going out is pemakaian, and decrements', () => {
    expect(planMovement(sabun, { direction: 'keluar', qty: 3 }))
      .toEqual({ type: 'pemakaian', qtyDelta: -3 });
  });

  it('durable going out is peminjaman', () => {
    expect(planMovement(pisau, { direction: 'keluar', qty: 1 }).type).toBe('peminjaman');
  });

  it('anything coming back is pengembalian, and restocks', () => {
    expect(planMovement(sabun, { direction: 'masuk', qty: 2 }))
      .toEqual({ type: 'pengembalian', qtyDelta: 2 });
    expect(planMovement(pisau, { direction: 'masuk', qty: 1, condition: 'rusak' }).type)
      .toBe('pengembalian');
  });

  it('instance-tracked moves carry no quantity', () => {
    expect(planMovement(pisau, { direction: 'keluar', qty: 1 }).qtyDelta).toBe(0);
    expect(planMovement(pisau, { direction: 'masuk', qty: 1 }).qtyDelta).toBe(0);
  });

  it('a quantity-tracked durable still moves by amount', () => {
    expect(planMovement(terpal, { direction: 'keluar', qty: 4 }))
      .toEqual({ type: 'peminjaman', qtyDelta: -4 });
  });

  it('the exception path logs pengambilan (taken, but coming back)', () => {
    expect(planMovement(sabun, { direction: 'keluar', qty: 2, returnable: true }).type)
      .toBe('pengambilan');
  });

  it('normalises a quantity the operator typed with a sign', () => {
    expect(planMovement(sabun, { direction: 'keluar', qty: -3 }).qtyDelta).toBe(-3);
  });
});

describe('keteranganLabel — renders the spec HISTORI DATA column', () => {
  it('uses the spec words', () => {
    expect(keteranganLabel('pemakaian')).toBe('Pemakaian');
    expect(keteranganLabel('peminjaman')).toBe('Peminjaman');
  });

  it('qualifies a return by its condition', () => {
    expect(keteranganLabel('pengembalian', 'normal')).toBe('Pengembalian');
    expect(keteranganLabel('pengembalian', 'rusak')).toBe('Pengembalian (rusak)');
    expect(keteranganLabel('pengembalian', 'hilang')).toBe('Pengembalian (hilang)');
  });
});
