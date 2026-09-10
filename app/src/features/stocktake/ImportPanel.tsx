// Reading a stock-take back in.
//
// Export existed from the start; import did not, which made the CSV a one-way door — you could
// save an afternoon in the gudang but not restore it. A draft lives in one browser's
// localStorage, so a cleared cache, a different phone, or `Kosongkan` on the wrong day loses
// the single largest block of work this system can ask anybody to do. §0.0's test is not close
// on this one.
//
// It is also how a catalog gets back IN after the boss edits the sheet, which is the whole
// point of putting it in a Google Sheet.
//
// The parsing is `data/parse.ts` verbatim — the same quarantining boundary the gateway will
// use (§58 decision 8). A hand-edited spreadsheet is a hostile data source, and a bad row is
// SHOWN rather than dropped, because a silent skip is how somebody discovers three months
// later that a shelf was never restored.

import { useState } from 'octane';
import { FileUp, TriangleAlert, Upload } from '@octanejs/lucide';
import {
  parseCategories, parseItems, parseLocations, parseRequests, parseStock,
} from '../../../../data/parse';
import type { ParseIssue } from '../../../../data/parse';
import type { Category, Item, Location, StockLine } from '../../../../domain/types';
import type { PurchaseRequest } from '../../../../domain/requests';
import { Button } from '../../components/ui';

/** What one dropped file turned into. */
interface Read {
  tab: string;
  items?: Item[];
  categories?: Category[];
  locations?: Location[];
  stock?: StockLine[];
  requests?: PurchaseRequest[];
  count: number;
  issues: ParseIssue[];
}

/**
 * Which tab a file is, worked out from its HEADER rather than its name.
 *
 * A downloaded file is routinely `Items (1).csv`, or renamed, or re-exported from Sheets with a
 * different name entirely. The columns are the thing that cannot be wrong.
 */
export function readCsv(csv: string): Read | null {
  const header = (csv.split('\n')[0] ?? '').toLowerCase();
  const has = (c: string) => header.includes(c);

  if (has('itemid') && has('locationid') && has('initialstock')) {
    const r = parseStock(csv);
    return { tab: 'Stock', stock: r.ok, count: r.ok.length, issues: r.quarantined };
  }
  if (has('requestid')) {
    const r = parseRequests(csv);
    return { tab: 'Requests', requests: r.ok, count: r.ok.length, issues: r.quarantined };
  }
  if (has('itemid') && has('barcode')) {
    const r = parseItems(csv);
    return { tab: 'Items', items: r.ok, count: r.ok.length, issues: r.quarantined };
  }
  if (has('locationid') && has('code')) {
    const r = parseLocations(csv);
    return { tab: 'Locations', locations: r.ok, count: r.ok.length, issues: r.quarantined };
  }
  if (has('categoryid')) {
    const r = parseCategories(csv);
    return { tab: 'Categories', categories: r.ok, count: r.ok.length, issues: r.quarantined };
  }
  return null;
}

export function ImportPanel(
  { onApply }:
  {
    onApply: (read: {
      items?: Item[]; categories?: Category[]; locations?: Location[];
      stock?: StockLine[]; requests?: PurchaseRequest[];
    }) => void;
  },
) {
  const [reads, setReads] = useState<Read[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [done, setDone] = useState(0);

  async function take(files: FileList | null) {
    if (!files || files.length === 0) return;
    const next: Read[] = [];
    const bad: string[] = [];
    for (const file of Array.from(files)) {
      const read = readCsv(await file.text());
      if (read) next.push(read);
      else bad.push(file.name);
    }
    // Replaced, not accumulated: picking files twice means the second pick is the intent.
    setReads(next);
    setRejected(bad);
    setDone(0);
  }

  const merged = reads.reduce<Parameters<typeof onApply>[0]>((acc, r) => ({
    ...acc,
    ...(r.items ? { items: r.items } : {}),
    ...(r.categories ? { categories: r.categories } : {}),
    ...(r.locations ? { locations: r.locations } : {}),
    ...(r.stock ? { stock: r.stock } : {}),
    ...(r.requests ? { requests: r.requests } : {}),
  }), {});

  const issues = reads.flatMap((r) => r.issues);

  return (
    <div>
      <p class="text-sm leading-relaxed text-slate-600">
        Pilih berkas CSV hasil ekspor — boleh beberapa sekaligus. Isinya menggantikan data di
        perangkat ini, jadi ini juga cara memulihkan opname yang hilang.
      </p>

      <label class="mt-4 flex min-h-touch cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-400 px-4 py-6 text-sm font-semibold text-slate-700 hover:border-slate-900">
        <FileUp class="h-5 w-5" />
        Pilih berkas CSV
        <input
          type="file"
          accept=".csv,text/csv"
          multiple
          class="sr-only"
          onChange={(e: Event) => void take((e.target as HTMLInputElement).files)}
        />
      </label>

      {rejected.length > 0 && (
        <p class="mt-3 text-sm text-red-700" role="alert">
          Tidak dikenali: {rejected.join(', ')}. Kolomnya tidak cocok dengan tab mana pun.
        </p>
      )}

      {reads.length > 0 && (
        <>
          <ul class="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {reads.map((r) => (
              <li key={r.tab} class="flex items-baseline gap-3 px-4 py-3">
                <span class="min-w-0 flex-1 text-sm font-bold text-slate-900">{r.tab}</span>
                <span class="text-sm tabular-nums text-slate-600">{r.count} baris</span>
                {r.issues.length > 0 && (
                  <span class="text-sm font-semibold text-amber-700">
                    {r.issues.length} bermasalah
                  </span>
                )}
              </li>
            ))}
          </ul>

          {/* Named, not counted. "3 bermasalah" is a number somebody nods at; the row and the
              column is something they can go and fix in the sheet. */}
          {issues.length > 0 && (
            <div class="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              <div class="flex items-start gap-2">
                <TriangleAlert class="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <div class="min-w-0">
                  <p class="text-sm font-bold text-slate-900">
                    {issues.length} baris tidak bisa dibaca dan akan dilewati.
                  </p>
                  <ul class="mt-1 space-y-0.5">
                    {issues.slice(0, 5).map((i) => (
                      <li key={`${i.row}-${i.field ?? ''}`} class="text-xs leading-relaxed text-slate-700">
                        Baris {i.row}{i.field ? ` (${i.field})` : ''}: {i.message}
                      </li>
                    ))}
                  </ul>
                  {issues.length > 5 && (
                    <p class="mt-1 text-xs text-slate-500">…dan {issues.length - 5} lagi.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div class="mt-5 flex flex-wrap items-center gap-3">
            <Button size="touch" onClick={() => { onApply(merged); setDone(reads.length); }}>
              <Upload class="h-5 w-5" /> Muat {reads.length} berkas
            </Button>
            {done > 0 && (
              <span class="text-sm font-semibold text-green-700" role="status">
                Sudah dimuat.
              </span>
            )}
          </div>

          <p class="mt-4 text-xs leading-relaxed text-slate-500">
            Tab yang tidak dipilih dibiarkan apa adanya — memuat Items saja tidak menghapus rak
            atau pengajuan.
          </p>
        </>
      )}
    </div>
  );
}
