// Ajukan — one form for the two things anybody asks money for.
//
// **Beli** something we do not have; **perbaiki** something we do. They are one screen because
// they are one act from the takmir's side — somebody is asking for a decision about spending —
// and because the alternative is two forms whose first question is which form you should have
// opened. What changes between them is small and honest: a purchase asks how many and in what
// unit, a repair asks which unit is broken. The rest — why, how much, where — is shared.
//
// Photos are added AFTER saving, from the request's own row. Uploading before the request
// exists would mean holding blobs against an id that does not exist yet, and the common case —
// a screenshot of a listing, or a photo of the crack — is pasted in a moment later anyway.

import { useMemo, useState } from 'octane';
import { ShoppingCart, Wrench } from '@octanejs/lucide';
import { validateRequest } from '../../../../domain/requests';
import type { RequestProblem, RequestType } from '../../../../domain/requests';
import type { DerivedInstance, Item } from '../../../../domain/types';
import { Button, ERROR_TEXT, FIELD, FIELD_ERROR, LABEL, Select } from '../../components/ui';

export interface RequestInput {
  type: RequestType;
  name: string;
  itemId?: string;
  assetId?: string;
  qty: number;
  unit: string;
  reason: string;
  price?: number;
  url?: string;
}

/** `''` means "something we do not own yet", which is the common case and so the default. */
const NEW_THING = '';

/** What a repair can be about: things we still have that do not work (Part IV's repair queue). */
export const repairable = (instances: DerivedInstance[]): DerivedInstance[] =>
  instances.filter((d) => d.status === 'broken');

export function RequestForm(
  { items, instances, onSubmit, onCancel, prefill }:
  {
    items: Item[];
    instances: DerivedInstance[];
    onSubmit: (input: RequestInput) => void;
    onCancel: () => void;
    /** Set when the form was opened from a broken or lost unit rather than from the button. */
    prefill?: { type: RequestType; assetId: string };
  },
) {
  const [type, setType] = useState<RequestType>(prefill?.type ?? 'beli');
  const [assetId, setAssetId] = useState(prefill?.assetId ?? '');
  const [itemId, setItemId] = useState(NEW_THING);
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState('buah');
  const [reason, setReason] = useState('');
  const [price, setPrice] = useState('');
  const [url, setUrl] = useState('');
  const [showProblems, setShowProblems] = useState(false);

  const repair = type === 'perbaikan';
  const broken = useMemo(() => repairable(instances), [instances]);

  // The unit named by the prefill may be lost rather than broken — that is the "beli pengganti"
  // link — so it is looked up across all of them, not only the repair queue.
  const chosen = instances.find((d) => d.instance.assetId === assetId);
  const chosenItem = chosen && items.find((i) => i.itemId === chosen.instance.itemId);
  const existing = items.find((i) => i.itemId === itemId);

  /* A repair names the thing by the unit it is about; a purchase names it in the requester's
     own words, because the whole point of a purchase is that it may not be in the catalog. */
  const effectiveName = repair
    ? (chosen?.instance.label ?? '')
    : (existing ? existing.name : name);

  const input: RequestInput = {
    type,
    name: effectiveName,
    qty: repair ? 1 : qty,
    unit: repair ? '' : (existing ? existing.unit : unit),
    reason,
    ...(repair && chosenItem ? { itemId: chosenItem.itemId } : {}),
    ...(!repair && itemId ? { itemId } : {}),
    ...(assetId ? { assetId } : {}),
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

  const priceLabel = repair
    ? 'Perkiraan biaya perbaikan (opsional)'
    : `Perkiraan harga per ${input.unit || 'satuan'} (opsional)`;

  return (
    <div>
      {/* Asked first because it changes what the rest of the form needs — and because the
          answer is usually already known before the form is opened, which is why arriving
          from a broken unit skips it entirely. */}
      <fieldset>
        <legend class={LABEL}>Mau mengajukan apa?</legend>
        <div class="grid grid-cols-2 gap-2">
          <KindChoice
            active={!repair}
            icon={ShoppingCart}
            title="Beli baru"
            hint="Belum punya, atau stoknya habis"
            onPick={() => setType('beli')}
          />
          <KindChoice
            active={repair}
            icon={Wrench}
            title="Perbaiki"
            hint="Sudah punya, tapi rusak"
            onPick={() => setType('perbaikan')}
          />
        </div>
      </fieldset>

      {repair ? (
        <div class="mt-4">
          <label class={LABEL} for="req-asset">Unit yang rusak</label>
          {broken.length === 0 && !chosen ? (
            /* Not an empty dropdown: a control with nothing in it reads as broken software,
               where a sentence explains the actual state of the gudang. */
            <p class="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Belum ada unit yang ditandai rusak. Tandai dulu dari halaman Aset, baru
              perbaikannya bisa diajukan.
            </p>
          ) : (
            <>
              <Select
                id="req-asset"
                value={assetId}
                onChange={(e: Event) => setAssetId((e.target as HTMLSelectElement).value)}
              >
                <option value="">Pilih unitnya…</option>
                {/* The prefilled unit may not be in the repair queue (a lost one being
                    replaced), so it is offered explicitly rather than silently dropped. */}
                {chosen && !broken.some((d) => d.instance.assetId === chosen.instance.assetId) && (
                  <option value={chosen.instance.assetId}>
                    {chosen.instance.label} ({chosen.instance.assetId})
                  </option>
                )}
                {broken.map((d) => (
                  <option key={d.instance.assetId} value={d.instance.assetId}>
                    {d.instance.label} ({d.instance.assetId})
                  </option>
                ))}
              </Select>
              {problem('assetId') && <p class={ERROR_TEXT}>{problem('assetId')!.message}</p>}
            </>
          )}
        </div>
      ) : (
        <>
          {/* Restock or something new. Picking from the catalog is what stops a second row
              called "Sabun cuci tangan" appearing when it is bought. */}
          <div class="mt-4">
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
          </div>

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
        </>
      )}

      {/* Required, and the only required field that is not needed to place an order. A request
          nobody can judge is one somebody has to chase the requester about — more work for two
          people than typing it cost one. */}
      <div class="mt-4">
        <label class={LABEL} for="req-reason">
          {repair ? 'Rusaknya bagaimana?' : 'Kenapa perlu dibeli?'}
        </label>
        <textarea
          id="req-reason"
          rows={3}
          class={`${FIELD} py-3 ${problem('reason') ? FIELD_ERROR : ''}`}
          value={reason}
          placeholder={repair
            ? 'Tali starter putus, businya juga mati. Mesinnya sendiri masih bagus.'
            : 'Gagang sapu yang lama patah, tinggal satu yang bisa dipakai.'}
          onInput={(e: Event) => setReason((e.target as HTMLTextAreaElement).value)}
        />
        {problem('reason') && <p class={ERROR_TEXT}>{problem('reason')!.message}</p>}
      </div>

      <div class="mt-4">
        <label class={LABEL} for="req-price">{priceLabel}</label>
        <div class="relative">
          <span class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">Rp</span>
          <input
            id="req-price"
            class={`${FIELD} min-h-touch pl-11 ${problem('price') ? FIELD_ERROR : ''}`}
            inputmode="numeric"
            value={price}
            placeholder={repair ? '185000' : '27500'}
            onInput={(e: Event) => setPrice((e.target as HTMLInputElement).value)}
          />
        </div>
        <p class="mt-1 text-xs text-slate-400">
          Boleh dikosongkan kalau belum tahu — nanti dihitung terpisah, tidak dianggap gratis.
        </p>
      </div>

      <div class="mt-4">
        <label class={LABEL} for="req-url">
          {repair ? 'Link bengkel / sparepart (opsional)' : 'Link toko (opsional)'}
        </label>
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
        {/* Not "Ajukan": that is the word on the button that opened this sheet, and two
            controls with one name is how somebody clicks the wrong one. */}
        <Button size="touch" onClick={submit}>Kirim pengajuan</Button>
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

/** A card-sized radio. Two options deserve to be readable at a glance, not folded into a select. */
function KindChoice(
  { active, icon: Icon, title, hint, onPick }:
  {
    active: boolean; icon: (p: { class?: string }) => unknown;
    title: string; hint: string; onPick: () => void;
  },
) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      class={`min-h-touch rounded-lg border p-3 text-left transition-colors ${active
        ? 'border-slate-900 bg-slate-900 text-white'
        : 'border-slate-400 bg-white text-slate-700 hover:border-slate-900'}`}
      onClick={onPick}
    >
      <Icon class={`h-5 w-5 ${active ? 'text-white' : 'text-slate-400'}`} />
      <p class="mt-1.5 text-sm font-bold">{title}</p>
      <p class={`text-xs leading-snug ${active ? 'text-white/70' : 'text-slate-500'}`}>{hint}</p>
    </button>
  );
}
