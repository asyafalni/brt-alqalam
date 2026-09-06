import { useMemo, useState } from 'octane';
import type { Category, Item } from '../../../../domain/types';
import { CARD, FIELD, LABEL } from '../stocktake/ItemForm';
import { qrSvg, qrViewBox } from './qr';
import {
  isUnprintableBaseUrl, labelsFor, perSheet, SHEET_FORMATS, sheetCount,
} from './labels';
import type { LabelSpec, SheetFormat } from './labels';

export function LabelSheet({ items, categories }: { items: Item[]; categories: Category[] }) {
  const [baseUrl, setBaseUrl] = useState(() => location.origin);
  const [format, setFormat] = useState<SheetFormat>(SHEET_FORMATS[0]);

  const acquiredTs = useMemo(() => Date.now(), []);
  const labels = useMemo(
    () => labelsFor(items, categories, baseUrl, acquiredTs),
    [items, categories, baseUrl, acquiredTs],
  );
  const risky = isUnprintableBaseUrl(baseUrl);

  return (
    <main class="mx-auto max-w-5xl p-4 pb-24">
      <header class="no-print mb-5">
        <h1 class="text-3xl font-bold tracking-tight">Cetak Label QR</h1>
        <p class="mt-1 text-muted-foreground">
          Tempel di rak untuk barang yang dihitung, atau di tiap unit untuk barang berlabel satu-satu.
        </p>
      </header>

      {items.length === 0 ? (
        <p class={`${CARD} no-print px-5 py-8 text-center text-muted-foreground`}>
          Belum ada barang. Catat dulu di Opname Gudang.
        </p>
      ) : (
        <>
          <section class={`${CARD} no-print mb-4 p-5`}>
            <div class="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label class={LABEL} for="base-url">Alamat aplikasi</label>
                <input
                  id="base-url"
                  class={FIELD}
                  value={baseUrl}
                  onInput={(e: Event) => setBaseUrl((e.target as HTMLInputElement).value)}
                />
              </div>
              <div>
                <label class={LABEL} for="format">Ukuran label</label>
                <select
                  id="format"
                  class={FIELD}
                  value={format.id}
                  onChange={(e: Event) => {
                    const id = (e.target as HTMLSelectElement).value;
                    setFormat(SHEET_FORMATS.find((f) => f.id === id) ?? SHEET_FORMATS[0]);
                  }}
                >
                  {SHEET_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
            </div>

            {/* A sticker outlives the laptop that printed it. Catching this here costs a
                sentence; catching it later costs reprinting every label in the gudang. */}
            {risky && (
              <p
                role="alert"
                class="mb-4 rounded-xl border-2 border-destructive px-4 py-3 font-medium text-destructive"
              >
                Alamat ini hanya hidup di komputer ini. Label yang dicetak sekarang tidak akan
                bisa dibuka dari HP lain — isi dulu alamat aplikasi yang sudah online.
              </p>
            )}

            <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
              {/* One live region rather than numbers stitched from several elements — a
                  screen reader announces the whole count when the format changes. */}
              <p role="status" class="text-muted-foreground">
                {`${labels.length} label · ${sheetCount(labels.length, format)} lembar A4 · ${perSheet(format)} per lembar`}
              </p>
              <button
                type="button"
                class="ml-auto min-h-touch rounded-xl bg-primary px-6 font-semibold text-primary-foreground disabled:opacity-40"
                disabled={risky}
                onClick={() => print()}
              >
                Cetak
              </button>
            </div>
          </section>

          <div
            class="label-sheet"
            style={`--label-w:${format.width}mm;--label-h:${format.height}mm;--label-cols:${format.columns}`}
          >
            {labels.map((l) => <Label key={l.code} spec={l} />)}
          </div>
        </>
      )}
    </main>
  );
}

function Label({ spec }: { spec: LabelSpec }) {
  const qr = useMemo(() => qrSvg(spec.url), [spec.url]);
  const box = qrViewBox(qr);

  return (
    <div class="label">
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
