import { useMemo, useState } from 'octane';
import type { Category, Item, Location } from '../../../../domain/types';
import { Button, CARD, FIELD, LABEL, PageHeader } from '../../components/ui';
import { qrSvg, qrViewBox } from './qr';
import {
  isUnprintableBaseUrl, labelsFor, perSheet, SHEET_FORMATS, sheetCount,
} from './labels';
import type { LabelSpec, SheetFormat } from './labels';

export function LabelSheet(
  { items, categories, locations }:
  { items: Item[]; categories: Category[]; locations: Location[] },
) {
  const [baseUrl, setBaseUrl] = useState(() => location.origin);
  const [format, setFormat] = useState<SheetFormat>(SHEET_FORMATS[0]);

  const acquiredTs = useMemo(() => Date.now(), []);
  const labels = useMemo(
    () => labelsFor(items, categories, locations, baseUrl, acquiredTs),
    [items, categories, locations, baseUrl, acquiredTs],
  );
  const risky = isUnprintableBaseUrl(baseUrl);

  return (
    <div class="space-y-6 pb-8 pt-6">
      <div class="no-print">
        <PageHeader
          title="Cetak Label QR"
          subtitle="Tempel di rak untuk barang yang dihitung, atau di tiap unit untuk barang berlabel satu-satu."
        />
      </div>

      {items.length === 0 && locations.length === 0 ? (
        <p class={`${CARD} no-print py-20 text-center italic text-slate-400`}>
          Belum ada barang. Catat dulu di Opname Gudang.
        </p>
      ) : (
        <>
          <section class={`${CARD} no-print`}>
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
                class="mb-4 rounded-xl border border-red-100 bg-red-50/50 px-4 py-3 text-sm font-medium text-red-700"
              >
                Alamat ini hanya hidup di komputer ini. Label yang dicetak sekarang tidak akan
                bisa dibuka dari HP lain — isi dulu alamat aplikasi yang sudah online.
              </p>
            )}

            <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
              {/* One live region rather than numbers stitched from several elements — a
                  screen reader announces the whole count when the format changes. */}
              <p role="status" class="text-sm text-slate-500">
                {`${labels.length} label · ${sheetCount(labels.length, format)} lembar A4 · ${perSheet(format)} per lembar`}
              </p>
              <span class="ml-auto">
                <Button size="touch" disabled={risky} onClick={() => print()}>Cetak</Button>
              </span>
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
    </div>
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
