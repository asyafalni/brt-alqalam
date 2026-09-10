// A list that grows as you scroll it, instead of ending in a "see all" button.
//
// The button was a decision nobody wanted to make: it asked whether to read the rest before
// showing any of it, and answering it re-laid the whole page out under the cursor. Scrolling
// asks nothing — you look further down and there is more.
//
// It is LAZY on purpose, not merely scrollable. Both Beranda columns can hold every low-stock
// item and every overdue rack in the gudang, and each row draws an SVG; rendering hundreds on
// a screen that shows six is work the tablet does before anybody has read the first one.
//
// `IntersectionObserver` where it exists, a scroll-position check where it does not — the
// fallback is four lines and means the list still grows in a test environment and on anything
// old enough to be in a masjid store room.

import { useEffect, useRef, useState } from 'octane';

export function useLazyCount(total: number, page: number) {
  const [raw, setRaw] = useState(page);
  const sentinel = useRef<HTMLDivElement | null>(null);

  /* Clamped on the way OUT rather than in state: a caller that renders `count` rows directly
     would otherwise draw six placeholders for a list of three, and a shrinking list — a rack
     counted while the column is open — would leave the window past the end. */
  const count = Math.min(raw, total);

  const more = () => setRaw((n) => Math.min(n + page, total));

  useEffect(() => {
    const el = sentinel.current;
    if (!el || count >= total) return;


    const box = el.parentElement;

    if (typeof IntersectionObserver === 'function' && box) {
      /* `root` is the SCROLL BOX, not the viewport. Left to default, the sentinel only counts
         as visible when the card itself is on screen, so a column scrolled to its end while
         the page sits at the top never loaded anything — which is exactly how this first
         failed. */
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) more();
      /* A small margin, not a generous one: at 120px the sentinel counted as visible on the
         first render, so the second page arrived before anybody had scrolled at all and the
         laziness was decorative. 24px asks for a real scroll and still loads before the
         reader reaches the end. */
      }, { root: box, rootMargin: '0px 0px 24px 0px' });
      io.observe(el);
      return () => io.disconnect();
    }

    if (!box) return;
    const onScroll = () => {
      if (box.scrollTop + box.clientHeight >= box.scrollHeight - 24) more();
    };
    box.addEventListener('scroll', onScroll);
    return () => box.removeEventListener('scroll', onScroll);
  }, [count, total]);

  return { count, sentinel, done: count >= total };
}

/**
 * The scrolling box itself.
 *
 * A fixed max height rather than a row count, because the two columns sit side by side and
 * have to end level — an item row and a rack row are not the same height, so matching them by
 * count leaves one card hanging below the other.
 */
export function LazyList(
  { children, sentinel, done, label }:
  {
    children?: unknown;
    sentinel: { current: HTMLDivElement | null };
    done: boolean;
    /** Announced when more rows arrive, for anybody not watching the scroll. */
    label?: string;
  },
) {
  return (
    <div class="custom-scrollbar -mx-[var(--card-pad)] max-h-80 overflow-y-auto px-[var(--card-pad)]">
      {children}
      {/* Inside the scroller, below the last row: it has to be able to come into view. */}
      <div ref={sentinel} aria-hidden={done ? 'true' : undefined} class="h-1" />
      {!done && (
        <p class="py-3 text-center text-xs text-slate-500" role="status">
          {label ?? 'Gulir untuk melihat lainnya…'}
        </p>
      )}
    </div>
  );
}
