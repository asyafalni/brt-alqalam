// The Masjid Al-Qalam mark, redrawn as vector.
//
// The source was a small raster with soft edges. This is the same mark rebuilt from geometry:
// the star's ten points are computed on a circle rather than traced, so the five arms are
// genuinely equal, and every element is placed by measuring the original and normalising its
// bounding box into this 100×100 box. It stays sharp from a 32px sidebar tile to a printed page.
//
// LAYOUT NOTE — two things that look like mistakes and are not.
//
// The BOOK deliberately overhangs the white field onto the green lower arms. Below the star's
// inner vertices (y=57.33 here) the field closes fast toward the bottom point, so a book drawn
// to fit inside it would be a third of the original's width. The original lets it cross, and
// that overlap is what gives the lower half its weight. An earlier pass "fixed" this and the
// mark stopped looking like the masjid's.
//
// The QUILL deliberately breaks the outline at the upper left. There is no room for it inside —
// the top arm is only a few units wide where the feather sits — and in the original it reaches
// well past the star.
//
// `withText` is on by default because "MASJID" and "Al-Qalam" are most of what makes the mark
// recognisable. The words stop being readable somewhere below ~40px, but they still read as the
// right shape, which is what a brand mark is doing at that size anyway; pass `withText={false}`
// for a favicon or anywhere smaller.

/**
 * `textPath` needs an id to point at, and a duplicate id in one document silently sends both
 * curves to whichever came first. A counter keeps every instance independent.
 */
let seq = 0;

const GREEN = '#3AA34B';
const GREEN_EDGE = '#2A8039';
const INK = '#14331F';
const BLUE = '#2C6FB5';
const BLUE_DARK = '#1B4E85';
const GOLD = '#F7A81B';
const QUILL = '#F2EFE9';
const QUILL_EDGE = '#A9A29A';

/** Ten points on a circle: outer r=42, inner r=20.5, first arm straight up. */
const STAR = 'M50 9 L62.05 34.42 L89.94 38.02 L69.5 57.33 L74.69 84.98 '
  + 'L50 71.5 L25.31 84.98 L30.5 57.33 L10.06 38.02 L37.95 34.42 Z';

/** The star seated in the crescent's cup, same construction at r=5.4/2.3, centred on (51.5,45.5). */
const CRESCENT_STAR = 'M51.5 40.1 L52.85 43.64 L56.64 43.83 L53.69 46.21 L54.67 49.87 '
  + 'L51.5 47.8 L48.33 49.87 L49.31 46.21 L46.36 43.83 L50.15 43.64 Z';

export function Logo(
  { size = 40, withText = true, class: cls = '' }:
  { size?: number; withText?: boolean; class?: string },
) {
  seq += 1;
  const arcId = `alq-arc-${seq}`;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      class={`shrink-0 ${cls}`}
      shape-rendering="geometricPrecision"
      role="img"
      aria-label="Masjid Al-Qalam"
    >
      <defs>
        {/* Baseline for "MASJID". The radius is derived, not guessed: the original's word
            spans a 46-unit chord with a 5.5-unit rise, which is a 50.8 radius — a much flatter
            curve than it looks. Drawn tighter, the six letters run off the end of the path and
            wrap down the sides of the star, which is exactly what the first attempt did.

            The path is then drawn LONGER than the word needs along that same circle. A
            `textPath` does not shrink to fit — anything past the end simply stops being
            rendered on the curve and slides down the sides, so the runway has to exceed the
            word, not match it. */}
        <path id={arcId} d="M18 43.4 A50.8 50.8 0 0 1 82 43.4" fill="none" />
      </defs>

      {/* White field with a heavy green outline, drawn as one stroked path: a round linejoin
          gives the blunt arm tips of the original without a second, hand-fitted outline to
          keep in sync with the first. */}
      <path d={STAR} fill="#ffffff" stroke={GREEN} stroke-width="7" stroke-linejoin="round" />
      <path
        d={STAR}
        fill="none"
        stroke={GREEN_EDGE}
        stroke-width="1"
        stroke-linejoin="round"
        opacity="0.45"
      />

      {withText && (
        <text
          font-family="ui-sans-serif, system-ui, 'Segoe UI', sans-serif"
          font-size="9.8"
          font-weight="800"
          letter-spacing="0.5"
          fill={INK}
        >
          <textPath href={`#${arcId}`} startOffset="50%" text-anchor="middle">MASJID</textPath>
        </text>
      )}

      {/* Crescent and star. Horns to the LEFT, bulge to the right, star seated in the cup —
          the arrangement in the original, and why the cut circle sits left of the filled one.
          Punching one circle out of another with a background-coloured copy is the only
          construction that keeps both horns coming to a true point. */}
      <g>
        <circle cx="57" cy="44.5" r="10.4" fill={GOLD} />
        <circle cx="53.4" cy="43" r="8.8" fill="#ffffff" />
        <path d={CRESCENT_STAR} fill={GOLD} />
      </g>

      {/* Open book, crossing onto the lower arms exactly as the original does. */}
      <g>
        <path
          d="M27.5 51c10.5-4.4 17-4.4 22.5 1.4 5.5-5.8 12-5.8 22.5-1.4v11c-10.5-4.4-17-4.4-22.5 1.4-5.5-5.8-12-5.8-22.5-1.4z"
          fill="#ffffff"
          stroke={BLUE}
          stroke-width="2.8"
          stroke-linejoin="round"
        />
        <path d="M50 52.4v11" stroke={BLUE} stroke-width="2.2" stroke-linecap="round" />
        <path
          d="M32 54.6c4.6-1.4 8.8-1.1 12.6 1M68 54.6c-4.6-1.4-8.8-1.1-12.6 1"
          stroke={BLUE_DARK}
          stroke-width="1.3"
          stroke-linecap="round"
          fill="none"
          opacity="0.55"
        />
        {/* The band beneath the book — the base the original rests the whole device on. */}
        <path d="M28.5 65h43" stroke={BLUE} stroke-width="2.8" stroke-linecap="round" />
      </g>

      {/* The quill — al-qalam, the pen the masjid is named for. It enters from outside the star
          at the upper left, and its nib points into the book. */}
      <g>
        <path
          d="M6 23c10.6 1.8 20.4 7.4 28.4 16 4.2 4.6 7.6 9.4 10 14.2-5.2-2-10.4-5.4-15.2-10C20.4 34.6 12 27.6 6 23z"
          fill={QUILL}
          stroke={QUILL_EDGE}
          stroke-width="1.2"
          stroke-linejoin="round"
        />
        <path
          d="M10 25.6c8.6 5.4 18.4 13.4 27 22.6"
          stroke={QUILL_EDGE}
          stroke-width="1"
          stroke-linecap="round"
          fill="none"
        />
        <path d="M44.4 53.2l3.4 3.6" stroke={QUILL_EDGE} stroke-width="2" stroke-linecap="round" />
      </g>

      {withText && (
        <text
          x="50"
          y="73.8"
          text-anchor="middle"
          font-family="Georgia, 'Times New Roman', serif"
          font-size="10.7"
          font-style="italic"
          font-weight="700"
          fill={INK}
        >
          Al-Qalam
        </text>
      )}
    </svg>
  );
}
