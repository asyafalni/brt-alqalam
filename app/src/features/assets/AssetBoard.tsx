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
import type { DerivedInstance, Item } from '../../../../domain/types';
import type { Draft } from '../../state/useDraft';
import type { Inventory } from '../../state/useInventory';
import { CARD, CARD_FLUSH, CODE, PageHeader, Stat } from '../../components/ui';
import { DataTable } from '../../components/DataTable';
import type { Column } from '../../components/DataTable';
import { instanceStatusBadge, PILL } from '../scan/resolve';
import { artFor, ItemArt } from '../items/ItemArt';

/**
 * Desktop column shaping, in the only place a caller can reach it: `DataTable` takes no
 * widths, and a `w-full` auto table spreads three columns evenly across a 1440px card, which
 * reads as three stripes of dead space. Shrinking the last column (always Status) to its pill
 * hands the slack to the text column beside it, where long text actually wants to go.
 * Literal class strings — an interpolated arbitrary variant generates no CSS.
 */
const TABLE_SHAPE =
  '[&_th:last-child]:w-px [&_td:last-child]:w-px [&_td:last-child]:whitespace-nowrap';

export function AssetBoard(
  { draft, inventory, search, onOpenItem }:
  { draft: Draft; inventory: Inventory; search: string; onOpenItem: (id: string) => void },
) {
  const all = useMemo(
    () => Object.values(inventory.derived.instances),
    [inventory.derived.instances],
  );
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
  const problems = groups.broken.length + groups.lost.length;

  if (all.length === 0) {
    return (
      <div class="space-y-4 pt-4 sm:pt-6">
        <PageHeader title="Aset" subtitle="Barang tetap yang dilabeli satu per satu." />
        <div class={`${CARD} px-6 py-16 text-center sm:py-20`}>
          <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
            <Package class="h-7 w-7 text-slate-400" />
          </div>
          <p class="mb-1.5 font-semibold text-slate-700">Belum ada barang berlabel.</p>
          <p class="mx-auto max-w-sm text-pretty text-sm leading-relaxed text-slate-500">
            Pilih “Label satu-satu” saat mencatat barang tetap, lalu tiap unitnya muncul di sini.
          </p>
        </div>
      </div>
    );
  }

  const section = {
    itemOf,
    draft,
    onOpenItem,
    noteFor,
  };

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
          value={problems}
          label="Rusak / hilang"
          tint={problems > 0 ? 'bg-orange-50 text-orange-600' : 'bg-slate-100 text-slate-400'}
        />
      </div>

      {/* Hilang is an exception to follow up, not a counter to watch — so it gets a banner
          rather than a row in a table someone scrolls past (§24). */}
      {groups.lost.length > 0 && (
        <div class={`${CARD} border-rose-200 bg-rose-50/40`} role="alert">
          <div class="flex items-start gap-3">
            <TriangleAlert class="mt-0.5 h-5 w-5 shrink-0 text-rose-700" />
            <div class="min-w-0">
              <p class="text-pretty font-bold text-slate-900">
                {groups.lost.length} aset hilang — perlu penggantian.
              </p>
              <p class="mt-0.5 text-pretty text-sm leading-relaxed text-slate-600">
                Sudah tidak dihitung sebagai milik kita. Catat untuk dibeli ulang.
              </p>
            </div>
          </div>
        </div>
      )}

      <Section
        {...section}
        title="Sedang dipinjam"
        subtitle="Ada, tapi tidak di tempat. Ini jawaban untuk “siapa yang pegang”."
        icon={Package}
        rows={groups.out}
        empty="Tidak ada yang sedang dipinjam."
        emptyHint="Semua unit berlabel ada di tempatnya."
        holderHeader="Dipegang"
        showHolder
      />

      <Section
        {...section}
        title="Perlu diperbaiki"
        subtitle="Masih milik kita, tapi tidak bisa dipakai. Perbaiki atau pensiunkan."
        icon={Wrench}
        rows={groups.broken}
        empty="Tidak ada yang rusak."
        emptyHint="Antrean perbaikan kosong."
        showNote
      />

      <Section
        {...section}
        title="Hilang"
        subtitle="Sudah tidak ada. Dicatat untuk pertanggungjawaban dan pembelian ulang."
        icon={TriangleAlert}
        rows={groups.lost}
        empty="Tidak ada yang hilang."
        emptyHint="Semua yang kita punya masih tercatat ada."
        holderHeader="Terakhir dipegang"
        showHolder
        showNote
      />
    </div>
  );
}

function Section(
  {
    title, subtitle, icon: Icon, rows, empty, emptyHint, itemOf, draft, onOpenItem,
    showHolder, showNote, holderHeader = 'Dipegang', noteFor,
  }: {
    title: string; subtitle: string; icon: (p: { class?: string }) => unknown;
    rows: DerivedInstance[]; empty: string; emptyHint: string;
    itemOf: (d: DerivedInstance) => Item | undefined;
    draft: Draft; onOpenItem: (id: string) => void;
    showHolder?: boolean; showNote?: boolean; holderHeader?: string;
    noteFor: (d: DerivedInstance) => string | undefined;
  },
) {
  const columns: Column<DerivedInstance>[] = [
    {
      key: 'unit',
      header: 'Unit',
      mobile: 'title',
      cell: (d) => {
        const item = itemOf(d);
        const art = artFor(
          item ?? { name: d.instance.label, unit: '', kind: 'equipment' },
          item ? draft.categories.find((c) => c.categoryId === item.categoryId)?.name ?? '' : '',
        );
        // The width floor is a desk-only concern: it stops the name column collapsing to its
        // text while the slack pools elsewhere. A phone has no slack to give.
        return (
          <div class="flex items-center gap-3 sm:min-w-[14rem]">
            <ItemArt art={art} size={32} />
            <div class="min-w-0">
              <p class="truncate text-sm font-bold text-slate-900">{d.instance.label}</p>
              <p class={`${CODE} truncate`}>{d.instance.assetId}</p>
            </div>
          </div>
        );
      },
    },
    ...(showHolder ? [{
      key: 'holder',
      header: holderHeader,
      mobile: 'meta' as const,
      cell: (d: DerivedInstance) => (
        <span class="block max-w-[16rem] truncate text-sm text-slate-600">{d.holder ?? '—'}</span>
      ),
    }] : []),
    ...(showNote ? [{
      key: 'note',
      header: 'Catatan',
      mobile: 'meta' as const,
      cell: (d: DerivedInstance) => (
        <span class="block max-w-prose text-pretty text-sm leading-snug text-slate-500">
          {noteFor(d) ?? '—'}
        </span>
      ),
    }] : []),
    {
      key: 'status',
      header: 'Status',
      mobile: 'trailing',
      align: 'right',
      cell: (d) => {
        const badge = instanceStatusBadge(d.status);
        return <span class={`${PILL} ${badge.chip}`}>{badge.label}</span>;
      },
    },
  ];

  return (
    <section class={CARD_FLUSH}>
      <div class="flex items-start gap-3 border-b border-slate-100 bg-slate-50/50 px-4 py-3.5 sm:px-6">
        <Icon class="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <div class="min-w-0 flex-1">
          {/* The count belongs on the heading's line: hung off the card's full height it
              floated against nothing, next to a two-line header. */}
          <div class="flex items-center gap-2">
            <h2 class="truncate text-sm font-bold text-slate-900">{title}</h2>
            <span class="shrink-0 rounded-full bg-slate-200/70 px-2 py-0.5 text-[10px] font-bold tabular-nums text-slate-600">
              {rows.length}
            </span>
          </div>
          <p class="mt-0.5 text-pretty text-xs leading-relaxed text-slate-500">{subtitle}</p>
        </div>
      </div>

      <div class={TABLE_SHAPE}>
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(d) => d.instance.assetId}
          rowLabel={(d) => `Buka ${d.instance.label}`}
          onRowClick={(d) => {
            const item = itemOf(d);
            if (item) onOpenItem(item.itemId);
          }}
          empty={(
            <div class="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <div class="flex h-10 w-10 items-center justify-center rounded-full bg-green-50">
                <CircleCheck class="h-5 w-5 text-green-600" />
              </div>
              <p class="text-sm font-semibold text-slate-600">{empty}</p>
              <p class="max-w-xs text-pretty text-xs leading-relaxed text-slate-400">{emptyHint}</p>
            </div>
          )}
        />
      </div>
    </section>
  );
}
