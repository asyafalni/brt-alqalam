// Example data — a plausible masjid gudang, for demonstrating the app before any real
// opname has happened. Explicitly loaded by the operator, never auto-seeded: a register
// that quietly invents its own contents is worse than an empty one.

import type { Category, Item, Location, Txn } from '../../../domain/types';
import { SEED_CATEGORIES } from './seedCategories';

const DAY = 24 * 60 * 60 * 1000;

export const DEMO_LOCATIONS: Location[] = [
  { locationId: 'LOC-A1', code: 'A1', name: 'Sabun & pembersih', zone: 'Gudang Utama', order: 1, active: true, lastCountedTs: Date.now() - 3 * DAY },
  { locationId: 'LOC-A2', code: 'A2', name: 'Kain & kanebo', zone: 'Gudang Utama', order: 2, active: true, lastCountedTs: Date.now() - 45 * DAY },
  { locationId: 'LOC-A3', code: 'A3', name: 'Plastik & kantong', zone: 'Gudang Utama', order: 3, active: true },
  { locationId: 'LOC-A4', code: 'A4', name: 'Tisu & pengharum', zone: 'Gudang Utama', order: 4, active: true },
  { locationId: 'LOC-B1', code: 'B1', name: 'Alat listrik', zone: 'Gudang Utama', order: 5, active: true },
  { locationId: 'LOC-B2', code: 'B2', name: 'Lampu & kabel', zone: 'Gudang Utama', order: 6, active: true, lastCountedTs: Date.now() - 60 * DAY },
  { locationId: 'LOC-B3', code: 'B3', name: 'Elektronik & audio', zone: 'Gudang Utama', order: 7, active: true },
  { locationId: 'LOC-C1', code: 'C1', name: 'Pipa & kran', zone: 'Gudang Utama', order: 8, active: true },
  { locationId: 'LOC-C2', code: 'C2', name: 'Alat tukang', zone: 'Gudang Utama', order: 9, active: true },
  { locationId: 'LOC-P1', code: 'P1', name: 'Pisau & talenan', zone: 'Gudang PHBI', order: 1, active: true },
  { locationId: 'LOC-P2', code: 'P2', name: 'Terpal & tali', zone: 'Gudang PHBI', order: 2, active: true },
  { locationId: 'LOC-P3', code: 'P3', name: 'Timbangan & wadah', zone: 'Gudang PHBI', order: 3, active: true },
  { locationId: 'LOC-K1', code: 'K1', name: 'Alat kebersihan harian', zone: 'Ruang Marbot', order: 1, active: true, lastCountedTs: Date.now() - 1 * DAY },
  { locationId: 'LOC-K2', code: 'K2', name: 'Stok harian', zone: 'Ruang Marbot', order: 2, active: true },
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
  { name: 'Tisu gulung', cat: 'CAT-KEBERSIHAN', unit: 'pak', kind: 'consumable', qty: 9, min: 4, loc: 'LOC-A4' },
  { name: 'Pengharum ruangan', cat: 'CAT-KEBERSIHAN', unit: 'botol', kind: 'consumable', qty: 6, min: 3, loc: 'LOC-A4' },
  { name: 'Sabun cuci piring', cat: 'CAT-KEBERSIHAN', unit: 'botol', kind: 'consumable', qty: 4, min: 2, loc: 'LOC-A1' },
  { name: 'Sikat lantai', cat: 'CAT-KEBERSIHAN', unit: 'buah', kind: 'equipment', qty: 5, min: null, loc: 'LOC-K1', trackBy: 'quantity' },
  { name: 'Ember besar', cat: 'CAT-KEBERSIHAN', unit: 'buah', kind: 'equipment', qty: 8, min: null, loc: 'LOC-K1', trackBy: 'quantity' },
  { name: 'Keset masjid', cat: 'CAT-KEBERSIHAN', unit: 'lembar', kind: 'consumable', qty: 14, min: null, loc: 'LOC-K2' },
  { name: 'Stop kontak', cat: 'CAT-LISTRIK', unit: 'buah', kind: 'consumable', qty: 7, min: 3, loc: 'LOC-B1' },
  { name: 'Saklar', cat: 'CAT-LISTRIK', unit: 'buah', kind: 'consumable', qty: 2, min: 4, loc: 'LOC-B1' },
  { name: 'Lakban listrik', cat: 'CAT-LISTRIK', unit: 'roll', kind: 'consumable', qty: 11, min: 3, loc: 'LOC-B1' },
  { name: 'Speaker aktif', cat: 'CAT-ELEKTRONIK', unit: 'buah', kind: 'equipment', qty: 4, min: null, loc: 'LOC-B3' },
  { name: 'Mikrofon', cat: 'CAT-ELEKTRONIK', unit: 'buah', kind: 'equipment', qty: 3, min: null, loc: 'LOC-B3' },
  { name: 'Kabel audio 5m', cat: 'CAT-ELEKTRONIK', unit: 'roll', kind: 'equipment', qty: 5, min: null, loc: 'LOC-B3', trackBy: 'quantity' },
  { name: 'Kran air', cat: 'CAT-SANITASI', unit: 'buah', kind: 'consumable', qty: 5, min: 2, loc: 'LOC-C1' },
  { name: 'Pipa PVC 4m', cat: 'CAT-SANITASI', unit: 'batang', kind: 'consumable', qty: 3, min: 2, loc: 'LOC-C1' },
  { name: 'Selang air 10m', cat: 'CAT-SANITASI', unit: 'roll', kind: 'equipment', qty: 2, min: null, loc: 'LOC-C1', trackBy: 'quantity' },
  { name: 'Lem pipa', cat: 'CAT-SANITASI', unit: 'botol', kind: 'consumable', qty: 1, min: 2, loc: 'LOC-C1' },
  { name: 'Palu', cat: 'CAT-SIPIL', unit: 'buah', kind: 'equipment', qty: 3, min: null, loc: 'LOC-C2' },
  { name: 'Gergaji', cat: 'CAT-SIPIL', unit: 'buah', kind: 'equipment', qty: 2, min: null, loc: 'LOC-C2' },
  { name: 'Paku 5cm', cat: 'CAT-SIPIL', unit: 'kg', kind: 'consumable', qty: 4, min: 2, loc: 'LOC-C2' },
  { name: 'Cat tembok putih', cat: 'CAT-SIPIL', unit: 'galon', kind: 'consumable', qty: 2, min: 1, loc: 'LOC-C2' },
  { name: 'Gembok', cat: 'CAT-KEAMANAN', unit: 'buah', kind: 'equipment', qty: 6, min: null, loc: 'LOC-C2', trackBy: 'quantity' },
  { name: 'Senter', cat: 'CAT-KEAMANAN', unit: 'buah', kind: 'equipment', qty: 4, min: null, loc: 'LOC-C2' },
  { name: 'Baterai AA', cat: 'CAT-KEAMANAN', unit: 'pak', kind: 'consumable', qty: 2, min: 3, loc: 'LOC-B1' },
  { name: 'Cooler box', cat: 'CAT-PHBI', unit: 'buah', kind: 'equipment', qty: 4, min: null, loc: 'LOC-P3' },
  { name: 'Baskom besar', cat: 'CAT-PHBI', unit: 'buah', kind: 'equipment', qty: 8, min: null, loc: 'LOC-P3', trackBy: 'quantity' },
  { name: 'Kantong daging', cat: 'CAT-PHBI', unit: 'pak', kind: 'consumable', qty: 6, min: 10, loc: 'LOC-P3' },
  { name: 'Asahan pisau', cat: 'CAT-PHBI', unit: 'buah', kind: 'equipment', qty: 3, min: null, loc: 'LOC-P1' },
  { name: 'Sarung tangan karet', cat: 'CAT-PHBI', unit: 'pak', kind: 'consumable', qty: 5, min: 4, loc: 'LOC-P3' },
  { name: 'Tabung gas 12kg', cat: 'CAT-LAIN', unit: 'tabung', kind: 'consumable', qty: 2, min: 1, loc: 'LOC-P2' },
  { name: 'Kompor besar', cat: 'CAT-LAIN', unit: 'buah', kind: 'equipment', qty: 2, min: null, loc: 'LOC-P2' },
  // Deliberately unplaced — the pile in the corner every gudang has.
  { name: 'Kran air cadangan', cat: 'CAT-SANITASI', unit: 'buah', kind: 'consumable', qty: 5, min: 2 },
  { name: 'Karpet gulung', cat: 'CAT-LAIN', unit: 'roll', kind: 'consumable', qty: 3, min: null },
  { name: 'Papan pengumuman', cat: 'CAT-LAIN', unit: 'buah', kind: 'equipment', qty: 1, min: null },
];

/**
 * A few weeks of plausible history.
 *
 * Without it the borrowed / broken / lost states are unreachable: every one of them is a
 * *derived* consequence of a transaction, so a catalog with no log can only ever show
 * tersedia / menipis / habis. These entries make the whole status language visible, and give
 * the per-item history something to show.
 */
function demoTxns(items: Item[]): Txn[] {
  const byName = (name: string) => items.find((i) => i.name === name);
  const txns: Txn[] = [];
  let n = 0;
  const add = (daysAgo: number, t: Partial<Txn>) => {
    n += 1;
    txns.push({
      txnId: `DEMO-T${n}`, clientTxnId: `demo-${n}`,
      ts: Date.now() - daysAgo * DAY,
      type: 'pemakaian', qtyDelta: 0, actorUserId: 'USR-DEMO', ...t,
    });
  };

  const pisau = byName('Pisau potong');
  const speaker = byName('Speaker aktif');
  const tangga = byName('Tangga lipat');
  const senter = byName('Senter');
  const bor = byName('Obeng set');

  // Consumption — the everyday case, and what makes the low-stock alarms make sense.
  for (const [name, days, qty] of [
    ['Sabun cuci tangan', 18, 2], ['Sabun cuci tangan', 9, 1], ['Sabun cuci tangan', 2, 1],
    ['Pembersih lantai', 21, 3], ['Pembersih lantai', 7, 2], ['Karbol wangi', 5, 4],
    ['Kantong sampah besar', 12, 2], ['Lampu LED 12W', 15, 4], ['Tisu gulung', 4, 3],
    ['Saklar', 30, 2], ['Baterai AA', 11, 2], ['Kantong daging', 40, 8],
  ] as [string, number, number][]) {
    const item = byName(name);
    if (item) add(days, { type: 'pemakaian', itemId: item.itemId, qtyDelta: -qty });
  }

  // On loan — the answer to "who has it", which is the whole point of tracking a borrower.
  if (speaker) {
    add(6, { type: 'peminjaman', assetId: `${speaker.barcode}-001`, recipient: 'Panitia PHBI', qtyDelta: 0 });
  }
  if (tangga) {
    add(3, { type: 'peminjaman', assetId: `${tangga.barcode}-002`, recipient: 'Pak Yusuf (renovasi)', qtyDelta: 0 });
  }
  if (senter) {
    add(1, { type: 'digunakan', assetId: `${senter.barcode}-001`, recipient: 'Ronda malam', qtyDelta: 0 });
  }

  // Broken — still ours, out of service, waiting on a repair.
  if (pisau) {
    add(20, { type: 'peminjaman', assetId: `${pisau.barcode}-003`, recipient: 'Pos Potong 1', qtyDelta: 0 });
    add(19, { type: 'pengembalian', assetId: `${pisau.barcode}-003`, condition: 'rusak', qtyDelta: 0,
      note: 'Gagang retak setelah qurban' });
  }
  if (bor) {
    add(35, { type: 'peminjaman', assetId: `${bor.barcode}-002`, recipient: 'Pak Yusuf', qtyDelta: 0 });
    add(34, { type: 'pengembalian', assetId: `${bor.barcode}-002`, condition: 'rusak', qtyDelta: 0,
      note: 'Mata obeng aus' });
  }

  // Lost — gone, and out of the active asset base entirely.
  if (pisau) {
    add(22, { type: 'peminjaman', assetId: `${pisau.barcode}-007`, recipient: 'Pos Potong 2', qtyDelta: 0 });
    add(21, { type: 'pengembalian', assetId: `${pisau.barcode}-007`, condition: 'hilang', qtyDelta: 0,
      note: 'Tidak kembali setelah hari-H' });
  }
  if (speaker) {
    add(50, { type: 'peminjaman', assetId: `${speaker.barcode}-004`, recipient: 'Acara luar', qtyDelta: 0 });
    add(48, { type: 'pengembalian', assetId: `${speaker.barcode}-004`, condition: 'hilang', qtyDelta: 0 });
  }

  // Returned in one piece, so "borrowed" is visibly a state things come back from.
  if (tangga) {
    add(28, { type: 'peminjaman', assetId: `${tangga.barcode}-001`, recipient: 'Pak Anto', qtyDelta: 0 });
    add(26, { type: 'pengembalian', assetId: `${tangga.barcode}-001`, condition: 'normal', qtyDelta: 0 });
  }

  return txns.sort((a, b) => a.ts - b.ts);
}

export function demoDraft(): { items: Item[]; categories: Category[]; locations: Location[]; txns: Txn[] } {
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
  return { items, categories: SEED_CATEGORIES, locations: DEMO_LOCATIONS, txns: demoTxns(items) };
}
