// Drawn illustrations, one per physical archetype, from 32px in a list to 200px on a detail page.
//
// WHY DRAWINGS AND NOT LINE ICONS. This replaced a Lucide glyph per item, and the glyph could
// not do both jobs. A 1.5px outline is designed to read at 16–24px; scaled to 96px on a detail
// screen it becomes a large thin drawing of a rectangle — technically correct, visually empty.
// These are filled shapes with a ground, a shadow and two tones, so one asset carries a 28px
// row and a 96px hero without either looking like a stretched version of the other.
//
// WHY THEY ARE ALL THE SAME TWO COLOURS. Colour in this UI means *status* — green available,
// amber low, red out, orange rusak, rose hilang (§66). If illustrations varied their colour by
// item, the loudest colours on any screen would be the ones signalling nothing, and a brass
// bottle beside a red bottle would read as a warning about the second one. So every drawing
// uses the same fixed brass-and-ink pairing, and colour stays free to mean what it means.
//
// WHY SVG AND NOT IMAGES. These ship inside the JS bundle at a few hundred bytes each, need no
// network, and stay sharp at any size on any screen — which matters, because the gudang tablet
// is the device least likely to have either bandwidth or a high-density display to waste.
//
// This is distinct from the *photographs* an item can carry: a drawing says what kind of thing
// this is and is always present; a photo says what this particular thing looks like and has to
// be taken by somebody. See `data/photoStore.ts`.

import type { Item } from '../../../../domain/types';

const INK = '#2b2926';
const INK_SOFT = '#5f5a52';
const BRASS = '#c8933f';
const BRASS_DARK = '#a2742c';
const CREAM = '#f4eee2';
const STONE = '#b9b1a4';
const STONE_DARK = '#8d8578';

export type ArtId =
  | 'botol' | 'spray' | 'pel' | 'kain' | 'pisau' | 'talenan' | 'lampu' | 'kabel'
  | 'kantong' | 'kardus' | 'terpal' | 'timbangan' | 'alat' | 'pipa' | 'audio'
  | 'tabung' | 'kunci' | 'ember' | 'cooler' | 'tangga' | 'sarung' | 'cat'
  | 'default';

/* -------------------------------------------------------------------------------------------
   The drawings. Every one is authored inside the same 64×64 box, sitting on the same baseline
   (y≈52) at roughly the same optical weight, so a column of them does not bob up and down.
------------------------------------------------------------------------------------------- */

const SHAPES: Record<ArtId, () => unknown> = {
  /** Galon, jerigen, botol besar — anything measured as a liquid. */
  botol: () => (
    <>
      <path d="M26 16h12v6h-12z" fill={BRASS_DARK} />
      <rect x="24" y="10" width="16" height="7" rx="2" fill={INK} />
      <path d="M20 26a6 6 0 0 1 6-6h12a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6H26a6 6 0 0 1-6-6z" fill={BRASS} />
      <path d="M38 20a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6z" fill={BRASS_DARK} />
      <rect x="23" y="30" width="18" height="12" rx="2" fill={CREAM} />
      <rect x="26" y="34" width="12" height="1.8" rx="0.9" fill={STONE} />
      <rect x="26" y="37.5" width="8" height="1.8" rx="0.9" fill={STONE} />
    </>
  ),

  /** Sabun cair, pembersih, karbol — a trigger bottle. */
  spray: () => (
    <>
      <path d="M30 14h8v8h-8z" fill={BRASS_DARK} />
      <path d="M30 12h-9a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h9z" fill={INK} />
      <path d="M22 18v5a2 2 0 0 0 4 0v-5z" fill={INK_SOFT} />
      <path d="M26 26a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v22a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4z" fill={BRASS} />
      <path d="M38 22a4 4 0 0 1 4 4v22a4 4 0 0 1-4 4z" fill={BRASS_DARK} />
      <rect x="28" y="31" width="14" height="11" rx="2" fill={CREAM} />
      <rect x="30.5" y="35" width="9" height="1.8" rx="0.9" fill={STONE} />
    </>
  ),

  /** Pel, sapu, sikat gagang panjang. */
  pel: () => (
    <>
      <rect x="30" y="8" width="4" height="30" rx="2" fill={STONE_DARK} />
      <rect x="30" y="8" width="1.6" height="30" fill={STONE} />
      <path d="M22 38h20l3 14H19z" fill={BRASS} />
      <path d="M32 38h10l3 14H32z" fill={BRASS_DARK} />
      <path d="M21 38h22v3H21z" fill={INK} />
      <path d="M24 44v6M28 44v7M36 44v7M40 44v6" stroke={CREAM} stroke-width="1.4" stroke-linecap="round" />
    </>
  ),

  /** Kain, kanebo, lap — folded cloth. */
  kain: () => (
    <>
      <path d="M14 40l18-8 18 8-18 8z" fill={STONE_DARK} />
      <path d="M14 34l18-8 18 8-18 8z" fill={CREAM} />
      <path d="M32 26l18 8-18 8z" fill={STONE} />
      <path d="M14 28l18-8 18 8-18 8z" fill={BRASS} />
      <path d="M32 20l18 8-18 8z" fill={BRASS_DARK} />
    </>
  ),

  /**
   * Pisau — the item the owner says actually goes missing, especially after Qurban.
   *
   * Two things were wrong with the first attempt and both only showed up in the gallery at
   * 32px: the blade was drawn in cream, which is barely a shade off the ground disc, so it
   * vanished and left the handle floating as an unexplained black bar; and it was too shallow
   * to read as a blade at all. It is now filled in the mid stone tone, given a real belly, and
   * the bolster ties the handle to the steel so the two read as one object.
   */
  pisau: () => (
    <>
      <path d="M37 26v19c-10 3-21-1-30-12z" fill={STONE} />
      <path d="M37 26L7 33c9 1 20-2 30-4z" fill={CREAM} />
      <path d="M37 45c-10 3-21-1-30-12 10 6 20 8 30 8z" fill={STONE_DARK} />
      <rect x="34" y="26" width="5" height="19" rx="1.6" fill={BRASS} />
      <rect x="38" y="28.5" width="18" height="14" rx="4" fill={INK} />
      <rect x="38" y="28.5" width="18" height="5" rx="2.5" fill={INK_SOFT} />
      <circle cx="44" cy="35.5" r="1.5" fill={BRASS} />
      <circle cx="50" cy="35.5" r="1.5" fill={BRASS} />
    </>
  ),

  /** Talenan, nampan, papan — a flat board. */
  talenan: () => (
    <>
      <path d="M16 16h26a6 6 0 0 1 6 6v24a6 6 0 0 1-6 6H16z" fill={BRASS} />
      <path d="M16 16h13v36H16z" fill={BRASS_DARK} />
      <rect x="10" y="24" width="8" height="14" rx="4" fill={BRASS_DARK} />
      <circle cx="14" cy="31" r="2" fill={CREAM} />
      <path d="M34 24v20M40 24v20" stroke={CREAM} stroke-width="1.4" stroke-linecap="round" opacity="0.7" />
    </>
  ),

  /** Lampu, bohlam. */
  lampu: () => (
    <>
      <path d="M32 10a14 14 0 0 1 8 25.4V40H24v-4.6A14 14 0 0 1 32 10z" fill={BRASS} />
      <path d="M32 10a14 14 0 0 1 8 25.4V40h-8z" fill={BRASS_DARK} />
      <path d="M28 20a6 6 0 0 1 5-4" stroke={CREAM} stroke-width="2.4" stroke-linecap="round" fill="none" />
      <rect x="24" y="40" width="16" height="4" rx="1.4" fill={INK} />
      <rect x="25" y="45" width="14" height="3.6" rx="1.4" fill={INK_SOFT} />
      <path d="M27 50h10l-2 3h-6z" fill={INK} />
    </>
  ),

  /** Kabel, steker, stop kontak. */
  kabel: () => (
    <>
      <rect x="22" y="26" width="20" height="22" rx="5" fill={INK} />
      <rect x="22" y="26" width="20" height="8" rx="5" fill={INK_SOFT} />
      <rect x="26" y="14" width="4" height="13" rx="2" fill={BRASS} />
      <rect x="34" y="14" width="4" height="13" rx="2" fill={BRASS} />
      <path d="M32 48v3a5 5 0 0 0 5 5h6" stroke={STONE_DARK} stroke-width="3" stroke-linecap="round" fill="none" />
      <circle cx="32" cy="39" r="3.4" fill={BRASS} />
    </>
  ),

  /**
   * Kantong plastik, karung, kantong sampah.
   *
   * A carrier bag, not a sack: the first version tapered inward toward the bottom and read as
   * a skirt. Bags widen as they fill, and the two loop handles are what make the silhouette
   * unmistakable at any size.
   */
  kantong: () => (
    <>
      <path d="M24 22c0-5 3-8 8-8s8 3 8 8" stroke={INK} stroke-width="2.6" stroke-linecap="round" fill="none" />
      <path d="M20 24h24l4 24a5 5 0 0 1-5 5.6H21A5 5 0 0 1 16 48z" fill={BRASS} />
      <path d="M32 24h12l4 24a5 5 0 0 1-5 5.6H32z" fill={BRASS_DARK} />
      <rect x="16" y="24" width="32" height="4" rx="1" fill={INK} opacity="0.85" />
      <rect x="24" y="35" width="16" height="9" rx="2" fill={CREAM} />
      <rect x="27" y="39" width="10" height="2" rx="1" fill={STONE} />
    </>
  ),

  /** Dus, kardus, pak. */
  kardus: () => (
    <>
      <path d="M10 22l22-8 22 8-22 8z" fill={CREAM} />
      <path d="M32 30v24L10 46V22z" fill={BRASS} />
      <path d="M32 30v24l22-8V22z" fill={BRASS_DARK} />
      <path d="M32 14l22 8-22 8z" fill={STONE} />
      <path d="M24 17.2l22 8" stroke={STONE_DARK} stroke-width="1.6" />
      <rect x="18" y="34" width="10" height="7" rx="1" fill={CREAM} opacity="0.85" />
    </>
  ),

  /** Terpal, karpet, selang — a roll. */
  terpal: () => (
    <>
      <path d="M20 18h26v32H20z" fill={BRASS} />
      <ellipse cx="46" cy="34" rx="7" ry="16" fill={BRASS_DARK} />
      <ellipse cx="20" cy="34" rx="7" ry="16" fill={CREAM} />
      <ellipse cx="20" cy="34" rx="3.4" ry="8" fill={STONE} />
      <path d="M20 50h26" stroke={BRASS_DARK} stroke-width="1.6" />
    </>
  ),

  /** Timbangan. */
  timbangan: () => (
    <>
      <path d="M12 44h40l-4-18H16z" fill={BRASS} />
      <path d="M32 26h16l4 18H32z" fill={BRASS_DARK} />
      <rect x="10" y="44" width="44" height="8" rx="3" fill={INK} />
      <circle cx="32" cy="34" r="8" fill={CREAM} />
      <circle cx="32" cy="34" r="6" fill="none" stroke={STONE} stroke-width="1.2" />
      <path d="M32 34l4-4" stroke={INK} stroke-width="2" stroke-linecap="round" />
      <rect x="24" y="18" width="16" height="5" rx="2.5" fill={STONE_DARK} />
    </>
  ),

  /** Kunci pas, obeng, palu — a hand tool. */
  alat: () => (
    <>
      <path d="M42 12a11 11 0 0 0-9.6 16.4L14 46.8a4 4 0 0 0 5.6 5.6L38 34a11 11 0 0 0 15-13.4l-6.6 6.6-5.6-5.6L47.4 15A11 11 0 0 0 42 12z" fill={STONE} />
      <path d="M32.4 28.4L14 46.8a4 4 0 0 0 5.6 5.6L38 34z" fill={STONE_DARK} />
      <circle cx="17.5" cy="49" r="2" fill={CREAM} />
      <path d="M47.4 15L41 21.6l2.8 2.8 6.6-6.6a11 11 0 0 0-3-2.8z" fill={BRASS} />
    </>
  ),

  /**
   * Pipa, kran, sanitasi.
   *
   * A tap, drawn as one connected object. The first version assembled an elbow, a floating
   * mushroom handle and a detached flange, which at small sizes read as three unrelated
   * brass fragments — the classic failure of drawing plumbing as its parts rather than as its
   * outline. Base, column, spout and handle now touch.
   */
  pipa: () => (
    <>
      <rect x="22" y="46" width="22" height="7" rx="2.5" fill={INK} />
      <rect x="27" y="20" width="12" height="27" fill={BRASS} />
      <rect x="33" y="20" width="6" height="27" fill={BRASS_DARK} />
      <path d="M39 22h5a6 6 0 0 1 6 6v9h-8v-7a2 2 0 0 0-2-2h-1z" fill={BRASS} />
      <path d="M42 37h8v3a4 4 0 0 1-8 0z" fill={BRASS_DARK} />
      <rect x="23" y="14" width="20" height="6" rx="3" fill={STONE_DARK} />
      <rect x="30" y="9" width="6" height="7" rx="2" fill={STONE_DARK} />
      <circle cx="46" cy="46" r="2.6" fill={STONE} />
    </>
  ),

  /** Speaker, sound system, elektronik. */
  audio: () => (
    <>
      <rect x="18" y="10" width="28" height="44" rx="5" fill={INK} />
      <rect x="18" y="10" width="28" height="44" rx="5" fill="none" stroke={INK_SOFT} stroke-width="1.4" />
      <circle cx="32" cy="24" r="8" fill={BRASS} />
      <circle cx="32" cy="24" r="3.4" fill={CREAM} />
      <circle cx="32" cy="42" r="5" fill={BRASS_DARK} />
      <circle cx="32" cy="42" r="2" fill={CREAM} />
    </>
  ),

  /**
   * Tabung gas, LPG.
   *
   * Squat and collared, deliberately unlike `botol`: the first version was a tall smooth
   * cylinder and sat next to the jerrycan looking like a second jerrycan. A gas bottle is
   * recognised by its proportions and its valve collar, so those carry the drawing.
   */
  tabung: () => (
    <>
      <rect x="14" y="26" width="36" height="28" rx="11" fill={BRASS} />
      <path d="M32 26h7a11 11 0 0 1 11 11v6a11 11 0 0 1-11 11h-7z" fill={BRASS_DARK} />
      <rect x="14" y="47" width="36" height="5" fill={BRASS_DARK} opacity="0.5" />
      {/* The valve collar, and the whole reason this is not read as a second jerrycan. */}
      <path d="M23 27a9 9 0 0 1 18 0z" fill={STONE_DARK} />
      <rect x="24" y="19" width="16" height="8" rx="3" fill={STONE_DARK} />
      <rect x="29" y="11" width="6" height="9" rx="2" fill={INK} />
      <path d="M25 14h14" stroke={INK} stroke-width="3.2" stroke-linecap="round" />
    </>
  ),

  /** Gembok, kunci, keamanan. */
  kunci: () => (
    <>
      <path d="M22 28v-6a10 10 0 0 1 20 0v6h-6v-6a4 4 0 0 0-8 0v6z" fill={STONE_DARK} />
      <rect x="16" y="28" width="32" height="26" rx="6" fill={BRASS} />
      <path d="M32 28h10a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6H32z" fill={BRASS_DARK} />
      <circle cx="32" cy="38" r="4" fill={INK} />
      <path d="M32 41v6" stroke={INK} stroke-width="3" stroke-linecap="round" />
    </>
  ),

  /** Ember, baskom, timba — an open tub. */
  ember: () => (
    <>
      <path d="M25 30a10 10 0 0 1 14 0" stroke={STONE_DARK} stroke-width="2.4" fill="none" stroke-linecap="round" />
      <path d="M17 31h30l-4 21a5 5 0 0 1-5 4.4H26a5 5 0 0 1-5-4.4z" fill={BRASS} />
      <path d="M32 31h15l-4 21a5 5 0 0 1-5 4.4h-6z" fill={BRASS_DARK} />
      <rect x="15" y="28" width="34" height="6" rx="3" fill={BRASS_DARK} />
      <rect x="15" y="28" width="34" height="2.6" rx="1.3" fill={CREAM} opacity="0.55" />
      <path d="M25 39h14" stroke={CREAM} stroke-width="2" stroke-linecap="round" opacity="0.6" />
    </>
  ),

  /** Cooler box, termos es — a lidded chest, which is what tells it from an ordinary carton. */
  cooler: () => (
    <>
      <rect x="12" y="33" width="40" height="21" rx="4" fill={BRASS} />
      <path d="M32 33h16a4 4 0 0 1 4 4v13a4 4 0 0 1-4 4H32z" fill={BRASS_DARK} />
      <rect x="9" y="24" width="46" height="10" rx="3.5" fill={CREAM} stroke={STONE_DARK} stroke-width="1.6" />
      <path d="M26 24a6 6 0 0 1 12 0" stroke={STONE_DARK} stroke-width="2.4" fill="none" stroke-linecap="round" />
      <rect x="28" y="36" width="8" height="6" rx="1.6" fill={INK} />
      <path d="M14 46h36" stroke={BRASS_DARK} stroke-width="1.8" opacity="0.6" />
    </>
  ),

  /** Tangga lipat — rails and rungs, the one silhouette nothing else here shares. */
  tangga: () => (
    <>
      <rect x="18" y="10" width="5" height="46" rx="2.5" fill={STONE_DARK} />
      <rect x="41" y="10" width="5" height="46" rx="2.5" fill={STONE_DARK} />
      <rect x="18" y="10" width="1.8" height="46" fill={STONE} />
      {/* Written out rather than mapped: these drawings are reviewed by rendering the file's
          SVG directly, and a JS expression is the one thing that review cannot evaluate. */}
      <rect x="21" y="18" width="22" height="4.6" rx="2.3" fill={BRASS} />
      <rect x="21" y="28" width="22" height="4.6" rx="2.3" fill={BRASS} />
      <rect x="21" y="38" width="22" height="4.6" rx="2.3" fill={BRASS} />
      <rect x="21" y="48" width="22" height="4.6" rx="2.3" fill={BRASS} />
    </>
  ),

  /** Sarung tangan — a mitten, read by its thumb. */
  sarung: () => (
    <>
      <path d="M24 20h14a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6H26a6 6 0 0 1-6-6V30z" fill={BRASS} />
      <path d="M32 20h6a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6h-6z" fill={BRASS_DARK} />
      <path d="M20 32c-4-3-8-2-9 1.4-1 3.4 2 6.6 6 7.6l3 .8z" fill={BRASS} />
      <rect x="20" y="46" width="24" height="5" fill={CREAM} opacity="0.7" />
      <path d="M27 26v9M33 26v9M39 26v9" stroke={CREAM} stroke-width="1.4" stroke-linecap="round" opacity="0.55" />
    </>
  ),

  /** Cat, tiner, lem kaleng — a tin with a bail handle. */
  cat: () => (
    <>
      <path d="M20 27a12 5 0 0 1 24 0v24a4 4 0 0 1-4 3.6H24a4 4 0 0 1-4-3.6z" fill={BRASS} />
      <path d="M32 22a12 5 0 0 1 12 5v24a4 4 0 0 1-4 3.6h-8z" fill={BRASS_DARK} />
      <ellipse cx="32" cy="27" rx="12" ry="4.6" fill={CREAM} />
      <ellipse cx="32" cy="27" rx="7" ry="2.6" fill={STONE} />
      <path d="M21 26c1-9 21-9 22 0" stroke={STONE_DARK} stroke-width="2" fill="none" stroke-linecap="round" />
      <rect x="24" y="38" width="16" height="9" rx="2" fill={CREAM} />
    </>
  ),

  /** Nothing more specific is known — a crate, which is honest rather than decorative. */
  default: () => (
    <>
      <rect x="12" y="20" width="40" height="32" rx="4" fill={BRASS} />
      <path d="M32 20h16a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4H32z" fill={BRASS_DARK} />
      <rect x="12" y="26" width="40" height="5" fill={CREAM} opacity="0.85" />
      <rect x="26" y="36" width="12" height="9" rx="1.6" fill={CREAM} />
      <path d="M29 40.5h6" stroke={STONE_DARK} stroke-width="1.6" stroke-linecap="round" />
    </>
  ),
};

/* -------------------------------------------------------------------------------------------
   Which drawing an item gets.

   Four passes, in decreasing order of how much each signal actually knows: a unit that names
   the container, then the item's own name, then a unit that only names the packaging, then the
   free-form category, and finally the kind — which guarantees every row gets something,
   because a list where some rows are illustrated and others are blank reads as broken rather
   than as "we had no opinion about this one".

   Names are matched before categories here, unlike `itemIcon`, because the drawings are
   specific enough to be worth it: "Pisau potong" filed under PHBI should be a knife, not the
   generic kitchen glyph its category would give it.
------------------------------------------------------------------------------------------- */

/**
 * Units that describe the OBJECT. A galon of hand soap is a jerrycan whatever it is called, so
 * these outrank the name — the drawing is of a shape, and this is the shape.
 */
const BY_UNIT_STRONG: Record<string, ArtId> = {
  galon: 'botol', botol: 'botol', liter: 'botol', drum: 'botol', jerigen: 'botol',
  tabung: 'tabung',
};

/**
 * Units that describe the PACKAGING, which is a different claim and a weaker one. A `pak` of
 * bin bags is not a box, and a `roll` of cable is not a tarpaulin — both of which the first
 * version drew, because it let packaging outrank the name. So these are consulted only after
 * the name has had its say, and they carry the case where the name says nothing useful:
 * "Isi ulang" sold by the `dus` really is best drawn as a carton.
 */
const BY_UNIT_WEAK: Record<string, ArtId> = {
  roll: 'terpal', gulung: 'terpal', meter: 'terpal',
  lembar: 'kain',
  pak: 'kardus', dus: 'kardus', kardus: 'kardus', box: 'kardus',
};

/*
 * WORD BOUNDARIES, NOT SUBSTRINGS — and this is not defensive style, it is a bug that shipped.
 * A bare /tang/ for pliers matched "Sabun cuci **tang**an", so the hand soap in the demo data
 * was drawn as a wrench. Every short token below is anchored for the same reason: /bor/ is
 * inside "borax", /gas/ inside "petugas", /pel/ inside "kompel". The tests name each trap.
 */
const BY_NAME: [RegExp, ArtId][] = [
  // Gembok before the tool list, so "kunci gembok" is a padlock and "kunci pas" is a spanner.
  [/gembok|cctv|alarm|kamera/i, 'kunci'],
  [/ember|baskom|timba|\bwadah\b|panci/i, 'ember'],
  [/cooler|termos|\bes ?box\b|\bboks\b/i, 'cooler'],
  [/tangga/i, 'tangga'],
  [/sarung|kaos tangan|\bmasker\b/i, 'sarung'],
  [/\bcat\b|tiner|kaleng|kuas/i, 'cat'],
  [/pisau|golok|parang|cutter/i, 'pisau'],
  [/talenan|nampan|papan|baki/i, 'talenan'],
  [/asahan|\bkunci\b|obeng|\btang\b|palu|gergaji|\bbor\b|tukang/i, 'alat'],
  [/\bpel\b|sapu|sikat|kemoceng/i, 'pel'],
  [/kain|kanebo|\blap\b|handuk|karpet|sajadah/i, 'kain'],
  [/lampu|bohlam|neon|senter/i, 'lampu'],
  [/kabel|steker|stop ?kontak|saklar|colokan|baterai/i, 'kabel'],
  [/kantong|plastik|karung|trash|sampah/i, 'kantong'],
  [/terpal|selang|\btali\b|tambang/i, 'terpal'],
  [/timbangan|neraca/i, 'timbangan'],
  [/pipa|kran|keran|wastafel|toilet|closet/i, 'pipa'],
  [/speaker|sound|\bmic\b|ampli|audio|\btoa\b/i, 'audio'],
  [/\bgas\b|\blpg\b|kompor/i, 'tabung'],
  [/sabun|pembersih|karbol|pewangi|cairan|desinfektan|porstex/i, 'spray'],
  [/tisu|kertas|kapas/i, 'kardus'],
];

const BY_CATEGORY: [RegExp, ArtId][] = [
  [/kebersihan|cleaning/i, 'spray'],
  [/elektronik|electronic/i, 'audio'],
  [/listrik|electric/i, 'kabel'],
  [/sanitasi|plumbing|\bair\b/i, 'pipa'],
  [/sipil|bangunan/i, 'alat'],
  [/keamanan|security/i, 'kunci'],
  // NOT a knife. A category is a filing decision, and defaulting all of PHBI to a blade drew
  // "Baskom besar" and "Cooler box" as knives — a wrong picture is worse than a neutral one,
  // because it is confidently wrong. Only an actual knife, matched by name above, gets one.
  [/phbi|qurban|dapur|masak/i, 'default'],
];

/** Every drawing, in the order the picker shows them. */
export const ART_IDS = Object.keys(SHAPES) as ArtId[];

export const isArtId = (v: string | undefined): v is ArtId =>
  v != null && Object.prototype.hasOwnProperty.call(SHAPES, v);

export function artFor(
  item: Pick<Item, 'name' | 'unit' | 'kind'> & { artId?: string },
  categoryName = '',
): ArtId {
  // A person's explicit choice outranks every guess below it. Unrecognised values fall
  // through rather than throwing: a sheet naming a drawing we have since renamed should
  // degrade to the guess, not break the row.
  if (isArtId(item.artId)) return item.artId;

  const unit = item.unit.trim().toLowerCase();

  const strong = BY_UNIT_STRONG[unit];
  if (strong) return strong;

  for (const [pattern, id] of BY_NAME) {
    if (pattern.test(item.name)) return id;
  }

  const weak = BY_UNIT_WEAK[unit];
  if (weak) return weak;

  for (const [pattern, id] of BY_CATEGORY) {
    if (pattern.test(categoryName)) return id;
  }
  return item.kind === 'equipment' ? 'alat' : 'default';
}

/**
 * The drawing plus its ground.
 *
 * The ground disc is not ornament: it gives every item the same silhouette at a glance, so a
 * column of rows scans as a column rather than as a ragged set of outlines, and it keeps a
 * pale drawing legible on the pale app background. `aria-hidden` throughout — the item's name
 * is right beside it, and announcing "gambar botol" before every row is noise, not access.
 */
export function ItemArt(
  { art, size = 40, class: cls = '', flat = false }:
  { art: ArtId; size?: number; class?: string; flat?: boolean },
) {
  const Shape = SHAPES[art] ?? SHAPES.default;
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
      {!flat && (
        <>
          <circle cx="32" cy="32" r="31" fill="#efe9df" />
          {/* A single soft ellipse under the object. Cheaper than a filter — an SVG blur on
              every row of a long list is a real cost on a cheap tablet, and at 40px nobody
              can tell the difference. */}
          <ellipse cx="32" cy="55" rx="17" ry="3.2" fill="#000" opacity="0.07" />
        </>
      )}
      <Shape />
    </svg>
  );
}
