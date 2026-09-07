// Cetak Label — choose what to print, at what size, then print it.
//
// WHY THIS IS A PICKER AND NOT A DUMP. The first version printed the entire catalog: every
// rack, every item and every individually-tagged unit, on one sheet, every time. That is right
// exactly once — the day the gudang is first labelled — and wrong every day after, because the
// real jobs are small and specific:
//
//   · one label fell off a shelf and needs reprinting
//   · a new rack was built and needs its tag
//   · somebody is walking to rack A1 and wants that shelf finished in one trip
//   · twelve new knives arrived and each needs a keyring tag
//
// None of those is served by a 374-label sheet, and each of them is a wasted A4 of sticker
// stock if it is. So the page asks two questions in order — *what* and *how big* — and the
// preview only ever shows what was actually chosen.
//
// It also fixes the cost. Encoding every QR in the catalog is ~570ms of synchronous work and
// megabytes of SVG path data; the picker list is plain text, so the expensive part is now
// proportional to the selection rather than to the size of the gudang.

import { useEffect, useMemo, useRef, useState } from 'octane';
import { Printer, QrCode, Search, Settings, TriangleAlert } from '@octanejs/lucide';
import { Sheet } from '../../components/Sheet';
import type { Category, Item, Location, StockLine } from '../../../../domain/types';
import { Button, CARD, FIELD, LABEL } from '../../components/ui';
import { qrSvg, qrViewBox } from './qr';
import {
  groupLabels, isUnprintableBaseUrl, labelsFor, perSheet, SHEET_FORMATS, sheetCount, suggestFormat,
} from './labels';
import type { LabelKind, LabelLayout, LabelSpec, SheetFormat } from './labels';

/** Per frame. Small enough that one frame stays under a few milliseconds on a cheap tablet. */
const CHUNK = 12;

/** Groups start open only when there are few enough that opening them all is still a list. */
const AUTO_OPEN_UPTO = 3;

const KIND_LABEL: Record<LabelKind, string> = {
  rack: 'Rak', item: 'Barang', asset: 'Unit',
};

export function LabelSheet(
  { items, categories, locations, stock }:
  { items: Item[]; categories: Category[]; locations: Location[]; stock: StockLine[] },
) {
  const [baseUrl, setBaseUrl] = useState(() => location.origin);
  const [targetOpen, setTargetOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);

  const acquiredTs = useMemo(() => Date.now(), []);
  const labels = useMemo(
    () => labelsFor(items, categories, locations, baseUrl, acquiredTs, stock),
    [items, categories, locations, baseUrl, acquiredTs, stock],
  );
  const groups = useMemo(() => groupLabels(labels, locations), [labels, locations]);

  /**
   * What is ticked on arrival, and why it is not simply "everything" or "nothing".
   *
   * An empty preview reads as a broken screen; a full one re-creates the problem this picker
   * exists to solve. So the default follows the size of the job: a catalog small enough to
   * fit on a couple of sheets is selected whole, because that is almost certainly what
   * somebody opening this screen wants and it costs two sheets to be wrong. Past that, only
   * the rack labels — the ones the roadmap asks for first (§59: walk the gudang and tag the
   * shelves), a handful rather than hundreds, and the one label that is useful before
   * anything else has been catalogued.
   */
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => {
    const modest = labels.length <= perSheet(SHEET_FORMATS[2]) * 2;
    return new Set(
      labels.filter((l) => modest || l.kind === 'rack').map((l) => l.code),
    );
  });
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(
    () => new Set(groups.length <= AUTO_OPEN_UPTO ? groups.map((g) => g.key) : []),
  );

  const [format, setFormat] = useState<SheetFormat>(() => SHEET_FORMATS[2]);
  /** Cleared the moment the user picks a size themselves — a suggestion must not fight them. */
  const [formatPinned, setFormatPinned] = useState(false);

  const chosen = useMemo(
    () => labels.filter((l) => selected.has(l.code)),
    [labels, selected],
  );

  // Move the default size with the selection, until the user expresses a preference.
  useEffect(() => {
    if (!formatPinned) setFormat(suggestFormat(chosen));
  }, [chosen, formatPinned]);

  const risky = isUnprintableBaseUrl(baseUrl);
  const pages = Math.max(sheetCount(chosen.length, format), 1);
  useEffect(() => { setPage((p) => Math.min(p, pages - 1)); }, [pages]);

  const toggle = (code: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (!next.delete(code)) next.add(code);
    return next;
  });

  const setMany = (codes: readonly string[], on: boolean) => setSelected((prev) => {
    const next = new Set(prev);
    for (const c of codes) { if (on) next.add(c); else next.delete(c); }
    return next;
  });

  const selectKind = (kind: LabelKind | 'all' | 'none') => setSelected(
    kind === 'none' ? new Set()
      : new Set(labels.filter((l) => kind === 'all' || l.kind === kind).map((l) => l.code)),
  );

  /**
   * Labels are rendered a chunk at a time, not all at once.
   *
   * Each QR is encoded synchronously — measured at ~570ms for a full catalog, plus ~2MB of SVG
   * path data to diff into the DOM in one pass. That is a visible freeze on a cheap tablet.
   * Spreading it across frames keeps the page answering taps, and a count that climbs is a
   * better answer to "is it working?" than a still screen.
   *
   * requestAnimationFrame deliberately: it paces with paint, and it pauses when the tab is
   * backgrounded — which is correct, since nobody is reading labels they cannot see.
   */
  const [rendered, setRendered] = useState(CHUNK);
  useEffect(() => { setRendered(CHUNK); }, [chosen.length, baseUrl]);
  useEffect(() => {
    if (rendered >= chosen.length) return;
    const frame = requestAnimationFrame(() => setRendered((n) => Math.min(n + CHUNK, chosen.length)));
    return () => cancelAnimationFrame(frame);
  }, [rendered, chosen.length]);
  const building = rendered < chosen.length;

  const filter = query.trim().toLowerCase();
  const visible = (g: { labels: LabelSpec[] }) =>
    (filter ? g.labels.filter((l) => l.haystack.includes(filter)) : g.labels);

  if (items.length === 0 && locations.length === 0) {
    return (
      <div class="space-y-4 pt-4 sm:pt-6">
        <Header />
        <p class={`${CARD} no-print py-20 text-center italic text-slate-400`}>
          Belum ada barang. Catat dulu di Opname Gudang.
        </p>
      </div>
    );
  }

  return (
    <div class="space-y-4 pb-8 pt-4 sm:space-y-6 sm:pt-6">
      <div class="no-print"><Header /></div>

      {/* Picker left, preview right. The two are read together — you tick a rack and want to
          see what lands on the sheet — so on a wide screen they sit side by side and the
          picker stays put while the preview scrolls. */}
      <div class="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start lg:gap-6 print:block print:gap-0">
        <div class="no-print space-y-4 lg:sticky lg:top-4">
          {/* --- 1. What ----------------------------------------------------------------- */}
          <section class={CARD}>
            <Step n={1} title="Pilih label" note={`${chosen.length} dipilih`} />

            <div class="mb-3 flex flex-wrap gap-1.5">
              <Chip onClick={() => selectKind('all')}>Semua</Chip>
              <Chip onClick={() => selectKind('rack')}>Semua rak</Chip>
              <Chip onClick={() => selectKind('item')}>Semua barang</Chip>
              <Chip onClick={() => selectKind('asset')}>Semua alat</Chip>
              <Chip onClick={() => selectKind('none')} muted>Kosongkan</Chip>
            </div>

            <div class="relative mb-3">
              <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                class={`${FIELD} py-2 pl-9`}
                type="search"
                placeholder="Cari nama, kode, rak…"
                value={query}
                aria-label="Cari label"
                onInput={(e: Event) => setQuery((e.target as HTMLInputElement).value)}
              />
            </div>

            {/* Grouped by rack, because a sheet is carried to one shelf. Ticking a group
                header is the "print everything on rack A1" case, which is the whole reason
                the grouping exists rather than one flat list of 374 rows. */}
            <div
              role="group"
              aria-label="Daftar label"
              class="custom-scrollbar max-h-[26rem] overflow-y-auto rounded-lg border border-slate-100"
            >
              {groups.map((g) => {
                const rows = visible(g);
                if (rows.length === 0) return null;
                const codes = rows.map((l) => l.code);
                const on = codes.filter((c) => selected.has(c)).length;
                const open = filter !== '' || openGroups.has(g.key);
                return (
                  <div key={g.key} class="border-b border-slate-100 last:border-b-0">
                    <div class="flex items-center gap-2 bg-slate-50/60 px-3 py-2">
                      <TriCheckbox
                        checked={on === codes.length}
                        partial={on > 0 && on < codes.length}
                        label={`Pilih semua di ${g.title}`}
                        onToggle={() => setMany(codes, on !== codes.length)}
                      />
                      <button
                        type="button"
                        class="flex min-w-0 flex-1 items-baseline gap-2 text-left"
                        aria-expanded={open}
                        onClick={() => setOpenGroups((prev) => {
                          const next = new Set(prev);
                          if (!next.delete(g.key)) next.add(g.key);
                          return next;
                        })}
                      >
                        <span class="truncate text-sm font-bold text-slate-900">{g.title}</span>
                        <span class="truncate text-xs text-slate-400">{g.subtitle}</span>
                        <span class="ml-auto shrink-0 text-xs tabular-nums text-slate-500">
                          {on > 0 && <span class="font-bold text-slate-900">{on}/</span>}{rows.length}
                        </span>
                      </button>
                    </div>
                    {open && (
                      <ul>
                        {rows.map((l) => (
                          <li key={l.code}>
                            <label class="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-slate-50">
                              <input
                                type="checkbox"
                                class="h-4 w-4 shrink-0 accent-slate-900"
                                checked={selected.has(l.code)}
                                onChange={() => toggle(l.code)}
                              />
                              <span class="min-w-0 flex-1 truncate text-sm text-slate-700">{l.title}</span>
                              <span class="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                {KIND_LABEL[l.kind]}
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
              {groups.every((g) => visible(g).length === 0) && (
                <p class="px-3 py-8 text-center text-sm italic text-slate-400">
                  Tidak ada label yang cocok dengan “{query}”.
                </p>
              )}
            </div>
          </section>

          {/* --- 2. How big -------------------------------------------------------------- */}
          <section class={CARD}>
            <Step n={2} title="Ukuran label" />
            <div class="grid gap-2" role="radiogroup" aria-label="Ukuran label">
              {SHEET_FORMATS.map((f) => {
                const active = f.id === format.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    class={`rounded-lg border p-3 text-left transition-colors ${
                      active
                        ? 'border-slate-900 bg-slate-900 text-slate-50'
                        : 'border-slate-400 bg-white hover:border-slate-900 hover:bg-slate-50'
                    }`}
                    onClick={() => { setFormat(f); setFormatPinned(true); }}
                  >
                    <div class="flex items-baseline justify-between gap-2">
                      <span class="text-sm font-bold">{f.name}</span>
                      <span class={`shrink-0 text-[11px] tabular-nums ${active ? 'text-slate-300' : 'text-slate-400'}`}>
                        {f.width}×{f.height}mm
                      </span>
                    </div>
                    <p class={`mt-0.5 text-xs leading-snug ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                      {f.purpose}
                    </p>
                    <p class={`mt-1 text-[11px] font-semibold tabular-nums ${active ? 'text-slate-400' : 'text-slate-400'}`}>
                      {perSheet(f)} per lembar A4
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

        </div>

        {/* --- Preview ------------------------------------------------------------------- */}
        <div class="min-w-0 space-y-3 print:space-y-0">
          <div class={`${CARD} no-print flex flex-wrap items-center gap-x-4 gap-y-3 lg:sticky lg:top-4 lg:z-10`}>
            {/* One live region rather than numbers stitched from several elements — a screen
                reader announces the whole count when the selection or the format changes. */}
            <p role="status" class="text-sm text-slate-600">
              <span class="font-bold text-slate-900 tabular-nums">{chosen.length}</span> label
              {' · '}
              <span class="font-bold text-slate-900 tabular-nums">{sheetCount(chosen.length, format)}</span> lembar A4
              <span class="text-slate-400"> · {format.name}</span>
            </p>
            <span class="ml-auto flex items-center gap-2">
              {/* The QR's destination is set once, when the app gets a real address, and then
                  never again — so it lived as a third step in a column of things chosen on
                  every visit. It is an icon here instead, next to the button it guards: an
                  unusable address is the one thing that stops printing, so the warning has to
                  be beside Cetak rather than three cards away from it. */}
              <button
                type="button"
                class={`flex h-touch w-touch shrink-0 items-center justify-center rounded-lg border ${risky
                  ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
                  : 'border-slate-400 bg-white text-slate-600 hover:bg-slate-100'}`}
                aria-label="Tujuan QR"
                title="Tujuan QR"
                onClick={() => setTargetOpen(true)}
              >
                {risky ? <TriangleAlert class="h-5 w-5" /> : <Settings class="h-5 w-5" />}
              </button>
              {/* Printing mid-build would send half-drawn sheets to a printer, which costs
                  paper and stickers rather than just a retry. */}
              <Button
                size="touch"
                disabled={risky || building || chosen.length === 0}
                onClick={() => print()}
              >
                <Printer class="h-5 w-5" />
                {building ? `Menyiapkan ${rendered}/${chosen.length}…` : 'Cetak'}
              </Button>
            </span>
          </div>

          {/* The one thing that ruins a sheet of stickers, and it happens in a dialog this app
              cannot reach. Every browser defaults to "Fit to printable area", which shrinks the
              page by about 5% — invisible on plain paper, and enough to walk every label off its
              sticker by the bottom of the sheet. Cheap to say here; expensive to discover after
              printing. */}
          {chosen.length > 0 && (
            <p class="no-print rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm leading-relaxed text-slate-700">
              <span class="font-bold text-slate-900">Di dialog cetak, setel Skala ke 100%</span>{' '}
              (bukan “Fit to page” / “Sesuaikan halaman”) dan Margin ke Default. Kalau diperkecil,
              ukurannya meleset dan label tidak lagi pas di stikernya.{' '}
              <span class="text-slate-500">Coba di kertas biasa dulu sebelum pakai lembar stiker.</span>
            </p>
          )}

          {chosen.length === 0 ? (
            <div class={`${CARD} no-print py-16 text-center`}>
              <QrCode class="mx-auto mb-3 h-10 w-10 text-slate-300" />
              <p class="font-semibold text-slate-500">Belum ada label yang dipilih.</p>
              <p class="mx-auto mt-1 max-w-xs text-sm text-slate-400">
                Centang satu rak untuk mencetak seluruh isinya sekaligus, atau pilih satu barang
                saja kalau labelnya cuma lepas satu.
              </p>
            </div>
          ) : (
            pages > 1 && (
              <div class="no-print flex flex-wrap items-center gap-1.5">
                <span class="mr-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Lembar
                </span>
                {Array.from({ length: pages }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-current={i === page}
                    class={`h-8 min-w-8 rounded-md px-2 text-sm font-bold tabular-nums transition-colors ${
                      i === page
                        ? 'bg-slate-900 text-slate-50'
                        : 'bg-white text-slate-700 border border-slate-400 hover:bg-slate-100'
                    }`}
                    onClick={() => setPage(i)}
                  >
                    {i + 1}
                  </button>
                ))}
                <span class="ml-2 text-xs text-slate-400">semua lembar ikut tercetak</span>
              </div>
            )
          )}

          {/* Every sheet is in the DOM so the printer gets all of them, but only the one being
              looked at is painted — a 40-page preview is scrolling, not reviewing. Bordered and
              on white, because what it stands for is a sheet of paper. */}
          {chosen.slice(0, rendered).length > 0 && (
            <div class="overflow-x-auto rounded-lg border border-slate-200 bg-white p-3 shadow-sm print:border-0 print:p-0 print:shadow-none">
              {Array.from({ length: pages }, (_, i) => (
                <div
                  key={i}
                  class={`label-sheet ${i === page ? '' : 'is-offscreen'}`}
                  style={`--label-w:${format.width}mm;--label-h:${format.height}mm;--label-cols:${format.columns}`}
                >
                  {chosen
                    .slice(0, rendered)
                    .slice(i * perSheet(format), (i + 1) * perSheet(format))
                    .map((l) => <Label key={l.code} spec={l} layout={format.layout} />)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Sheet
        open={targetOpen}
        title="Tujuan QR"
        description="Alamat yang dibuka saat label dipindai."
        onClose={() => setTargetOpen(false)}
      >
        <label class={LABEL} for="base-url">Alamat aplikasi</label>
        <input
          id="base-url"
          class={`${FIELD} min-h-touch`}
          value={baseUrl}
          autocomplete="off"
          onInput={(e: Event) => setBaseUrl((e.target as HTMLInputElement).value)}
        />
        <p class="mt-1.5 text-xs text-slate-400">
          Setiap QR berisi alamat ini. Diisi sekali, saat aplikasinya sudah punya alamat tetap.
        </p>

        {/* A sticker outlives the laptop that printed it. Catching this here costs a sentence;
            catching it later costs reprinting every label in the gudang. */}
        {risky && (
          <p
            role="alert"
            class="mt-4 rounded-lg border border-red-100 bg-red-50/50 px-3 py-2.5 text-sm font-medium text-red-700"
          >
            Alamat ini hanya hidup di komputer ini. Label yang dicetak sekarang tidak akan bisa
            dibuka dari HP lain — isi dulu alamat aplikasi yang sudah online.
          </p>
        )}

        <div class="mt-5">
          <Button size="touch" onClick={() => setTargetOpen(false)}>Selesai</Button>
        </div>
      </Sheet>
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 class="text-xl font-bold text-slate-900 sm:text-2xl">Cetak Label QR</h1>
      <p class="max-w-2xl text-sm text-slate-500 sm:text-base">
        Pilih apa yang mau dicetak dan seukuran apa — satu barang, satu rak beserta isinya, atau
        semuanya sekaligus.
      </p>
    </div>
  );
}

function Step({ n, title, note }: { n: number; title: string; note?: string }) {
  return (
    <div class="mb-3 flex items-baseline gap-2">
      <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-slate-50">
        {n}
      </span>
      <h2 class="text-sm font-bold uppercase tracking-wider text-slate-500">{title}</h2>
      {note && <span class="ml-auto shrink-0 text-xs tabular-nums text-slate-500">{note}</span>}
    </div>
  );
}

/**
 * A group is rarely all-or-nothing while you are picking, and "some of this rack" is a
 * different answer from "none of it". `indeterminate` is a DOM property with no HTML
 * attribute behind it, so it cannot be passed as a prop — it has to be written to the node.
 */
function TriCheckbox(
  { checked, partial, label, onToggle }:
  { checked: boolean; partial: boolean; label: string; onToggle: () => void },
) {
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = partial;
  }, [partial, checked]);
  return (
    <input
      ref={ref}
      type="checkbox"
      class="h-4 w-4 shrink-0 accent-slate-900"
      checked={checked}
      aria-label={label}
      onChange={onToggle}
    />
  );
}

function Chip({ children, onClick, muted }: { children?: unknown; onClick: () => void; muted?: boolean }) {
  return (
    <button
      type="button"
      class={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        muted
          ? 'border-slate-400 bg-white text-slate-600 hover:bg-slate-100'
          : 'border-slate-400 bg-white text-slate-800 hover:border-slate-900 hover:bg-slate-900 hover:text-slate-50'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Label({ spec, layout }: { spec: LabelSpec; layout: LabelLayout }) {
  const qr = useMemo(() => qrSvg(spec.url), [spec.url]);
  const box = qrViewBox(qr);

  return (
    <div class={`label label--${layout}`}>
      <svg class="label-qr" viewBox={`0 0 ${box} ${box}`} role="img" aria-label={spec.code}>
        {/* The quiet zone must be white, not transparent — a coloured sticker behind a
            transparent QR is the classic reason a code will not scan. */}
        <rect width={box} height={box} fill="#fff" />
        <path d={qr.d} fill="#000" />
      </svg>
      <div class="label-text">
        <span class="label-title">{spec.title}</span>
        <span class="label-subtitle">{spec.subtitle}</span>
        <span class="label-code">{spec.code}</span>
      </div>
    </div>
  );
}
