// One list, two shapes.
//
// A <table> is right on a desk and wrong on a phone: at 390px our columns overflowed and the
// status pill was clipped off the right edge, readable only by scrolling sideways — which
// nobody does, so the column may as well not exist. Below `sm` the same rows render as stacked
// cards instead, driven by the same column definitions so the two can never drift apart.
//
// Both shapes are in the DOM and one is hidden by CSS. That is deliberate: it needs no
// measurement, no resize listener and no hydration mismatch, and at our row counts the
// duplicate nodes cost less than any of those would.

import { useEffect, useState } from 'octane';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => unknown;
  align?: 'right';
  /**
   * How this column behaves in the mobile card:
   *   title    — the headline (there should be exactly one)
   *   trailing — pinned to the right of the headline, for a status pill or a quantity
   *   meta     — a labelled line underneath (the default)
   *   hidden   — dropped entirely; a phone has no room for everything
   */
  mobile?: 'title' | 'trailing' | 'meta' | 'hidden';
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  keyOf: (row: T) => string;
  /** Makes each row activatable by mouse and keyboard alike. */
  onRowClick?: (row: T) => void;
  rowLabel?: (row: T) => string;
  empty?: unknown;
  /**
   * Rows per page. Omit for a list short enough to read whole.
   *
   * It lives here rather than in each screen so the two long lists cannot drift into two
   * different pagers, and so the phone cards and the desk table are always looking at the
   * same slice — the failure this component exists to prevent.
   */
  pageSize?: number;
}

export function DataTable<T>(
  { columns, rows, keyOf, onRowClick, rowLabel, empty, pageSize }: Props<T>,
) {
  const [page, setPage] = useState(0);
  const pages = pageSize ? Math.max(1, Math.ceil(rows.length / pageSize)) : 1;

  // A filter that shortens the list must not leave you stranded on a page that no longer
  // exists — searching for something on page 4 would otherwise show an empty table.
  useEffect(() => { setPage((p) => Math.min(p, pages - 1)); }, [pages]);

  if (rows.length === 0) return <>{empty}</>;

  const from = pageSize ? page * pageSize : 0;
  const shown = pageSize ? rows.slice(from, from + pageSize) : rows;

  const interactive = (row: T) => (onRowClick ? {
    role: 'link',
    tabindex: 0,
    'aria-label': rowLabel?.(row),
    onClick: () => onRowClick(row),
    // A clickable row that ignores Enter and Space is invisible to a keyboard.
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(row); }
    },
  } : {});

  const title = columns.find((c) => c.mobile === 'title') ?? columns[0];
  const trailing = columns.filter((c) => c.mobile === 'trailing');
  const meta = columns.filter((c) => c !== title && c.mobile !== 'trailing' && c.mobile !== 'hidden');

  return (
    <>
      {/* Desk */}
      <div class="hidden overflow-x-auto sm:block">
        <table class="w-full text-left">
          <thead class="border-b border-slate-100 bg-slate-50">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  class={`px-6 py-3 text-xs font-bold uppercase tracking-wider text-slate-600 ${c.align === 'right' ? 'text-right' : ''}`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 bg-white">
            {shown.map((row) => (
              <tr
                key={keyOf(row)}
                class={`transition-colors ${onRowClick ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                {...interactive(row)}
              >
                {columns.map((c) => (
                  <td key={c.key} class={`px-6 py-4 align-middle ${c.align === 'right' ? 'text-right' : ''}`}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phone */}
      <ul class="divide-y divide-slate-100 bg-white sm:hidden">
        {shown.map((row) => (
          <li key={keyOf(row)}>
            <div
              class={`flex w-full flex-col gap-1.5 px-4 py-3 text-left ${onRowClick ? 'cursor-pointer active:bg-slate-50' : ''}`}
              {...interactive(row)}
            >
              <div class="flex items-start gap-3">
                <div class="min-w-0 flex-1">{title.cell(row)}</div>
                {trailing.map((c) => (
                  <div key={c.key} class="shrink-0">{c.cell(row)}</div>
                ))}
              </div>
              {meta.length > 0 && (
                <dl class="flex flex-wrap gap-x-4 gap-y-0.5">
                  {meta.map((c) => (
                    <div key={c.key} class="flex items-baseline gap-1.5">
                      <dt class="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                        {c.header}
                      </dt>
                      <dd class="text-sm text-slate-600">{c.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </li>
        ))}
      </ul>

      {pageSize && pages > 1 && (
        // Outside both shapes, because it belongs to the list rather than to either rendering
        // of it. The range is spelled out — "26–50 dari 137" answers "where am I and how much
        // is left" in one line, which a bare page number does not.
        <nav
          class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 sm:px-6"
          aria-label="Halaman"
        >
          <p role="status" class="text-xs text-slate-500 tabular-nums">
            {from + 1}–{Math.min(from + pageSize, rows.length)} dari {rows.length}
          </p>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="min-h-11 rounded-lg border border-slate-400 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              Sebelumnya
            </button>
            <span class="text-xs font-semibold tabular-nums text-slate-500">
              {page + 1}/{pages}
            </span>
            <button
              type="button"
              class="min-h-11 rounded-lg border border-slate-400 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white"
              disabled={page >= pages - 1}
              onClick={() => setPage(page + 1)}
            >
              Berikutnya
            </button>
          </div>
        </nav>
      )}
    </>
  );
}
