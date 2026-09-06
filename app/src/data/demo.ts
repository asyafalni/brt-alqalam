// Example data — a plausible masjid gudang, for demonstrating the app before any real
// opname has happened. Explicitly loaded by the operator, never auto-seeded: a register
// that quietly invents its own contents is worse than an empty one.

import type { Category, Item, Location } from '../../../domain/types';
import { SEED_CATEGORIES } from './seedCategories';

const DAY = 24 * 60 * 60 * 1000;

export const DEMO_LOCATIONS: Location[] = [
  { locationId: 'LOC-A1', code: 'A1', name: 'Sabun & pembersih', zone: 'Gudang Utama', order: 1, active: true, lastCountedTs: Date.now() - 3 * DAY },
  { locationId: 'LOC-A2', code: 'A2', name: 'Kain & kanebo', zone: 'Gudang Utama', order: 2, active: true, lastCountedTs: Date.now() - 45 * DAY },
  { locationId: 'LOC-A3', code: 'A3', name: 'Plastik & kantong', zone: 'Gudang Utama', order: 3, active: true },
  { locationId: 'LOC-B1', code: 'B1', name: 'Alat listrik', zone: 'Gudang Utama', order: 4, active: true },
  { locationId: 'LOC-B2', code: 'B2', name: 'Lampu & kabel', zone: 'Gudang Utama', order: 5, active: true },
  { locationId: 'LOC-P1', code: 'P1', name: 'Pisau & talenan', zone: 'Gudang PHBI', order: 1, active: true },
  { locationId: 'LOC-P2', code: 'P2', name: 'Terpal & tali', zone: 'Gudang PHBI', order: 2, active: true },
  { locationId: 'LOC-K1', code: 'K1', name: 'Alat kebersihan harian', zone: 'Ruang Marbot', order: 1, active: true },
];

interface Seed {
  name: string; cat: string; unit: string; kind: 'consumable' | 'equipment';
  qty: number; min: number | null; loc?: string; trackBy?: 'quantity' | 'instance';
}

const SEEDS: Seed[] = [
  { name: 'Sabun cuci tangan', cat: 'CAT-KEBERSIHAN', unit: 'galon', kind: 'consumable', qty: 12, min: 5, loc: 'LOC-A1' },
  { name: 'Pembersih lantai', cat: 'CAT-KEBERSIHAN', unit: 'botol', kind: 'consumable', qty: 3, min: 6, loc: 'LOC-A1' },
  { name: 'Karbol wangi', cat: 'CAT-KEBERSIHAN', unit: 'botol', kind: 'consumable', qty: 0, min: 4, loc: 'LOC-A1' },
  { name: 'Kanebo', cat: 'CAT-KEBERSIHAN', unit: 'buah', kind: 'consumable', qty: 18, min: null, loc: 'LOC-A2' },
  { name: 'Kain pel', cat: 'CAT-KEBERSIHAN', unit: 'buah', kind: 'consumable', qty: 7, min: 4, loc: 'LOC-A2' },
  { name: 'Kantong sampah besar', cat: 'CAT-KEBERSIHAN', unit: 'pak', kind: 'consumable', qty: 2, min: 3, loc: 'LOC-A3' },
  { name: 'Sapu lidi', cat: 'CAT-KEBERSIHAN', unit: 'buah', kind: 'equipment', qty: 6, min: null, loc: 'LOC-K1', trackBy: 'quantity' },
  { name: 'Alat pel', cat: 'CAT-KEBERSIHAN', unit: 'set', kind: 'equipment', qty: 4, min: null, loc: 'LOC-K1', trackBy: 'quantity' },
  { name: 'Lampu LED 12W', cat: 'CAT-LISTRIK', unit: 'buah', kind: 'consumable', qty: 24, min: 10, loc: 'LOC-B2' },
  { name: 'Kabel roll 10m', cat: 'CAT-LISTRIK', unit: 'roll', kind: 'equipment', qty: 3, min: null, loc: 'LOC-B2', trackBy: 'quantity' },
  { name: 'Obeng set', cat: 'CAT-LISTRIK', unit: 'set', kind: 'equipment', qty: 2, min: null, loc: 'LOC-B1' },
  { name: 'Tangga lipat', cat: 'CAT-SIPIL', unit: 'buah', kind: 'equipment', qty: 2, min: null, loc: 'LOC-B1' },
  { name: 'Pisau potong', cat: 'CAT-PHBI', unit: 'buah', kind: 'equipment', qty: 12, min: null, loc: 'LOC-P1' },
  { name: 'Talenan besar', cat: 'CAT-PHBI', unit: 'buah', kind: 'equipment', qty: 6, min: null, loc: 'LOC-P1', trackBy: 'quantity' },
  { name: 'Terpal 4x6', cat: 'CAT-PHBI', unit: 'lembar', kind: 'equipment', qty: 10, min: null, loc: 'LOC-P2', trackBy: 'quantity' },
  { name: 'Tali tambang', cat: 'CAT-PHBI', unit: 'roll', kind: 'consumable', qty: 4, min: 2, loc: 'LOC-P2' },
  { name: 'Timbangan gantung', cat: 'CAT-PHBI', unit: 'buah', kind: 'equipment', qty: 2, min: null, loc: 'LOC-P2' },
  // Deliberately unplaced — the pile in the corner every gudang has.
  { name: 'Kran air cadangan', cat: 'CAT-SANITASI', unit: 'buah', kind: 'consumable', qty: 5, min: 2 },
  { name: 'Selang air 10m', cat: 'CAT-SANITASI', unit: 'roll', kind: 'equipment', qty: 1, min: null, trackBy: 'quantity' },
];

export function demoDraft(): { items: Item[]; categories: Category[]; locations: Location[] } {
  const items: Item[] = SEEDS.map((s, n) => {
    const itemId = `ITM-${String(n + 1).padStart(4, '0')}`;
    return {
      itemId,
      barcode: `ALQ-${itemId}`,
      name: s.name,
      categoryId: s.cat,
      kind: s.kind,
      unit: s.unit,
      trackBy: s.trackBy ?? (s.kind === 'consumable' ? 'quantity' : 'instance'),
      minStock: s.min,
      initialStock: s.qty,
      active: true,
      ...(s.loc ? { locationId: s.loc } : {}),
    };
  });
  return { items, categories: SEED_CATEGORIES, locations: DEMO_LOCATIONS };
}
