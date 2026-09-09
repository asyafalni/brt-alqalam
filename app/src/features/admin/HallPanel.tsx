// The artwork half of the sign-in page, in its own file so it is FETCHED, not shipped.
//
// It is ~13kB of drawing — the masjid, its lanterns, the gradients over them — and it renders
// on exactly one screen, which a marbot never opens and a connected kiosk cannot reach. The
// same reasoning that keeps Clerk itself off the kiosk path (§64.2): the hot path is the one
// that has to stay small, and it is the one nobody signs in on.

import { useState } from 'octane';
import { MasjidArt } from '../../components/MasjidArt';
import { Lanterns } from '../../components/Lanterns';
import { Logo } from '../../components/Logo';

/**
 * The full-bleed half of the sign-in screen.
 *
 * A photograph of the prayer hall if one has been put on the server, and the drawing underneath
 * it either way — so the page is composed before the photograph arrives and never shows a broken
 * image if it never does. The drawing is not a placeholder to be replaced; it is the floor the
 * photograph lies on.
 */
export function HallPanel() {
  const [photo, setPhoto] = useState(true);
  return (
    <div class="relative h-full w-full overflow-hidden bg-[#14100b]">
      {/* The drawing stays UNDERNEATH the photograph rather than being replaced by it. It costs
          a few kilobytes, it paints instantly, and it means this panel is never a broken image
          or an empty black rectangle while a photo is still arriving on gudang wifi. */}
      <MasjidArt class="absolute inset-0 h-full w-full" />

      {photo && (
        <img
          src="/masjid.webp"
          alt=""
          /* GRADED, not merely darkened. The photograph is bright daylight — cream walls, a
             green carpet — and the rest of this screen is brass on ink. Dropped in untouched it
             put two unrelated palettes side by side. The filter pulls it toward the warm end
             and down in brightness so the ink gradient has something to sit on rather than
             something to fight. */
          class="absolute inset-0 h-full w-full object-cover
                 [filter:saturate(0.7)_contrast(1.1)_brightness(0.6)_sepia(0.28)]"
          onError={() => setPhoto(false)}
        />
      )}

      {/* Warm ink from the bottom, NOT slate: a cool grey scrim over a warm photograph reads as
          a dirty window. Same hue family as the brass. */}
      <div class="absolute inset-0 bg-gradient-to-t from-[#0b0805] via-[#0b0805]/55 to-[#0b0805]/25" />
      {/* A vignette, so the eye goes to the mihrab rather than to the corners. */}
      <div class="absolute inset-0 [background:radial-gradient(ellipse_at_50%_42%,transparent_30%,rgba(11,8,5,0.62)_100%)]" />

      {/* Lamps instead of the arch that used to be stroked across the whole frame. At full
          width that line read as a ghost doorway standing in the hall — an ornament has to be
          quiet enough to be taken for part of the room, and that one was not. */}
      <Lanterns />

      <div class="absolute inset-x-0 bottom-0 hidden p-8 lg:block lg:p-12">
        <div class="flex items-center gap-3">
          <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white">
            <Logo size={38} />
          </div>
          <div>
            <p class="text-lg font-bold leading-tight text-white">BRT Masjid Al-Qalam</p>
            <p class="text-sm text-[#d8c9a8]">Sistem Inventaris</p>
          </div>
        </div>
        <p class="mt-5 max-w-sm text-sm leading-relaxed text-[#c7b795]">
          Supaya kita bisa fokus beribadah di masjid — barangnya tercatat, dan tidak ada yang
          perlu mencari-cari lagi.
        </p>
      </div>
    </div>
  );
}

