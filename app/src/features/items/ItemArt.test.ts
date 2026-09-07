import { describe, it, expect } from 'vitest';
import { artFor } from './ItemArt';
import type { Item } from '../../../../domain/types';

const named = (name: string, p: Partial<Item> = {}): Pick<Item, 'name' | 'unit' | 'kind'> => ({
  name, unit: 'buah', kind: 'consumable', ...p,
});

describe('artFor — the substring traps', () => {
  // Every case here is a bug a bare substring match either caused or would cause. They are
  // named by the word that does the damage, so shortening a pattern later fails here rather
  // than in the gudang.
  it('does not read "cuci tangan" as a pair of pliers', () => {
    // This one shipped: /tang/ matched "Sabun cuci TANGan" and drew the soap as a wrench.
    expect(artFor(named('Sabun cuci tangan'))).toBe('spray');
  });

  it('lets a generic name still find its shape from the unit', () => {
    expect(artFor(named('Sabun cuci tangan', { unit: 'galon' }))).toBe('botol');
  });

  it('does not read "petugas" as a gas cylinder', () => {
    expect(artFor(named('Rompi petugas'))).not.toBe('tabung');
  });

  it('does not read "borax" as a drill', () => {
    expect(artFor(named('Borax pembersih'))).not.toBe('alat');
  });

  it('still matches the words when they stand alone', () => {
    expect(artFor(named('Tang kombinasi'))).toBe('alat');
    expect(artFor(named('Tabung gas 3kg'))).toBe('tabung');
    expect(artFor(named('Mata bor set'))).toBe('alat');
  });
});

describe('artFor — the cascade', () => {
  it('prefers the name over the category, because the name is more specific', () => {
    // Filed under PHBI, but it is a knife, and a knife is what should be drawn.
    expect(artFor(named('Pisau potong'), 'PHBI')).toBe('pisau');
  });

  it('takes the shape from a unit that names the container', () => {
    expect(artFor(named('Barang X', { unit: 'galon' }))).toBe('botol');
    expect(artFor(named('Barang X', { unit: 'tabung' }))).toBe('tabung');
  });

  it('does not let PACKAGING outrank the name', () => {
    // Both of these shipped wrong: a pak of bin bags drawn as a carton, a roll of cable
    // drawn as a tarpaulin. The unit says how it is sold, not what it is.
    expect(artFor(named('Kantong sampah besar', { unit: 'pak' }))).toBe('kantong');
    expect(artFor(named('Kabel roll 10m', { unit: 'roll' }))).toBe('kabel');
  });

  it('still uses packaging when the name says nothing', () => {
    expect(artFor(named('Isi ulang', { unit: 'dus' }))).toBe('kardus');
  });

  it('falls back to the category when name and unit both say nothing', () => {
    expect(artFor(named('Barang Y'), 'Listrik')).toBe('kabel');
    expect(artFor(named('Barang Y'), 'Keamanan')).toBe('kunci');
  });

  it('always returns something — a half-illustrated list reads as broken', () => {
    expect(artFor(named('Zzz'))).toBe('default');
    expect(artFor(named('Zzz', { kind: 'equipment' }))).toBe('alat');
  });

  it('tells a padlock from a spanner', () => {
    expect(artFor(named('Gembok gudang'))).toBe('kunci');
    expect(artFor(named('Kunci pas 12'))).toBe('alat');
  });
});
