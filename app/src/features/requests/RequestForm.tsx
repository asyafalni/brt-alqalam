// Ajukan — one form for the two things anybody asks money for.
//
// **Beli** something we do not have; **perbaiki** something we do. They are one screen because
// they are one act from the takmir's side — somebody is asking for a decision about spending —
// and because the alternative is two forms whose first question is which form you should have
// opened. What changes between them is small and honest: a purchase asks how many and in what
// unit, a repair asks which unit is broken. The rest — why, how much, where — is shared.
//
// The photo is IN this form, not bolted on afterwards. It is one of the four fields the boss
// named, and the moment somebody is describing a request is the moment they have the screenshot
// of the listing or the photo of the crack in hand. Making them save, find the row and open a
// panel to attach it was three steps to avoid one cleanup call on cancel.

import { useMemo, useState } from 'octane';
import { ShoppingCart, Wrench } from '@octanejs/lucide';
import { validateRequest } from '../../../../domain/requests';
import type { RequestProblem, RequestType } from '../../../../domain/requests';
import type { DerivedInstance, Item } from '../../../../domain/types';
import { Button, CODE, ERROR_TEXT, FIELD, FIELD_ERROR, LABEL, Select } from '../../components/ui';
import { artFor, ItemArt } from '../items/ItemArt';
import { RequestPhotos } from './RequestPhotos';

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

/**
 * The reason a replacement is being bought, written out from what the register already knows.
 *
 * Auto-filling a required field is normally a smell — the whole point of requiring the reason
 * is that somebody thought about it. This is the exception, and narrowly: the loss is already
 * recorded, with its own note, by the person who reported it. Making somebody retype "hilang
 * setelah qurban" because the form cannot read two fields across is not asking them to think,
 * it is asking them to transcribe. It stays editable, so anybody with more to say still can.
 */
export function replacementReason(d: DerivedInstance, note?: string): string {
  const why = d.status === 'lost' ? 'hilang' : 'rusak';
  const head = `Pengganti ${d.instance.label} yang ${why}.`;
  return note && note.trim() !== '' ? `${head} ${note.trim()}` : head;
}

export function RequestForm(
  { items, instances, onSubmit, onCancel, prefill, requestId }:
  {
    items: Item[];
    instances: DerivedInstance[];
    onSubmit: (input: RequestInput) => void;
    onCancel: () => void;
    /**
     * The id this request WILL have. Minted before the form opens so photos have somewhere to
     * go; released by the caller if the form is abandoned.
     */
    requestId: string;
    /**
     * Set when the form was opened from a broken or lost unit rather than from the button.
     * `note` is what the person who reported the loss wrote at the time.
     */
    prefill?: { type: RequestType; assetId: string; note?: string };
  },
) {
  /* Everything a replacement needs is already recorded: which unit, which catalog row it
     belongs to, what it is called, what unit it counts in, and why it is gone. Resolved
     before the first render so it becomes the form's INITIAL state — filled in afterwards it
     would fight anything already typed. */
  const from = prefill && instances.find((d) => d.instance.assetId === prefill.assetId);
  const fromItem = from && items.find((i) => i.itemId === from.instance.itemId);
  const replacing = prefill?.type === 'beli' ? from : undefined;

  const [type, setType] = useState<RequestType>(prefill?.type ?? 'beli');
  const [assetId, setAssetId] = useState(prefill?.assetId ?? '');
  /* A replacement knife is the same catalog row, so it starts as a RESTOCK of it. A second
     row called "Pisau potong" is exactly the mess §0 says the register exists to clear up —
     and "Barang baru" is still one tap away for a different model. */
  const [itemId, setItemId] = useState(replacing && fromItem ? fromItem.itemId : NEW_THING);
  const [name, setName] = useState(replacing && fromItem ? fromItem.name : '');
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState(replacing && fromItem ? fromItem.unit : 'buah');
  const [reason, setReason] = useState(
    replacing ? replacementReason(replacing, prefill?.note) : '',
  );
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
          {/* What this stands in for, stated rather than hidden in a URL parameter. Without it
              the link is invisible: the form would look like an ordinary purchase that had
              mysteriously filled itself in. */}
          {chosen && (
            <div class="mt-4 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50/50 p-3">
              <ItemArt
                art={artFor(
                  chosenItem ?? { name: chosen.instance.label, unit: '', kind: 'equipment' },
                  '',
                )}
                size={32}
              />
              <div class="min-w-0 flex-1">
                <p class="text-sm font-bold text-slate-900">
                  Pengganti {chosen.instance.label}
                </p>
                <p class={CODE}>{chosen.instance.assetId}</p>
              </div>
              {/* Droppable, because somebody may open this from a lost knife and end up asking
                  for something unrelated. A link that cannot be undone gets worked around by
                  starting over, and the loss stays unclosed. */}
              <button
                type="button"
                class="shrink-0 text-xs font-semibold text-slate-500 underline"
                onClick={() => setAssetId('')}
              >
                Bukan pengganti
              </button>
            </div>
          )}

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

      <div class="mt-4">
        <span class={LABEL}>Foto (opsional)</span>
        <RequestPhotos requestId={requestId} name={effectiveName || 'pengajuan ini'} />
      </div>

      <div class="mt-5 flex flex-wrap items-center gap-3">
        {/* Not "Ajukan": that is the word on the button that opened this sheet, and two
            controls with one name is how somebody clicks the wrong one. */}
        <Button size="touch" onClick={submit}>Kirim pengajuan</Button>
        <button type="button" class="font-semibold text-slate-500 underline" onClick={onCancel}>
          Batal
        </button>
      </div>
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
