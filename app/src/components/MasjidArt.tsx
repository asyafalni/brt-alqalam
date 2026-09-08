// The prayer hall of Masjid Al-Qalam, drawn.
//
// WHY A DRAWING WHEN THERE IS A PHOTOGRAPH. Two reasons, and the first is the honest one: the
// photo is a file somebody has to put on the server, and a login screen that renders a broken
// image on the day it is missing is worse than one that never had a photo. The second is gudang
// wifi — this is a few kilobytes of vector that paints instantly, so the page is composed before
// the photograph arrives and simply gets sharper when it does. The drawing is not a placeholder
// to be replaced; it is the floor the photograph lies on.
//
// PORTRAIT, at 600×820, because that is the shape it has to survive. The panel is a tall half
// of a desktop screen and the whole of a phone, and a landscape drawing sliced into either loses
// its middle — the first version filled the frame with ceiling and cut the room away entirely.
// Everything that identifies the room now sits in the vertical centre band, which is the part
// that survives every crop.
//
// DARK AND LIT, rather than the daylight of the photograph, because white text has to sit on it.
// A pale drawing needs a heavy scrim to be legible, and a heavy scrim is a grey sheet over a
// picture nobody can then see. Lighting the room from the mihrab does the same job by drawing
// instead of by covering.

export function MasjidArt({ class: cls = '' }: { class?: string }) {
  return (
    <svg
      class={cls}
      viewBox="0 0 600 820"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="Ilustrasi ruang salat Masjid Al-Qalam"
    >
      <defs>
        <linearGradient id="mq-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#241f18" />
          <stop offset="55%" stop-color="#2e2820" />
          <stop offset="100%" stop-color="#1b1813" />
        </linearGradient>
        <linearGradient id="mq-carpet" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#2b4030" />
          <stop offset="100%" stop-color="#12200f" />
        </linearGradient>
        {/* The light comes from the mihrab, so everything else falls away from it. */}
        <radialGradient id="mq-light" cx="0.5" cy="0.52" r="0.52">
          <stop offset="0%" stop-color="#ffd79a" stop-opacity="0.55" />
          <stop offset="45%" stop-color="#e0a95e" stop-opacity="0.16" />
          <stop offset="100%" stop-color="#000000" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="mq-arch" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#f6dfae" />
          <stop offset="100%" stop-color="#c08f45" />
        </linearGradient>
        <radialGradient id="mq-lamp" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stop-color="#ffd79a" stop-opacity="0.42" />
          <stop offset="100%" stop-color="#ffd79a" stop-opacity="0" />
        </radialGradient>
        <pattern id="mq-lattice" width="18" height="18" patternUnits="userSpaceOnUse">
          <rect width="18" height="18" fill="#2b2419" />
          <path d="M9 1.5 L16.5 9 L9 16.5 L1.5 9 Z" fill="none" stroke="#c9a86a" stroke-width="1.5" />
          <circle cx="9" cy="9" r="1.6" fill="#c9a86a" opacity="0.7" />
        </pattern>
      </defs>

      <rect width="600" height="820" fill="url(#mq-wall)" />

      {/* Ceiling — the elliptical opening and its ring beam, and the balcony rail behind it. */}
      <ellipse cx="300" cy="40" rx="235" ry="86" fill="#332c22" />
      <ellipse cx="300" cy="46" rx="235" ry="86" fill="none" stroke="#8a7148" stroke-width="4" />
      <path d="M0 118 Q300 214 600 118" fill="none" stroke="#7d663f" stroke-width="5" />
      <path d="M0 96 Q300 190 600 96" fill="none" stroke="#5d4c2f" stroke-width="2" />
      <g stroke="#6d5a37" stroke-width="2.5" opacity="0.8">
        {[40, 74, 108, 142, 458, 492, 526, 560].map((x) => (
          <line key={x} x1={x} y1="96" x2={x} y2={122 + Math.abs(300 - x) * 0.05} />
        ))}
      </g>

      {/* The two square columns that frame the centre bay. */}
      <g>
        <rect x="150" y="150" width="46" height="470" fill="#3a3226" />
        <rect x="150" y="150" width="14" height="470" fill="#4a4030" />
        <rect x="404" y="150" width="46" height="470" fill="#3a3226" />
        <rect x="436" y="150" width="14" height="470" fill="#4a4030" />
      </g>

      {/* Side walls: arched doorways under perforated tympanums. */}
      {[26, 494].map((x) => (
        <g key={x}>
          <path d={`M${x} 372 a40 40 0 0 1 80 0 z`} fill="url(#mq-lattice)" opacity="0.85" />
          <path d={`M${x} 372 a40 40 0 0 1 80 0`} fill="none" stroke="#8a7148" stroke-width="3" />
          <rect x={x + 7} y="376" width="66" height="244" fill="#241a11" />
          <rect x={x + 7} y="376" width="30" height="244" fill="#2e2116" />
        </g>
      ))}

      {/* The centre bay: lattice piers, and the lit mihrab arch between them. */}
      <rect x="216" y="176" width="168" height="444" fill="#171310" />
      <rect x="216" y="176" width="26" height="444" fill="url(#mq-lattice)" opacity="0.9" />
      <rect x="358" y="176" width="26" height="444" fill="url(#mq-lattice)" opacity="0.9" />
      <path d="M258 620 V436 Q300 372 342 436 V620 Z" fill="url(#mq-arch)" opacity="0.92" />
      <path d="M258 620 V436 Q300 372 342 436 V620" fill="none" stroke="#f3e0b6" stroke-width="2.5" />

      {/* A hanging lamp, which says "masjid" faster than any amount of architecture. */}
      <circle cx="300" cy="292" r="78" fill="url(#mq-lamp)" />
      <line x1="300" y1="176" x2="300" y2="256" stroke="#8a7148" stroke-width="2" />
      <path d="M300 256 l30 26 -12 34 h-36 l-12 -34 z" fill="#c9a86a" />
      <path d="M300 262 l22 21 -9 25 h-26 l-9 -25 z" fill="#ffe6b4" />
      <circle cx="300" cy="326" r="4" fill="#c9a86a" />

      {/* The light itself, over everything above the floor. */}
      <rect width="600" height="820" fill="url(#mq-light)" />

      {/* Carpet: saf lines converging, which is what makes the room read as deep. */}
      <path d="M0 620 H600 V820 H0 Z" fill="url(#mq-carpet)" />
      <g stroke="#7f9b74" stroke-width="2.5" opacity="0.32">
        {[630, 648, 672, 704, 746, 800].map((y, i) => (
          <line key={y} x1={(5 - i) * 7} y1={y} x2={600 - (5 - i) * 7} y2={y} />
        ))}
      </g>
      <g stroke="#c9a86a" stroke-width="1.2" opacity="0.2">
        {[638, 658, 686, 722, 770].map((y) => (
          <line key={y} x1="0" y1={y} x2="600" y2={y} />
        ))}
      </g>
    </svg>
  );
}
