// Drawings of STORAGE, not of stock.
//
// The rack tiles briefly borrowed the item drawings — a rack named "Sabun & pembersih" showed
// the soap bottle. It was cheap and it was wrong: a rack is a piece of furniture, and putting a
// bottle on the tile said "there is a bottle here" when the tile's whole job is to say "this is
// the shelf". The two are different nouns and they get different pictures.
//
// Which one a rack gets is a fact about the rack, so it is stored on the rack (`Location.artId`)
// and chosen when it is created — with a guess from its name for the common words, because
// asking about furniture during a stock-take would add a decision to a flow whose budget is
// about ten seconds an item (§0.0).
//
// Same brass-and-ink palette as the item drawings, and for the same reason: colour in this UI
// means status, and a rack tile is already coloured by what is on it.

import type { Location } from '../../../../domain/types';

const INK = '#2b2926';
const INK_SOFT = '#5f5a52';
const BRASS = '#c8933f';
const BRASS_DARK = '#a2742c';
const CREAM = '#f4eee2';
const STONE = '#b9b1a4';
const STONE_DARK = '#8d8578';

export type RackArtId =
  | 'rak' | 'lemari' | 'laci' | 'gantungan' | 'palet' | 'keranjang' | 'peti' | 'dinding'
  | 'lantai';

/* -------------------------------------------------------------------------------------------
   Every drawing sits in the same 64×64 box, standing on the same floor line (y≈54), so a row
   of tiles does not bob up and down.
------------------------------------------------------------------------------------------- */

const SHAPES: Record<RackArtId, () => unknown> = {
  /** Open shelving — the default, and what most people mean by "rak". */
  rak: () => (
    <>
      <rect x="10" y="10" width="5" height="46" rx="2" fill={STONE_DARK} />
      <rect x="49" y="10" width="5" height="46" rx="2" fill={STONE_DARK} />
      <rect x="10" y="20" width="44" height="4.5" fill={BRASS} />
      <rect x="10" y="33" width="44" height="4.5" fill={BRASS} />
      <rect x="10" y="46" width="44" height="4.5" fill={BRASS} />
      <rect x="18" y="12" width="12" height="8" rx="1.5" fill={CREAM} />
      <rect x="34" y="25" width="14" height="8" rx="1.5" fill={CREAM} />
      <rect x="17" y="38" width="10" height="8" rx="1.5" fill={CREAM} />
    </>
  ),

  /** Lemari — a closed cabinet, read by its two doors and their handles. */
  lemari: () => (
    <>
      <rect x="12" y="10" width="40" height="44" rx="3" fill={BRASS} />
      <path d="M32 10h17a3 3 0 0 1 3 3v38a3 3 0 0 1-3 3H32z" fill={BRASS_DARK} />
      <path d="M32 12v40" stroke={INK} stroke-width="1.6" />
      <rect x="27" y="28" width="3" height="9" rx="1.5" fill={INK} />
      <rect x="34" y="28" width="3" height="9" rx="1.5" fill={INK} />
      <rect x="14" y="54" width="5" height="4" rx="1.5" fill={INK_SOFT} />
      <rect x="45" y="54" width="5" height="4" rx="1.5" fill={INK_SOFT} />
    </>
  ),

  /** Laci — a chest of drawers, read by the stacked fronts and their pulls. */
  laci: () => (
    <>
      <rect x="11" y="12" width="42" height="42" rx="3" fill={STONE_DARK} />
      <rect x="14" y="15" width="36" height="11" rx="2" fill={BRASS} />
      <rect x="14" y="28" width="36" height="11" rx="2" fill={BRASS} />
      <rect x="14" y="41" width="36" height="11" rx="2" fill={BRASS} />
      <rect x="26" y="19" width="12" height="3" rx="1.5" fill={INK} />
      <rect x="26" y="32" width="12" height="3" rx="1.5" fill={INK} />
      <rect x="26" y="45" width="12" height="3" rx="1.5" fill={INK} />
    </>
  ),

  /** Gantungan — a wall of hooks, for the things that hang rather than stack. */
  gantungan: () => (
    <>
      <rect x="9" y="12" width="46" height="30" rx="3" fill={CREAM} stroke={STONE_DARK} stroke-width="1.6" />
      <circle cx="19" cy="20" r="1.4" fill={STONE} />
      <circle cx="32" cy="20" r="1.4" fill={STONE} />
      <circle cx="45" cy="20" r="1.4" fill={STONE} />
      <path d="M19 21v6c0 3 4 3 4 0" stroke={BRASS_DARK} stroke-width="2.6" fill="none" stroke-linecap="round" />
      <path d="M32 21v9c0 3 4 3 4 0" stroke={BRASS_DARK} stroke-width="2.6" fill="none" stroke-linecap="round" />
      <path d="M45 21v6c0 3 4 3 4 0" stroke={BRASS_DARK} stroke-width="2.6" fill="none" stroke-linecap="round" />
      <rect x="14" y="46" width="36" height="8" rx="2" fill={BRASS} />
    </>
  ),

  /** Palet — stacked on the floor, which is where the bulky things actually live. */
  palet: () => (
    <>
      <rect x="16" y="14" width="18" height="14" rx="1.5" fill={BRASS} />
      <rect x="34" y="18" width="16" height="10" rx="1.5" fill={BRASS_DARK} />
      <rect x="14" y="28" width="36" height="14" rx="1.5" fill={BRASS} />
      <rect x="32" y="28" width="18" height="14" rx="1.5" fill={BRASS_DARK} />
      <rect x="10" y="44" width="44" height="4" fill={STONE_DARK} />
      <rect x="10" y="50" width="44" height="4" fill={STONE_DARK} />
      <rect x="12" y="44" width="5" height="10" fill={STONE} />
      <rect x="29" y="44" width="5" height="10" fill={STONE} />
      <rect x="46" y="44" width="5" height="10" fill={STONE} />
    </>
  ),

  /** Keranjang — open bins on a frame, tilted the way they are on a picking rack. */
  keranjang: () => (
    <>
      <rect x="10" y="12" width="4" height="44" rx="2" fill={STONE_DARK} />
      <rect x="50" y="12" width="4" height="44" rx="2" fill={STONE_DARK} />
      <path d="M14 16h36l-3 12H17z" fill={BRASS} />
      <path d="M32 16h18l-3 12H32z" fill={BRASS_DARK} />
      <path d="M14 32h36l-3 12H17z" fill={BRASS} />
      <path d="M32 32h18l-3 12H32z" fill={BRASS_DARK} />
      <path d="M18 20h28M18 36h28" stroke={CREAM} stroke-width="1.6" stroke-linecap="round" opacity="0.7" />
      <rect x="12" y="52" width="40" height="4" rx="2" fill={STONE_DARK} />
    </>
  ),

  /** Peti — a stack of crates, for a corner nobody built a shelf into. */
  peti: () => (
    <>
      <rect x="20" y="12" width="26" height="18" rx="2" fill={BRASS} />
      <rect x="33" y="12" width="13" height="18" rx="2" fill={BRASS_DARK} />
      <rect x="20" y="18" width="26" height="3.5" fill={CREAM} opacity="0.8" />
      <rect x="12" y="32" width="30" height="20" rx="2" fill={BRASS} />
      <rect x="27" y="32" width="15" height="20" rx="2" fill={BRASS_DARK} />
      <rect x="12" y="39" width="30" height="3.5" fill={CREAM} opacity="0.8" />
      <rect x="42" y="34" width="12" height="18" rx="2" fill={STONE} />
      <rect x="42" y="40" width="12" height="3" fill={CREAM} opacity="0.7" />
    </>
  ),

  /** Dinding — a floating shelf, screwed to a wall rather than standing on the floor. */
  dinding: () => (
    <>
      <path d="M8 14h48" stroke={STONE} stroke-width="2" stroke-linecap="round" opacity="0.6" />
      <rect x="10" y="24" width="44" height="5" rx="1.5" fill={BRASS} />
      <rect x="10" y="42" width="44" height="5" rx="1.5" fill={BRASS} />
      <path d="M16 29v13M48 29v13" stroke={STONE_DARK} stroke-width="2.4" stroke-linecap="round" />
      <rect x="20" y="16" width="11" height="8" rx="1.5" fill={CREAM} stroke={STONE} stroke-width="1.2" />
      <rect x="34" y="14" width="9" height="10" rx="1.5" fill={CREAM} stroke={STONE} stroke-width="1.2" />
      <rect x="24" y="34" width="14" height="8" rx="1.5" fill={CREAM} stroke={STONE} stroke-width="1.2" />
    </>
  ),

  /**
   * Lantai — no furniture at all: a marked-off patch of floor, and what the unplaced pile
   * really is. Dashed, because it is a place by agreement rather than by construction.
   */
  lantai: () => (
    <>
      <rect
        x="9" y="20" width="46" height="30" rx="4"
        fill="none" stroke={STONE_DARK} stroke-width="2.4" stroke-dasharray="5 4"
      />
      <rect x="19" y="30" width="14" height="12" rx="2" fill={BRASS} />
      <rect x="26" y="30" width="7" height="12" rx="2" fill={BRASS_DARK} />
      <rect x="34" y="34" width="11" height="8" rx="2" fill={STONE} />
    </>
  ),
};

export const RACK_ART_IDS = Object.keys(SHAPES) as RackArtId[];

export const isRackArtId = (v: string | undefined): v is RackArtId =>
  v != null && Object.prototype.hasOwnProperty.call(SHAPES, v);

/** Plain-language names for the picker. A person chooses furniture, not an identifier. */
export const RACK_ART_LABEL: Record<RackArtId, string> = {
  rak: 'Rak terbuka',
  lemari: 'Lemari',
  laci: 'Laci',
  gantungan: 'Gantungan',
  palet: 'Palet / lantai',
  keranjang: 'Keranjang',
  peti: 'Tumpukan peti',
  dinding: 'Rak dinding',
  lantai: 'Area lantai',
};

/**
 * Words people actually paint on a shelf or type into the name. Anchored, for the reason the
 * item drawings had to be: a bare /laci/ also matches "kelaci"-shaped typos, and /rak/ is
 * inside "kerakusan" and, more to the point, inside "barak" and "rakit".
 */
const BY_NAME: [RegExp, RackArtId][] = [
  [/lemari|kabinet|loker/i, 'lemari'],
  [/\blaci\b|drawer/i, 'laci'],
  [/gantung|hook|kait|dinding pegboard/i, 'gantungan'],
  [/palet|pallet/i, 'palet'],
  [/keranjang|\bbin\b|bak\b/i, 'keranjang'],
  [/peti|\bkotak\b|krat|dus/i, 'peti'],
  [/dinding|wall|ambalan/i, 'dinding'],
  [/lantai|pojok|sudut|halaman|teras/i, 'lantai'],
];

/**
 * What kind of storage this is. An explicit choice wins; otherwise the name is read, and
 * otherwise it is an open shelf — which is what "rak" means to everybody and what most of a
 * gudang actually contains.
 */
export function rackArtFor(location: Pick<Location, 'code' | 'name' | 'zone' | 'artId'>): RackArtId {
  if (isRackArtId(location.artId)) return location.artId;
  const haystack = `${location.name} ${location.zone} ${location.code}`;
  for (const [pattern, id] of BY_NAME) {
    if (pattern.test(haystack)) return id;
  }
  return 'rak';
}

/**
 * `aria-hidden` throughout: the rack's code and name sit right beside it, and announcing
 * "gambar rak terbuka" before every tile is noise rather than access.
 */
export function RackArt(
  { art, size = 24, class: cls = '' }: { art: RackArtId; size?: number; class?: string },
) {
  const Shape = SHAPES[art] ?? SHAPES.rak;
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      class={`shrink-0 ${cls}`}
      shape-rendering="geometricPrecision"
      aria-hidden="true"
      focusable="false"
    >
      <Shape />
    </svg>
  );
}
