import type { Category } from '../../../domain/types';

/**
 * Seeded from the boss's eight domains, and identical to sheets/Categories.csv.
 * Categories are free-form and admin-editable (design doc Part XI) — this is a starting
 * point, not an enum. Nothing behavioural hangs off them; `kind` lives on the item.
 */
export const SEED_CATEGORIES: Category[] = [
  { categoryId: 'CAT-KEBERSIHAN', name: 'Kebersihan', order: 1, active: true },
  { categoryId: 'CAT-SANITASI', name: 'Sanitasi & Plumbing', order: 2, active: true },
  { categoryId: 'CAT-LISTRIK', name: 'Listrik', order: 3, active: true },
  { categoryId: 'CAT-ELEKTRONIK', name: 'Elektronik', order: 4, active: true },
  { categoryId: 'CAT-SIPIL', name: 'Sipil', order: 5, active: true },
  { categoryId: 'CAT-KEAMANAN', name: 'Keamanan', order: 6, active: true },
  { categoryId: 'CAT-PHBI', name: 'PHBI', order: 7, active: true },
  { categoryId: 'CAT-LAIN', name: 'Lain-lain', order: 8, active: true },
];

/** Offered as a datalist, never enforced — satuan is free text (spec: Edit Jenis Barang). */
export const COMMON_UNITS = ['buah', 'pak', 'galon', 'botol', 'liter', 'kg', 'meter', 'lembar', 'roll', 'set', 'tabung', 'dus'];
