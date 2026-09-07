// Asking for something to be bought.
//
// Four fields the boss named — reason, price, image, link — plus the three you cannot buy
// without: what, how many, in what unit. The order below is the order somebody thinks in: the
// thing, then how much of it, then why, then the money, then where to get it.
//
// Photos are added AFTER saving, from the request's own row. Uploading before the request
// exists would mean holding blobs against an id that does not exist yet, and the common case —
// a screenshot of a listing — is something people paste in a moment later anyway.

import { useMemo, useState } from 'octane';
import { validateRequest } from '../../../../domain/requests';
import type { RequestProblem } from '../../../../domain/requests';
import type { Item } from '../../../../domain/types';
import { Button, ERROR_TEXT, FIELD, FIELD_ERROR, LABEL, Select } from '../../components/ui';

export interface RequestInput {
  name: string;
  itemId?: string;
  qty: number;
  unit: string;
  reason: string;
  price?: number;
  url?: string;
}

/** `''` means "something we do not own yet", which is the common case and so the default. */
const NEW_THING = '';

export function RequestForm(
  { items, onSubmit, onCancel }:
  { items: Item[]; onSubmit: (input: RequestInput) => void; onCancel: () => void },
) {
  const [itemId, setItemId] = useState(NEW_THING);
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState('buah');
  const [reason, setReason] = useState('');
  const [price, setPrice] = useState('');
  const [url, setUrl] = useState('');
  const [showProblems, setShowProblems] = useState(false);

  const existing = items.find((i) => i.itemId === itemId);

  const input: RequestInput = {
    name: existing ? existing.name : name,
    qty,
    unit: existing ? existing.unit : unit,
    reason,
    ...(itemId ? { itemId } : {}),
    ...(price.trim() === '' ? {} : { price: Number(price.replace(/[^\d]/g, '')) }),
    ...(url.trim() === '' ? {} : { url }),
  };

  const problems = useMemo(() => validateRequest(input), [input]);
  const problem = (field: RequestProblem['field']) =>
    (showProblems ? problems.find((p) => p.field === field) : undefined);

  function submit() {
    setShowProblems(true);
    if (problems.length > 0) return;
    onSubmit(input);
  }

  return (
    <div>
      {/* Restock or something new. Asked first because it changes what the rest of the form
          needs: a restock already knows its name and unit, and picking from the catalog is
          what stops a second row called "Sabun cuci tangan" appearing when it is bought. */}
      <label class={LABEL} for="req-item">Barang</label>
      <Select
        id="req-item"
        value={itemId}
        onChange={(e: Event) => {
          const picked = (e.target as HTMLSelectElement).value;
          setItemId(picked);
          const found = items.find((i) => i.itemId === picked);
          if (found) setUnit(found.unit);
        }}
      >
        <option value={NEW_THING}>Barang baru (belum ada di katalog)</option>
        {items.map((i) => (
          <option key={i.itemId} value={i.itemId}>Tambah stok: {i.name}</option>
        ))}
      </Select>

      {!existing && (
        <div class="mt-4">
          <label class={LABEL} for="req-name">Nama barang</label>
          <input
            id="req-name"
            class={`${FIELD} min-h-touch ${problem('name') ? FIELD_ERROR : ''}`}
            value={name}
            placeholder="Sapu ijuk besar"
            autocomplete="off"
            /* Octane uses NATIVE events: `change` fires on blur, so text must use `onInput`. */
            onInput={(e: Event) => setName((e.target as HTMLInputElement).value)}
          />
          {problem('name') && <p class={ERROR_TEXT}>{problem('name')!.message}</p>}
        </div>
      )}

      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label class={LABEL} for="req-qty">Jumlah</label>
          <input
            id="req-qty"
            class={`${FIELD} min-h-touch ${problem('qty') ? FIELD_ERROR : ''}`}
            type="number"
            min="1"
            value={String(qty)}
            onInput={(e: Event) => setQty(Number((e.target as HTMLInputElement).value))}
          />
          {problem('qty') && <p class={ERROR_TEXT}>{problem('qty')!.message}</p>}
        </div>
        <div>
          <label class={LABEL} for="req-unit">Satuan</label>
          <input
            id="req-unit"
            class={`${FIELD} min-h-touch ${problem('unit') ? FIELD_ERROR : ''}`}
            value={unit}
            disabled={existing != null}
            placeholder="buah"
            onInput={(e: Event) => setUnit((e.target as HTMLInputElement).value)}
          />
          {problem('unit') && <p class={ERROR_TEXT}>{problem('unit')!.message}</p>}
        </div>
      </div>

      {/* Required, and the only required field that is not needed to place an order. A request
          nobody can judge is one somebody has to chase the requester about — more work for two
          people than typing it cost one. */}
      <div class="mt-4">
        <label class={LABEL} for="req-reason">Kenapa perlu dibeli?</label>
        <textarea
          id="req-reason"
          rows={3}
          class={`${FIELD} py-3 ${problem('reason') ? FIELD_ERROR : ''}`}
          value={reason}
          placeholder="Gagang sapu yang lama patah, tinggal satu yang bisa dipakai."
          onInput={(e: Event) => setReason((e.target as HTMLTextAreaElement).value)}
        />
        {problem('reason') && <p class={ERROR_TEXT}>{problem('reason')!.message}</p>}
      </div>

      <div class="mt-4">
        <label class={LABEL} for="req-price">Perkiraan harga per {unit || 'satuan'} (opsional)</label>
        <div class="relative">
          <span class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">Rp</span>
          <input
            id="req-price"
            class={`${FIELD} min-h-touch pl-11 ${problem('price') ? FIELD_ERROR : ''}`}
            inputmode="numeric"
            value={price}
            placeholder="27500"
            onInput={(e: Event) => setPrice((e.target as HTMLInputElement).value)}
          />
        </div>
        <p class="mt-1 text-xs text-slate-400">
          Boleh dikosongkan kalau belum tahu — nanti dihitung terpisah, tidak dianggap gratis.
        </p>
      </div>

      <div class="mt-4">
        <label class={LABEL} for="req-url">Link toko (opsional)</label>
        <input
          id="req-url"
          class={`${FIELD} min-h-touch ${problem('url') ? FIELD_ERROR : ''}`}
          type="url"
          value={url}
          placeholder="https://www.tokopedia.com/…"
          autocomplete="off"
          onInput={(e: Event) => setUrl((e.target as HTMLInputElement).value)}
        />
        {problem('url') && <p class={ERROR_TEXT}>{problem('url')!.message}</p>}
      </div>

      <div class="mt-5 flex flex-wrap items-center gap-3">
        <Button size="touch" onClick={submit}>Ajukan</Button>
        <button type="button" class="font-semibold text-slate-500 underline" onClick={onCancel}>
          Batal
        </button>
      </div>

      <p class="mt-4 text-xs leading-relaxed text-slate-400">
        Fotonya bisa ditambahkan setelah pengajuan tersimpan, langsung dari daftarnya.
      </p>
    </div>
  );
}
