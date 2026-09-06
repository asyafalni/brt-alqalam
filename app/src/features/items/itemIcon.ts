// An icon per item, so a row can be recognised without being read.
//
// This is an accessibility feature, not decoration. Reading fluency among the daily operators
// is an open question (docs/OBSERVE-MARBOT.md), and shape is recognised faster than text by
// everyone regardless — a marbot scanning a list for "the soap" finds a droplet before they
// find a word.
//
// The cascade goes UNIT → CATEGORY → KIND, most specific first, because the unit is the most
// reliable signal of what a thing physically is: anything measured in `galon` is a liquid
// whatever category someone filed it under. Categories are free-form (Part XI), so they are
// matched on keywords in the NAME, never on an id.

import {
  Box, Boxes, CircleDot, Droplets, Flame, Hammer, Layers, Lock, Package, Plug, Ruler,
  Scale, ShowerHead, SprayCan, Utensils, Wrench, Zap,
} from '@octanejs/lucide';
import type { Item } from '../../../../domain/types';

export type ItemIcon = (props: { class?: string }) => unknown;

/** Physical form, from the unit. The strongest signal available. */
const BY_UNIT: Record<string, ItemIcon> = {
  galon: Droplets, botol: Droplets, liter: Droplets, drum: Droplets, jerigen: Droplets,
  pak: Box, dus: Box, kardus: Box, box: Box,
  set: Boxes, paket: Boxes,
  roll: CircleDot, gulung: CircleDot,
  lembar: Layers, meter: Ruler, m: Ruler,
  kg: Scale, gram: Scale, ons: Scale,
  tabung: Flame,
};

/** What it is for, from the category name. Keyword-matched, since categories are free text. */
const BY_CATEGORY: [RegExp, ItemIcon][] = [
  // Whole words, not fragments. A bare /bersih/ also matches "air bersih" — clean water,
  // which is plumbing, not cleaning supplies. Caught by a test before it shipped.
  [/kebersihan|cleaning/i, SprayCan],
  // `elektronik` before `listrik`, since the former contains no substring of the latter but
  // both are plausible readings of a category someone typed quickly.
  [/elektronik|electronic/i, Plug],
  [/listrik|electric/i, Zap],
  [/sanitasi|plumbing|\bair\b/i, ShowerHead],
  [/sipil|bangunan/i, Hammer],
  [/keamanan|security/i, Lock],
  [/phbi|qurban|dapur|masak/i, Utensils],
];

/**
 * Pick an icon for an item. Always returns something — a list where some rows have an icon and
 * others do not reads as broken, not as "we had no opinion about this one".
 */
export function itemIcon(item: Pick<Item, 'unit' | 'kind'>, categoryName = ''): ItemIcon {
  const byUnit = BY_UNIT[item.unit.trim().toLowerCase()];
  if (byUnit) return byUnit;

  for (const [pattern, icon] of BY_CATEGORY) {
    if (pattern.test(categoryName)) return icon;
  }

  // A durable with no other signal is a tool; a consumable is a thing in a box.
  return item.kind === 'equipment' ? Wrench : Package;
}
