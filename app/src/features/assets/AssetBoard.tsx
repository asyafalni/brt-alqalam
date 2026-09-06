// Aset — the three questions a durable can raise, each with a different answer.
//
// Design doc §24 asks for exactly this split, and it is the reason rusak and hilang were never
// allowed to share a colour (Part IV):
//
//   Dipinjam — it exists, someone has it. The question is WHO, and it is answerable.
//   Rusak    — it exists, we have it, it does not work. This is a WORKLIST: repair or retire.
//   Hilang   — it does not exist any more. This is a LOSS LOG: an accountability record and a
//              shopping list, not a live stock figure to watch.
//
// Lumping them into one "problem" bucket would hide that they demand different actions.

import { useMemo } from 'octane';
import { CircleCheck, Package, TriangleAlert, Wrench } from '@octanejs/lucide';
import type { DerivedInstance } from '../../../../domain/types';
import type { Draft } from '../../state/useDraft';
import type { Inventory } from '../../state/useInventory';
import { CARD, CARD_FLUSH, CODE, PageHeader, Stat, TD, TH } from '../../components/ui';
import { instanceStatusBadge, PILL } from '../scan/resolve';
import { itemIcon } from '../items/itemIcon';

export function AssetBoard(
  { draft, inventory, search, onOpenItem }:
  { draft: Draft; inventory: Inventory; search: string; onOpenItem: (id: string) => void },
) {
  const all = Object.values(inventory.derived.instances);
  const itemOf = (i: DerivedInstance) => draft.items.find((x) => x.itemId === i.instance.itemId);

  const q = search.trim().toLowerCase();
  const matches = (d: DerivedInstance) =>
    q === '' || `${d.instance.label} ${d.instance.assetId} ${d.holder ?? ''}`.toLowerCase().includes(q);

  // The reducer keeps status and holder, not the note that came with them, so the last
  // transaction touching each asset is read back for the "why".
  const noteFor = (d: DerivedInstance) => {
    for (let i = inventory.txns.length - 1; i >= 0; i -= 1) {
      const t = inventory.txns[i];
      if (t.assetId === d.instance.assetId && t.note) return t.note;
    }
    return undefined;
  };

  const groups = useMemo(() => ({
    out: all.filter((d) => d.status === 'out' && matches(d)),
    broken: all.filter((d) => d.status === 'broken' && matches(d)),
    lost: all.filter((d) => d.status === 'lost' && matches(d)),
  }), [all, q]);

  // The whole point of separating hilang: it leaves the active base entirely.
  const activeBase = all.filter((d) => d.status !== 'lost' && d.status !== 'retired').length;

  if (all.length === 0) {
    return (
      <div class="space-y-4 pt-4 sm:pt-6">
        <PageHeader title="Aset" subtitle="Barang tetap yang dilabeli satu per satu." />
        <div class={`${CARD} py-20 text-center`}>
          <Package class="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p class="mb-1 font-semibold text-slate-700">Belum ada barang berlabel.</p>
          <p class="mx-auto max-w-md text-sm italic text-slate-400">
            Pilih "Label satu-satu" saat mencatat barang tetap, lalu tiap unitnya muncul di sini.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div class="space-y-4 pb-8 pt-4 sm:space-y-6 sm:pt-6">
      <PageHeader
        title="Aset"
        subtitle="Barang tetap yang dilabeli satu per satu — siapa pegang, mana yang rusak, mana yang hilang."
      />

      <div class="grid grid-cols-3 gap-2 sm:gap-4">
        <Stat value={activeBase} label="Masih dimiliki" />
        <Stat value={groups.out.length} label="Dipinjam" tint="bg-sky-50 text-sky-600" />
        <Stat
          value={groups.broken.length + groups.lost.length}
          label="Rusak / hilang"
          tint={groups.broken.length + groups.lost.length > 0 ? 'bg-orange-50 text-orange-600' : 'bg-slate-100 text-slate-400'}
        />
      </div>

      {/* Hilang is an exception to follow up, not a counter to watch — so it gets a banner
          rather than a row in a table someone scrolls past (§24). */}
      {groups.lost.length > 0 && (
        <div class={`${CARD} border-rose-200 bg-rose-50/40`} role="alert">
          <div class="flex items-start gap-3">
            <TriangleAlert class="mt-0.5 h-5 w-5 shrink-0 text-rose-700" />
            <div>
              <p class="font-bold text-slate-900">
                {groups.lost.length} aset hilang — perlu penggantian.
              </p>
              <p class="text-sm text-slate-600">
                Sudah tidak dihitung sebagai milik kita. Catat untuk dibeli ulang.
              </p>
            </div>
          </div>
        </div>
      )}

      <Section
        title="Sedang dipinjam"
        subtitle="Ada, tapi tidak di tempat. Ini jawaban untuk “siapa yang pegang”."
        icon={Package}
        rows={groups.out}
        empty="Tidak ada yang sedang dipinjam."
        itemOf={itemOf}
        draft={draft}
        onOpenItem={onOpenItem}
        noteFor={noteFor}
        showHolder
      />

      <Section
        title="Perlu diperbaiki"
        subtitle="Masih milik kita, tapi tidak bisa dipakai. Perbaiki atau pensiunkan."
        icon={Wrench}
        rows={groups.broken}
        empty="Tidak ada yang rusak."
        itemOf={itemOf}
        draft={draft}
        onOpenItem={onOpenItem}
        noteFor={noteFor}
        showNote
      />

      <Section
        title="Hilang"
        subtitle="Sudah tidak ada. Dicatat untuk pertanggungjawaban dan pembelian ulang."
        icon={TriangleAlert}
        rows={groups.lost}
        empty="Tidak ada yang hilang."
        itemOf={itemOf}
        draft={draft}
        onOpenItem={onOpenItem}
        noteFor={noteFor}
        showHolder
        showNote
      />
    </div>
  );
}

function Section(
  { title, subtitle, icon: Icon, rows, empty, itemOf, draft, onOpenItem, showHolder, showNote, noteFor }: {
    title: string; subtitle: string; icon: (p: { class?: string }) => unknown;
    rows: DerivedInstance[]; empty: string;
    itemOf: (d: DerivedInstance) => { itemId: string; name: string; unit: string; kind: 'consumable' | 'equipment'; categoryId: string } | undefined;
    draft: Draft; onOpenItem: (id: string) => void; showHolder?: boolean; showNote?: boolean;
    noteFor: (d: DerivedInstance) => string | undefined;
  },
) {
  return (
    <section class={CARD_FLUSH}>
      <div class="flex items-center gap-3 border-b border-slate-100 bg-slate-50/50 p-4">
        <Icon class="h-4 w-4 text-slate-400" />
        <div class="min-w-0">
          <h2 class="text-sm font-bold text-slate-900">{title}</h2>
          <p class="text-xs text-slate-500">{subtitle}</p>
        </div>
        <span class="ml-auto shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {rows.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <p class="flex items-center justify-center gap-2 px-6 py-8 text-sm italic text-slate-400">
          <CircleCheck class="h-4 w-4 text-green-500" /> {empty}
        </p>
      ) : (
        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <thead class="border-b border-slate-100 bg-slate-50">
              <tr>
                <th class={TH}>Unit</th>
                {showHolder && <th class={TH}>Terakhir dipegang</th>}
                <th class={TH}>Status</th>
                {showNote && <th class={TH}>Catatan</th>}
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              {rows.map((d) => {
                const item = itemOf(d);
                const badge = instanceStatusBadge(d.status);
                const Ic = item
                  ? itemIcon(item, draft.categories.find((c) => c.categoryId === item.categoryId)?.name ?? '')
                  : Package;
                return (
                  <tr
                    key={d.instance.assetId}
                    class="cursor-pointer transition-colors hover:bg-slate-50"
                    role="link"
                    tabindex={0}
                    aria-label={`Buka ${d.instance.label}`}
                    onClick={() => item && onOpenItem(item.itemId)}
                    onKeyDown={(e: KeyboardEvent) => {
                      if ((e.key === 'Enter' || e.key === ' ') && item) { e.preventDefault(); onOpenItem(item.itemId); }
                    }}
                  >
                    <td class={TD}>
                      <div class="flex items-center gap-3">
                        <Ic class="h-5 w-5 shrink-0 text-slate-400" />
                        <div class="min-w-0">
                          <p class="truncate text-sm font-bold text-slate-900">{d.instance.label}</p>
                          <p class={CODE}>{d.instance.assetId}</p>
                        </div>
                      </div>
                    </td>
                    {showHolder && (
                      <td class={`${TD} text-sm text-slate-600`}>{d.holder ?? '—'}</td>
                    )}
                    <td class={TD}><span class={`${PILL} ${badge.chip}`}>{badge.label}</span></td>
                    {showNote && (
                      <td class={`${TD} text-sm text-slate-500`}>{noteFor(d) ?? '—'}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}


