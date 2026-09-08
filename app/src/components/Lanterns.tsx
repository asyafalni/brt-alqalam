// Hanging lamps over the prayer hall.
//
// Ornament, deliberately at the edge of noticing. The panel already has the photograph doing
// the work; anything drawn on top competes with it unless it is quiet enough to be taken for
// part of the room. The previous attempt — a single pointed arch stroked across the whole frame
// — failed exactly that test: at full width it read as a ghost doorway standing in the hall.
//
// So these are SMALL, WARM, AND FEW. Three lamps, none on the centre line where the mihrab is,
// hung at different depths so they read as a room rather than as a pattern.
//
// EACH ONE IS ITS OWN ELEMENT rather than figures inside one full-bleed SVG. A single SVG
// scaled with `slice` crops differently at every aspect ratio, so lamps placed to look right on
// a desktop half-panel would drift off a phone. Positioned individually in percentages, they
// stay where they were put.

/** One lamp, cord included: the cord has to start at the ceiling, so it is part of the drawing. */
function Lantern(
  { left, height, opacity, flip = false }:
  { left: string; height: number; opacity: number; flip?: boolean },
) {
  return (
    <div
      class="pointer-events-none absolute top-0"
      style={`left:${left};height:${height}px;opacity:${opacity};transform:translateX(-50%)${flip ? ' scaleX(-1)' : ''}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 60 200" class="h-full w-auto" fill="none">
        <defs>
          <radialGradient id={`lamp-glow-${left.replace('%', '')}`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stop-color="#ffd9a0" stop-opacity="0.5" />
            <stop offset="100%" stop-color="#ffd9a0" stop-opacity="0" />
          </radialGradient>
        </defs>

        {/* The light it casts, drawn before the lamp so the body sits inside its own halo. */}
        <circle cx="30" cy="146" r="34" fill={`url(#lamp-glow-${left.replace('%', '')})`} />

        {/* Cord from the ceiling, a collar, then the body. */}
        <line x1="30" y1="0" x2="30" y2="112" stroke="#c9a86a" stroke-width="1" stroke-opacity="0.55" />
        <path d="M24 112 h12 v5 h-12 z" fill="#c9a86a" fill-opacity="0.65" />

        {/* A six-panel lamp: shoulders out, waist in, a small dome on top and a finial below —
            the silhouette a masjid lamp has, without pretending to detail nobody will see. */}
        <path
          d="M30 117 L41 128 L44 150 L36 170 H24 L16 150 L19 128 Z"
          fill="#f0c987"
          fill-opacity="0.16"
          stroke="#e8c68b"
          stroke-width="1.1"
          stroke-opacity="0.7"
        />
        <path d="M22 138 H38" stroke="#e8c68b" stroke-width="0.8" stroke-opacity="0.4" />
        <path d="M21 156 H39" stroke="#e8c68b" stroke-width="0.8" stroke-opacity="0.4" />
        <path d="M30 170 v6" stroke="#c9a86a" stroke-width="1.2" stroke-opacity="0.6" />
        <circle cx="30" cy="179" r="2.4" fill="#e8c68b" fill-opacity="0.6" />
      </svg>
    </div>
  );
}

/**
 * The set, placed.
 *
 * Nothing sits between 40% and 60%: that is where the mihrab and the minbar are in the
 * photograph, and hanging a lamp in front of them would be the one placement that obscures the
 * thing anybody actually looks at.
 */
export function Lanterns() {
  return (
    <>
      <Lantern left="16%" height={250} opacity={0.5} />
      <Lantern left="83%" height={210} opacity={0.42} flip />
      <Lantern left="31%" height={165} opacity={0.28} />
    </>
  );
}
