// Aset — the three questions a durable can raise, each with a different answer.
//
// WHAT IS ON THIS SCREEN, precisely: barang tetap that are labelled ONE BY ONE. Not every
// barang tetap is. `kind` says whether a thing gets used up; `trackBy` says whether we label
// each unit, and they are separate on purpose (Part XI) — labelling 200 blades is an
// operational project, so a durable can be counted instead. A counted durable has no
// individual units to have a status, so it cannot appear here, and the note below says so
// rather than leaving somebody to wonder where their terpal went.
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

import { useMemo, useState } from 'octane';
import { ArrowDownLeft, CircleCheck, Eye, Package, ShoppingCart, TriangleAlert, Wrench } from '@octanejs/lucide';
import { FilterField } from '../../components/FilterField';
import { loanAge, loansByAge } from '../../../../domain/loans';
import type { LoanLevel } from '../../../../domain/loans';
import type { RequestType } from '../../../../domain/requests';
import type { LoanTarget } from '../movement/LoanSheet';
import type { InspectTarget } from '../movement/InspectSheet';
import { inspection, lastInspected } from '../../../../domain/inspect';
import type { Inspection } from '../../../../domain/inspect';
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
 * reads as three stripes of dead space. Shrinking the trailing columns — a status pill, and
 * where there is one, a button — hands the slack to the text column beside them, where long
 * text actually wants to go.
 *
 * Two variants rather than one, because the rule has to reach one column further when a
 * section offers an action: applied blindly, the wider rule would squeeze "Dipegang" on the
 * loans table, which is the one column there that genuinely wants room.
 *
 * Literal class strings — an interpolated arbitrary variant generates no CSS.
 */
const TABLE_SHAPE =
  '[&_th:last-child]:w-px [&_td:last-child]:w-px [&_td:last-child]:whitespace-nowrap';
const TABLE_SHAPE_ACTION =
  `${TABLE_SHAPE} [&_th:nth-last-child(2)]:w-px [&_td:nth-last-child(2)]:w-px [&_td:nth-last-child(2)]:whitespace-nowrap`;

export function AssetBoard(
  { draft, inventory, now, onOpenItem, onRequest, onOpenCounted, onLoan, onInspect }:
  {
    draft: Draft; inventory: Inventory; now: number; onOpenItem: (id: string) => void;
    /** To the stock list, narrowed to barang tetap — where the counted ones actually live. */
    onOpenCounted: () => void;
    /** Closes a loan. Absent on a device that may only read. */
    onLoan?: (target: LoanTarget) => void;
    /** Records that a unit was looked at. Absent on a device that may only read. */
    onInspect?: (target: InspectTarget) => void;
    /**
     * The bridge from "this is broken" to somebody doing something about it.
     *
     * Both lists below were, until now, read-only: they said a thing was broken or gone and
     * left the reader to remember it somewhere else. The repair queue and the loss log are
     * only worth keeping if there is a next step attached to each row, and the next step is
     * always the same one — ask for money, to fix it or to replace it.
     */
    onRequest: (type: RequestType, assetId: string) => void;
  },
) {
  const all = useMemo(
    () => Object.values(inventory.derived.instances),
    [inventory.derived.instances],
  );
  const itemOf = (i: DerivedInstance) => draft.items.find((x) => x.itemId === i.instance.itemId);

  /* This screen's own — see components/FilterField for why it is not the navbar's box. */
  const [search, setSearch] = useState('');
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

  /** Durables we deliberately do not label per unit — real, owned, and not on this screen. */
  const counted = useMemo(
    () => draft.items.filter((i) => i.kind === 'equipment' && i.trackBy === 'quantity').length,
    [draft.items],
  );

  /*
   * Units sitting in the gudang whose condition nobody has confirmed for six months, or ever.
   *
   * Only AVAILABLE ones: a broken unit's condition is known and already in a queue, and a
   * borrowed one is not here to look at. Oldest first, and never-checked ahead of everything —
   * that unit's readiness is an assumption made on the day it was counted and never revisited.
   */
  const checks = useMemo(() => lastInspected(inventory.txns), [inventory.txns]);
  const stale = useMemo(() => all
      .filter((d) => d.status === 'available' && matches(d))
      .map((d) => ({ d, seen: inspection(checks.get(d.instance.assetId), now) }))
      .filter((r) => r.seen.level !== 'baru')
      .sort((a, b) => (b.seen.days ?? Infinity) - (a.seen.days ?? Infinity)),
  [all, q, checks, now]);

  const groups = useMemo(() => ({
    /* OLDEST FIRST. A unit borrowed three days ago and one borrowed since last Qurban looked
       identical here, so nothing ever escalated on its own — a loan quietly became a loss and
       the only way to notice was to already suspect it. */
    out: loansByAge(all.filter(matches), now).map((l) => l.instance),
    broken: all.filter((d) => d.status === 'broken' && matches(d)),
    lost: all.filter((d) => d.status === 'lost' && matches(d)),
  }), [all, q, now]);

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
    onRequest,
    noteFor,
  };

  return (
    <div class="space-y-4 pb-8 pt-4 sm:space-y-6 sm:pt-6">
      <PageHeader
        title="Aset"
        subtitle="Barang tetap yang dilabeli satu per satu — siapa pegang, mana yang rusak, mana yang hilang."
        action={(
          <FilterField
            value={search}
            onChange={setSearch}
            label="Saring daftar aset"
            placeholder="Saring aset…"
          />
        )}
      />

      {/* The answer to "kenapa terpal saya tidak ada di sini?", stated where the question is
          asked. Only shown when there is something to explain. */}
      {counted > 0 && (
        <p class="text-sm leading-relaxed text-slate-600">
          {counted} barang tetap lainnya dicatat dengan cara{' '}
          <span class="font-semibold text-slate-700">hitung jumlahnya</span>, bukan dilabeli satu
          per satu, jadi tidak punya status per unit dan tidak muncul di sini.{' '}
          <button
            type="button"
            class="font-semibold text-slate-700 underline hover:text-slate-900"
            onClick={onOpenCounted}
          >
            Lihat di Stok
          </button>
        </p>
      )}

      {/* Two across on a phone rather than four squeezed into one row — a fourth tile at 90px
          wraps its label onto three lines. */}
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4">
        <Stat value={activeBase} label="Masih dimiliki" />
        <Stat value={groups.out.length} label="Dipinjam" tint="bg-sky-50 text-sky-700" />
        <Stat
          value={problems}
          label="Rusak / hilang"
          tint={problems > 0 ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-600'}
        />
        {/* The fourth number on this screen, and the only one nobody would go looking for:
            broken and lost are reported by a person, while a unit whose condition has not been
            confirmed for six months is reported by nobody. */}
        <Stat
          value={stale.length}
          label="Perlu diperiksa"
          tint={stale.length > 0 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}
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
                Sudah tidak dihitung sebagai milik kita. Ajukan penggantinya lewat tombol di
                tiap baris supaya tercatat, bukan hanya diingat.
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
        showAge
        now={now}
        onResolve={onLoan && draft.canRecord !== false
          ? (d) => onLoan({
            assetId: d.instance.assetId,
            label: d.instance.label,
            item: itemOf(d)!,
            status: d.status,
            holder: d.holder,
          })
          : undefined}
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
        action={{ type: 'perbaikan', label: 'Ajukan perbaikan', short: 'Perbaiki', icon: Wrench }}
      />

      <Section
        {...section}
        title="Hilang"
        subtitle="Sudah tidak ada. Dicatat untuk pertanggungjawaban dan pembelian ulang — dan kalau ternyata ketemu, dikembalikan dari sini."
        icon={TriangleAlert}
        rows={groups.lost}
        /* §23 always had `lost ──ditemukan──► available` and §24 asked for this by name. The
           log shipped able only to buy a replacement, so a thing that turned up had nowhere to
           be recorded and the register went on calling it gone. */
        inspectLabel="Ditemukan"
        onInspectRow={onInspect && draft.canRecord !== false
          ? (d) => onInspect({
            assetId: d.instance.assetId,
            label: d.instance.label,
            item: itemOf(d)!,
            status: d.status,
            lastTs: inspection(checks.get(d.instance.assetId), now).ts,
          })
          : undefined}
        empty="Tidak ada yang hilang."
        emptyHint="Semua yang kita punya masih tercatat ada."
        holderHeader="Terakhir dipegang"
        showHolder
        showNote
        action={{ type: 'beli', label: 'Ajukan pembelian pengganti', short: 'Beli pengganti', icon: ShoppingCart }}
      />

      {/* LAST, and quiet. The three lists above are exceptions somebody has reported; this one
          is a rotation nobody has got to yet — background work, not an agenda.

          A `Section` like the others rather than the hand-rolled list it started as: that
          version capped at six with "dan 31 unit lain", which named the problem and then
          refused to show it. Paging is what the neighbours already do, and it brings the item
          drawing and the row shape with it. */}
      {onInspect && draft.canRecord !== false && stale.length > 0 && (
        <Section
          {...section}
          title="Perlu diperiksa"
          subtitle="“Siap pakai” itu pernyataan tentang kondisi, dan ini yang belum ada yang memastikannya. Barang yang cuma dipakai setahun sekali paling sering ketahuan rusaknya pas hari H."
          icon={Eye}
          rows={stale.map((r) => r.d)}
          empty="Semua unit sudah diperiksa."
          emptyHint="Tidak ada yang menunggu dilihat."
          showStatus={false}
          checkedOf={(d) => inspection(checks.get(d.instance.assetId), now)}
          onInspectRow={(d) => onInspect({
            assetId: d.instance.assetId,
            label: d.instance.label,
            item: itemOf(d)!,
            status: d.status,
            lastTs: inspection(checks.get(d.instance.assetId), now).ts,
          })}
        />
      )}
    </div>
  );
}

/*
 * A TIME ramp, kept off the status palette on purpose.
 *
 * Status already owns colour here — sky for dipinjam, orange for rusak, rose for hilang (§66) —
 * and overdue-ness is a different axis: a thing can be borrowed and fine, or borrowed and long
 * overdue, and both are "dipinjam". The badge carries a NUMBER OF DAYS rather than a word, so
 * it cannot be misread as a fourth status.
 */
const AGE_TINT: Record<LoanLevel, string> = {
  baru: 'bg-slate-100 text-slate-600',
  ditanya: 'bg-amber-50 text-amber-700 border border-amber-200',
  lama: 'bg-orange-50 text-orange-700 border border-orange-200',
  'mungkin-hilang': 'bg-red-50 text-red-700 border border-red-200',
};

function Section(
  {
    title, subtitle, icon: Icon, rows, empty, emptyHint, itemOf, draft, onOpenItem,
    showHolder, showNote, showAge, now = 0, holderHeader = 'Dipegang', noteFor, onRequest,
    onResolve, checkedOf, onInspectRow, inspectLabel = 'Periksa', showStatus = true,
    action,
  }: {
    title: string; subtitle: string; icon: (p: { class?: string }) => unknown;
    rows: DerivedInstance[]; empty: string; emptyHint: string;
    itemOf: (d: DerivedInstance) => Item | undefined;
    draft: Draft; onOpenItem: (id: string) => void;
    showHolder?: boolean; showNote?: boolean; holderHeader?: string;
    /** Adds "sejak berapa lama", which is the difference between a loan and a loss. */
    showAge?: boolean; now?: number;
    /** Adds "terakhir diperiksa", and with it the button that answers it. */
    checkedOf?: (d: DerivedInstance) => Inspection;
    onInspectRow?: (d: DerivedInstance) => void;
    /** What that button says. A lost unit turning up is the same sheet with a different verb. */
    inspectLabel?: string;
    /**
     * Off where every row says the same word.
     *
     * The three lists above each hold ONE status, but they are read next to each other and the
     * pill is what tells them apart at a glance. "Perlu diperiksa" is not one of those: it is
     * every available unit nobody has looked at, so a column of identical TERSEDIA pills is a
     * column that only takes width from the two facts that differ.
     */
    showStatus?: boolean;
    noteFor: (d: DerivedInstance) => string | undefined;
    onRequest: (type: RequestType, assetId: string) => void;
    /**
     * Closes a loan: back, back broken, or gone.
     *
     * "Dipinjam" used to offer nothing, on the grounds that it "resolves by being returned" —
     * which was true of the model and false of the app, because nothing could record the
     * return either (§60). A list that can only ever grow is not a list of open loans, it is a
     * list of things we have given up on.
     */
    onResolve?: (d: DerivedInstance) => void;
    /** The next step for the OTHER lists, which file a request rather than record a movement. */
    action?: {
      type: RequestType; label: string; short: string;
      icon: (p: { class?: string }) => unknown;
    };
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
    ...(showAge ? [{
      key: 'age',
      header: 'Sejak',
      mobile: 'meta' as const,
      cell: (d: DerivedInstance) => {
        const age = loanAge(d.since, now);
        return (
          <span class={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${AGE_TINT[age.level]}`}>
            {age.days === 0 ? 'hari ini' : `${age.days} hari`}
          </span>
        );
      },
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
    ...(showStatus ? [{
      key: 'status',
      header: 'Status',
      mobile: 'trailing' as const,
      align: 'right' as const,
      cell: (d: DerivedInstance) => {
        const badge = instanceStatusBadge(d.status);
        return <span class={`${PILL} ${badge.chip}`}>{badge.label}</span>;
      },
    }] : []),
    ...(checkedOf ? [{
      key: 'checked',
      header: 'Terakhir diperiksa',
      mobile: 'meta' as const,
      cell: (d: DerivedInstance) => {
        const seen = checkedOf(d);
        return (
          <span class="whitespace-nowrap text-sm text-slate-600">
            {seen.level === 'belum-pernah' ? 'belum pernah' : `${seen.days} hari lalu`}
          </span>
        );
      },
    }] : []),
    ...(onInspectRow ? [{
      key: 'inspect',
      header: '',
      mobile: 'meta' as const,
      align: 'right' as const,
      cell: (d: DerivedInstance) => (
        <button
          type="button"
          class="inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-400 px-3 text-sm font-semibold text-slate-700 hover:border-slate-900 hover:bg-slate-100"
          aria-label={`${inspectLabel} ${d.instance.label}`}
          onClick={(e: MouseEvent) => { e.stopPropagation(); onInspectRow(d); }}
        >
          <Eye class="h-4 w-4" /> {inspectLabel}
        </button>
      ),
    }] : []),
    ...(onResolve ? [{
      key: 'resolve',
      header: '',
      mobile: 'meta' as const,
      align: 'right' as const,
      cell: (d: DerivedInstance) => (
        <button
          type="button"
          class="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-400 px-3 text-sm font-semibold text-slate-700 hover:border-slate-900 hover:bg-slate-100"
          aria-label={`Selesaikan pinjaman: ${d.instance.label}`}
          onClick={(e: MouseEvent) => { e.stopPropagation(); onResolve(d); }}
        >
          <ArrowDownLeft class="h-4 w-4" /> Selesaikan
        </button>
      ),
    }] : []),
    ...(action ? [{
      key: 'action',
      // Deliberately headerless: a column of buttons needs no word above it, and "Aksi" would
      // be the widest thing in the narrowest column.
      header: '',
      mobile: 'meta' as const,
      align: 'right' as const,
      cell: (d: DerivedInstance) => {
        const ActionIcon = action.icon;
        return (
          <button
            type="button"
            class="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-400 px-3 text-sm font-semibold text-slate-700 hover:border-slate-900 hover:bg-slate-100"
            aria-label={`${action.label}: ${d.instance.label}`}
            /* The row itself opens the item, so this must not also do that. */
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              onRequest(action.type, d.instance.assetId);
            }}
          >
            <ActionIcon class="h-4 w-4" /> {action.short}
          </button>
        );
      },
    }] : []),
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

      <div class={action ? TABLE_SHAPE_ACTION : TABLE_SHAPE}>
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
              <p class="max-w-xs text-pretty text-xs leading-relaxed text-slate-500">{emptyHint}</p>
            </div>
          )}
        />
      </div>
    </section>
  );
}
