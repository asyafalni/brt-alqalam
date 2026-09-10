// Narrowing the list you are ALREADY looking at.
//
// Distinct from the navbar box, and the split is the point. That one is a FINDER: it answers
// "where is the soap" from anywhere and takes you to the thing. This one is a FILTER: it stays
// on one screen, changes nothing but what is visible, and never navigates.
//
// They used to be the same control, which meant one box did five different things depending on
// which screen you happened to be on — and none of them matched its own label. On Stok it
// matched a name and a unit, so typing a rack code found nothing; on Peta Rak it matched racks
// AND their contents; on Opname something else again. It also leaked: a query typed on Opname
// silently narrowed Stok when you got there, with the field the only clue and it up in the
// chrome where nobody looks.

import { Search, X } from '@octanejs/lucide';

/*
 * 44px, not the 56px `touch` target.
 *
 * It shipped at `min-h-touch` and stood a head taller than every button beside it — 56px next
 * to a 34px "Rak baru", which reads as two controls from two different apps sharing a row.
 * `ui.tsx` already argued this exact case for the side panels and landed on the same number:
 * "44px with 14px text is both" — a real finger target and in proportion. A filter is typed at
 * a desk or between shelves, not stabbed at with wet hands mid-lift, which is what 56px is for.
 */

export function FilterField(
  { value, onChange, label, placeholder }:
  { value: string; onChange: (v: string) => void; label: string; placeholder?: string },
) {
  return (
    <div class="field-shell flex min-h-11 w-full items-center gap-2.5 rounded-lg border border-slate-500 bg-white px-3.5 focus-within:outline-2 focus-within:outline-solid focus-within:outline-offset-2 focus-within:outline-slate-900 sm:w-64">
      <Search class="h-4 w-4 shrink-0 text-slate-400" />
      <input
        class="w-full min-w-0 border-none bg-transparent text-sm outline-none placeholder:text-slate-400"
        value={value}
        aria-label={label}
        placeholder={placeholder ?? label}
        autocomplete="off"
        onInput={(e: Event) => onChange((e.target as HTMLInputElement).value)}
        /* Escape empties it. The list snapping back is the fastest possible undo, and the hand
           is already on the keyboard. */
        onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Escape') onChange(''); }}
      />
      {value !== '' && (
        <button
          type="button"
          class="-mr-1 shrink-0 rounded-full p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          onClick={() => onChange('')}
          aria-label="Hapus filter"
        >
          <X class="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
