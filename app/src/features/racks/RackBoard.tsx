// The rack board — a map of the room, not a list of things.
//
// Answers the question a messy gudang actually poses. "We own 12 galon sabun" does not help a
// marbot who cannot find them; "Rak B3, and it is nearly empty" does. Each cell is one rack,
// coloured by the worst status on it, because that is what earns a walk.
//
// Layout follows the Arche reference the owner shared: dense labelled cells grouped into
// captioned blocks per zone, with one hot accent reserved for selection — not for status,
// since orange already means `rusak`.

import { useEffect, useMemo, useState } from 'octane';
import {
  Archive, Boxes, ClipboardCheck, MapPin, Package, Pencil, Plus, RotateCcw, Trash2,
} from '@octanejs/lucide';
import { groupByZone, rollupLocations, racksNeedingAttention, UNASSIGNED } from '../../../../domain/locations';
import type { LocationSummary, LocationStatus } from '../../../../domain/locations';
import { countState } from '../../../../domain/cycleCount';
import { contentsOf } from '../../../../domain/stock';
import type { MovementTarget } from '../movement/MovementSheet';
import type { Category, Item, Location } from '../../../../domain/types';
import type { Draft } from '../../state/useDraft';
import type { Inventory } from '../../state/useInventory';
import { Button, CARD, CODE, FIELD, LABEL, PageHeader, Select, Stat } from '../../components/ui';
import {
  applyCount, archiveLocation, blocksArchive, blocksDelete, createLocation, deleteLocation,
  editLocation, markCounted, racksInZone, renameZone, restoreLocation, zonesOf,
} from '../stocktake/draft';
import type { LocationEdit, RemovalBlock } from '../stocktake/draft';
import { itemStatusBadge, PILL } from '../scan/resolve';
import { artFor, ItemArt } from '../items/ItemArt';
import { RACK_ART_IDS, RACK_ART_LABEL, RackArt, rackArtFor } from './RackArt';
import { CountSheet } from './CountSheet';
import { Sheet } from '../../components/Sheet';
import { RackContents } from './RackContents';

/** Cell skins. Literal class strings — Tailwind never sees an interpolated one. */
/*
 * Cell skins. Literal class strings — Tailwind never sees an interpolated one.
 *
 * The BORDERS carry the status and are also the tile's only boundary: measured, the fill is
 * 1.35:1 against the page, so nothing else says where the control is. At `-200` the tinted
 * borders came in at 1.24 and 1.45 against the ground, well under the 3:1 WCAG 1.4.11 asks of a
 * control's edge — a rack whose colour is the whole point was the hardest one to see.
 *
 * Darkened to `-500`, which clears 3:1 while staying recognisably the same red and amber. The
 * fills stay pale, so the tile still reads as tinted rather than as a warning banner.
 */
const CELL: Record<LocationStatus, string> = {
  out: 'bg-red-50 border-red-500 text-red-800 hover:border-red-700',
  low: 'bg-amber-50 border-amber-500 text-amber-800 hover:border-amber-700',
  available: 'bg-white border-slate-500 text-slate-700 hover:border-slate-900',
  empty: 'bg-slate-50 border-dashed border-slate-500 text-slate-600 hover:border-slate-900',
};

const ZONE_NOTE: Record<LocationStatus, string> = {
  out: 'Ada yang habis',
  low: 'Ada yang menipis',
  available: 'Aman',
  empty: 'Kosong',
};

export function RackBoard(
  { draft, inventory, search, now, openRack, onOpenItem, onMove }:
  { draft: Draft; inventory: Inventory; search: string; now: number; openRack?: string;
    onOpenItem: (id: string) => void;
    /** Standing at the shelf is the best moment to record taking something off it. */
    onMove: (target: MovementTarget) => void },
) {
  const { items, categories, locations, setLocations } = draft;
  // Seeded from the route so a rack link on the stock list lands with the panel already open.
  const [selected, setSelected] = useState<string | null>(openRack ?? null);
  useEffect(() => { if (openRack) setSelected(openRack); }, [openRack]);
  const [counting, setCounting] = useState<string | null>(null);
  /** `'new'` while adding; a locationId while editing that rack. One form, two jobs. */
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  /** Which rack's membership is being edited — what is kept here, not how much of it. */
  const [arranging, setArranging] = useState<string | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [renamingZone, setRenamingZone] = useState<string | null>(null);
  /** Which zone a new rack should start in, when it was opened from a zone rather than the header. */
  const [newRackZone, setNewRackZone] = useState<string | null>(null);

  /** Everything the panel holds is per-rack, so closing it clears all of it. */
  const closePanel = () => {
    setSelected(null);
    setCounting(null);
    setEditing(null);
    setConfirmRemove(null);
  };

  const addRack = (edit: LocationEdit) => {
    setLocations((prev) => [...prev, createLocation(edit.code, edit.zone, edit.name, prev)]);
    setEditing(null);
  };
  const saveRack = (locationId: string, edit: LocationEdit) => {
    setLocations((prev) => editLocation(prev, locationId, edit));
    setEditing(null);
  };

  const racks = useMemo(
    () => rollupLocations(locations, items, inventory.derived),
    [locations, items, inventory.derived],
  );
  const zones = useMemo(() => groupByZone(racks), [racks]);
  /** Just the names, for the picker — `zones` above is the grouped board. */
  const zoneNames = useMemo(() => zonesOf(locations), [locations]);
  // `rollupLocations` drops inactive racks, which is what keeps the map about the room as it
  // is now — so the archived ones have to be read straight off the draft.
  const archived = useMemo(() => locations.filter((l) => !l.active), [locations]);
  const attention = racksNeedingAttention(racks);

  const categoryName = (id: string) => categories.find((c) => c.categoryId === id)?.name ?? id;
  const selectedRack = racks.find((r) => r.location.locationId === selected) ?? null;

  // What is kept on THIS rack, from the stock lines — an item on two racks belongs to both.
  const contents = selectedRack
    ? contentsOf(draft.stock, items, selectedRack.location.locationId).map((r) => r.item)
    : [];

  const q = search.trim().toLowerCase();
  const matchesSearch = (rack: LocationSummary) =>
    q === '' ||
    `${rack.location.code} ${rack.location.name} ${rack.location.zone}`.toLowerCase().includes(q) ||
    contentsOf(draft.stock, items, rack.location.locationId)
      .some((r) => r.item.name.toLowerCase().includes(q));

  return (
    <div class="space-y-4 pb-8 pt-4 sm:space-y-6 sm:pt-6">
      <PageHeader
        title="Peta Rak"
        subtitle="Setiap kotak satu rak. Warnanya mengikuti isi yang paling perlu diurus."
        action={
          <Button onClick={() => { setSelected(null); setCounting(null); setEditing('new'); }}>
            <Plus class="h-4 w-4" /> Rak baru
          </Button>
        }
      />

      {/* A panel, like every other create flow here. Inline, the form pushed the whole map
          down the screen to make room for three fields — and the map is the context you name
          a new rack against, since the code has to fit alongside the ones already painted on
          the shelves. */}
      <Sheet
        open={renamingZone !== null}
        title="Ubah zona"
        description={renamingZone ?? undefined}
        onClose={() => setRenamingZone(null)}
      >
        {renamingZone !== null && (
          <ZoneForm
            zone={renamingZone}
            rackCount={racksInZone(locations, renamingZone)}
            others={zoneNames.filter((z) => z !== renamingZone)}
            onSave={(to) => {
              setLocations((prev) => renameZone(prev, renamingZone, to));
              setRenamingZone(null);
            }}
            onAddRack={() => { setNewRackZone(renamingZone); setRenamingZone(null); setEditing('new'); }}
            onCancel={() => setRenamingZone(null)}
          />
        )}
      </Sheet>

      <Sheet
        open={editing === 'new'}
        title="Rak baru"
        description="Satu QR per rak — bukan per barang."
        onClose={() => { setEditing(null); setNewRackZone(null); }}
      >
        <RackForm
          initial={{
            code: '',
            name: '',
            zone: newRackZone ?? locations[locations.length - 1]?.zone ?? '',
          }}
          zones={zoneNames}
          onSave={(edit) => { addRack(edit); setNewRackZone(null); }}
          onCancel={() => { setEditing(null); setNewRackZone(null); }}
        />
      </Sheet>

      {locations.length === 0 ? (
        <div class={`${CARD} py-20 text-center`}>
          <MapPin class="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p class="mb-1 font-semibold text-slate-700">Belum ada rak.</p>
          <p class="mx-auto mb-5 max-w-md text-sm text-slate-500">
            Satu QR per rak — bukan per barang. Bisa ditambahkan di sini, atau sambil mencatat
            barang di Opname Gudang.
          </p>
          <Button size="touch" onClick={() => setEditing('new')}>
            <Plus class="h-5 w-5" /> Rak baru
          </Button>
        </div>
      ) : (
        <>
          <div class="grid grid-cols-3 gap-2 sm:gap-4">
            <Stat value={racks.length} label="Rak terdaftar" />
            <Stat
              value={attention}
              label="Rak perlu didatangi"
              tint={attention > 0 ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'}
            />
            <Stat
              value={items.filter((i) => {
                const rows = inventory.derived.items[i.itemId]?.byLocation ?? {};
                return !Object.keys(rows).some((id) => id !== '');
              }).length}
              label="Belum ditempatkan"
              tint="bg-slate-100 text-slate-500"
            />
          </div>

          {/* The map now owns the full width. Detail and counting moved into a panel that
              slides in from the right, so a rack’s contents no longer compete with the map
              for the same screen — and on a phone they stop being a block you scroll past
              the grid to reach. */}
          <div class="space-y-4">
          {zones.map((zone) => (
            <section key={zone.zone} class={CARD}>
              <div class="mb-3 flex flex-wrap items-baseline justify-between gap-3">
                {/* The heading IS the control. A bare pencil floating beside a title is a
                    thing you have to already know about — asked about directly, and that is
                    the only evidence a control needs that it is not discoverable. The whole
                    name is now the button, it underlines on hover, and it carries the pencil
                    rather than standing next to one. */}
                {zone.zone === UNASSIGNED.zone ? (
                  // Not a zone anybody named: it exists precisely because those racks have none.
                  <h2 class="font-bold text-slate-900">{zone.zone}</h2>
                ) : (
                  <button
                    type="button"
                    class="group flex items-center gap-2 rounded-lg text-left"
                    aria-label={`Ubah zona ${zone.zone}`}
                    title="Ubah nama zona, atau gabungkan dengan zona lain"
                    onClick={() => setRenamingZone(zone.zone)}
                  >
                    <h2 class="font-bold text-slate-900 group-hover:underline">{zone.zone}</h2>
                    <Pencil class="h-4 w-4 text-slate-400 group-hover:text-slate-900" />
                  </button>
                )}
                <span class="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                  {zone.racks.length} rak ·{' '}
                  {zone.racks.filter((r) => r.status === 'low' || r.status === 'out').length} perlu diurus ·{' '}
                  {zone.racks.reduce((n, r) => n + r.unitCount, 0)} unit
                </span>
              </div>

              {/* 104px, up from 84: the tiles gained a drawing and a badge, and a cell that
                  cannot fit its own code is not a smaller cell, it is a broken one. */}
              <div class="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2">
                {zone.racks.map((rack) => {
                  const id = rack.location.locationId;
                  const isSelected = selected === id;
                  const dimmed = !matchesSearch(rack);
                  // Which racks are overdue used to be a separate "Perlu dicek" card listing
                  // rack codes — a second copy of the map, printed as text, directly above the
                  // map. The tile is where somebody is already looking and already tapping, so
                  // the badge lives here and is itself the shortcut into the count.
                  const count = countState(rack.location, now);
                  const overdue = id !== '' && count.freshness !== 'fresh';
                  // Counted inside the rotation (30 days). Marked, not silent: the point of a
                  // rotation is knowing which shelves are already done, so nobody re-counts a
                  // rack somebody walked last week.
                  const checked = id !== '' && count.freshness === 'fresh';
                  const countNote = count.freshness === 'never'
                    ? 'belum pernah dicek'
                    : count.daysSince === 0 ? 'dicek hari ini' : `dicek ${count.daysSince} hari lalu`;
                  return (
                    // Wrapped, because the badge is a second action and a button cannot
                    // contain a button.
                    <div key={id || 'unassigned'} class={`relative${dimmed ? ' opacity-30' : ''}`}>
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        aria-label={
                          `Rak ${rack.location.code}, ${rack.itemCount} barang, ${ZONE_NOTE[rack.status]}`
                          + (id !== '' ? `, ${countNote}` : '')
                        }
                        class={
                          // `pr-9` keeps the code clear of the badge pinned to the top-right.
                          // Without it the drawing pushed "A1" underneath the clipboard and
                          // the one thing a rack tile has to say became unreadable.
                          'flex min-h-touch w-full flex-col items-start justify-center rounded-xl border py-2 pl-3 pr-9 ' +
                          'text-left transition-all ' + CELL[rack.status] +
                          (isSelected ? ' ring-2 ring-orange-500 ring-offset-1' : '')
                        }
                        onClick={() => setSelected(isSelected ? null : id)}
                      >
                        <span class="flex items-center gap-1.5">
                          {/* A drawing of the STORAGE, not of the stock. This briefly showed
                              the item drawings — a rack called "Sabun & pembersih" wore the
                              soap bottle — which said "there is a bottle here" when the tile's
                              whole job is to say "this is the shelf". */}
                          <RackArt art={rackArtFor(rack.location)} size={24} />
                          <span class="text-sm font-bold uppercase tabular-nums">
                            {rack.location.code}
                          </span>
                        </span>
                        <span class="text-[10px] opacity-70">
                          {rack.itemCount === 0 ? 'kosong' : `${rack.itemCount} barang`}
                        </span>
                      </button>
                      {id !== '' && (
                        // ONE control, always the same icon, with colour carrying the state.
                        // Swapping the glyph for a tick when a rack was counted made "done"
                        // look like a different kind of thing and quietly removed the way to
                        // count it again — which is exactly what somebody wants after finding
                        // a mistake. Green says done; the button still opens the count.
                        //
                        // A badge rather than a tile colour: the tile already says what is ON
                        // the rack (habis / menipis / aman), and overwriting that with
                        // "counted" would trade a fact somebody acts on for one they do not.
                        <button
                          type="button"
                          class={`absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-lg border transition-colors ${
                            checked
                              // Tinted, not filled. A solid green block is the loudest thing on
                              // the board, and "already counted" is the one state that needs no
                              // attention at all — the badges that DO want a walk should be
                              // easier to spot than the ones that do not. Same bg-50 / text-700
                              // triple every status pill in the app uses, with a green-500 edge
                              // so the control boundary still clears 3:1.
                              ? 'border-green-500 bg-green-50 text-green-700 hover:bg-green-100'
                              : 'border-slate-500 bg-white text-slate-600 hover:border-slate-900 hover:bg-slate-900 hover:text-slate-50'
                          }`}
                          aria-label={`Cek Rak ${rack.location.code} — ${countNote}`}
                          title={countNote}
                          onClick={() => { setSelected(id); setCounting(id); }}
                        >
                          <ClipboardCheck class="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {/* Archived racks live here rather than on the map: taking a dismantled shelf off
              the map is the whole point of archiving, but a one-way door is a trap, so they
              stay one tap from coming back. */}
          {archived.length > 0 && (
            <section class={CARD}>
              <button
                type="button"
                class="flex w-full items-center gap-2 text-left"
                aria-expanded={showArchive}
                onClick={() => setShowArchive(!showArchive)}
              >
                <Archive class="h-4 w-4 shrink-0 text-slate-400" />
                <h2 class="font-bold text-slate-900">Rak diarsipkan</h2>
                <span class="ml-auto text-xs font-bold tabular-nums text-slate-500">
                  {archived.length}
                </span>
              </button>
              {showArchive && (
                <ul class="-mx-[var(--card-pad)] mt-3 divide-y divide-slate-100">
                  {archived.map((l) => (
                    <li key={l.locationId} class="flex flex-wrap items-center gap-3 px-[var(--card-pad)] py-2.5">
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-sm font-bold text-slate-500">Rak {l.code}</p>
                        <p class={CODE}>{l.zone}{l.name && ` · ${l.name}`}</p>
                      </div>
                      <button
                        type="button"
                        class="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-slate-700 underline"
                        onClick={() => setLocations((prev) => restoreLocation(prev, l.locationId))}
                      >
                        <RotateCcw class="h-4 w-4" /> Aktifkan lagi
                      </button>
                      {blocksDelete(l, items, draft.stock) === null && (
                        <button
                          type="button"
                          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-400 text-slate-500 hover:border-red-400 hover:bg-red-50 hover:text-red-700"
                          aria-label={`Hapus permanen rak ${l.code}`}
                          onClick={() => setLocations((prev) => deleteLocation(prev, l.locationId))}
                        >
                          <Trash2 class="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          </div>

          <Sheet
            open={selectedRack !== null}
            title={selectedRack ? `Rak ${selectedRack.location.code}` : ''}
            description={selectedRack ? rackSubtitle(selectedRack.location, now) : undefined}
            onClose={closePanel}
          >
          {counting && selectedRack && (
            <CountSheet
              rack={selectedRack.location}
              contents={contents}
              inventory={inventory}
              onCancel={() => setCounting(null)}
              onApply={(counted) => {
                // One rack's opening quantities, not the item's total. This line is the whole
                // reason quantity moved off the item.
                draft.setStock((prev) => applyCount(prev, counting, counted));
                draft.setLocations((prev) => markCounted(prev, counting, Date.now()));
                setCounting(null);
              }}
            />
          )}

          {selectedRack && !counting && (
            <section>
              {selectedRack.location.name && (
                <p class="mb-3 text-sm text-slate-500">{selectedRack.location.name}</p>
              )}

              <div class="mb-4 flex items-center gap-2">
                <Button size="touch" class="flex-1" onClick={() => setCounting(selectedRack.location.locationId)}>
                  <ClipboardCheck class="h-5 w-5" /> Cek rak
                </Button>
                {/* Membership, beside the recount. Cek rak fixes the numbers on a shelf; this
                    fixes which things are on it, and until now that could only be done from
                    each item's own form. */}
                <button
                  type="button"
                  class="flex h-touch w-touch shrink-0 items-center justify-center rounded-lg border border-slate-400 bg-white text-slate-600 hover:bg-slate-100"
                  aria-label={`Atur isi rak ${selectedRack.location.code}`}
                  title="Atur isi rak"
                  onClick={() => setArranging(selectedRack.location.locationId)}
                >
                  <Boxes class="h-5 w-5" />
                </button>
                <button
                  type="button"
                  class="flex h-touch w-touch shrink-0 items-center justify-center rounded-lg border border-slate-400 bg-white text-slate-600 hover:bg-slate-100"
                  aria-label={`Ubah rak ${selectedRack.location.code}`}
                  onClick={() => setEditing(selectedRack.location.locationId)}
                >
                  <Pencil class="h-5 w-5" />
                </button>
              </div>

              {editing === selectedRack.location.locationId && (
                <div class="mb-4">
                  <RackForm
                    title="Ubah rak"
                    zones={zoneNames}
                    initial={{
                      code: selectedRack.location.code,
                      name: selectedRack.location.name,
                      zone: selectedRack.location.zone,
                    }}
                    onSave={(edit) => saveRack(selectedRack.location.locationId, edit)}
                    onCancel={() => setEditing(null)}
                  />
                </div>
              )}

              {confirmRemove === selectedRack.location.locationId && (
                <RemoveRack
                  code={selectedRack.location.code}
                  archiveBlock={blocksArchive(selectedRack.location.locationId, items, draft.stock)}
                  deleteBlock={blocksDelete(selectedRack.location, items, draft.stock)}
                  onArchive={() => {
                    setLocations((prev) => archiveLocation(prev, selectedRack.location.locationId));
                    setConfirmRemove(null);
                    setSelected(null);
                  }}
                  onDelete={() => {
                    setLocations((prev) => deleteLocation(prev, selectedRack.location.locationId));
                    setConfirmRemove(null);
                    setSelected(null);
                  }}
                  onCancel={() => setConfirmRemove(null)}
                />
              )}

              {contents.length === 0 ? (
                <div class="py-8 text-center">
                  <Package class="mx-auto mb-2 h-8 w-8 text-slate-300" />
                  <p class="italic text-slate-400">Rak ini kosong.</p>
                </div>
              ) : (
                <ul class="-mx-[var(--card-pad)] divide-y divide-slate-100">
                  {contents.map((i) => {
                    const d = inventory.derived.items[i.itemId];
                    const badge = itemStatusBadge(d?.status ?? 'available');
                    return (
                      <li key={i.itemId} class="flex items-center gap-2 pr-[var(--card-pad)]">
                        <button
                          type="button"
                          class="flex min-w-0 flex-1 items-center gap-3 py-3 pl-[var(--card-pad)] text-left hover:bg-slate-50"
                          aria-label={`Buka ${i.name}`}
                          onClick={() => onOpenItem(i.itemId)}
                        >
                          <ItemArt art={artFor(i, categoryName(i.categoryId))} size={30} />
                          <div class="min-w-0 flex-1">
                            <p class="truncate text-sm font-bold text-slate-900">{i.name}</p>
                            <p class={CODE}>{categoryName(i.categoryId)}</p>
                          </div>
                          {/* The status PILL is gone from this row and its colour has moved
                              onto the number. In a panel this narrow the pill, the quantity and
                              the Ambil button did not fit, and the pill was the one saying
                              something already said: "0 botol" is what habis means. */}
                          <span
                            class={`shrink-0 whitespace-nowrap text-right text-sm font-bold tabular-nums ${badge.text}`}
                            title={badge.label}
                          >
                            {/* What is on THIS shelf, not the item's total across the gudang. */}
                            {d?.byLocation[selectedRack.location.locationId] ?? 0}{' '}
                            <span class="text-xs font-normal text-slate-400">{i.unit}</span>
                          </span>
                        </button>
                        {/* Outside the row button, not inside it: a button in a button is not
                            valid HTML and the inner one stops being reachable by keyboard. */}
                        {i.trackBy === 'quantity' && draft.canRecord !== false && (
                          <Button
                            size="sm"
                            class="min-h-11 shrink-0"
                            aria-label={`Ambil ${i.name}`}
                            onClick={() => onMove({
                              item: i,
                              direction: 'keluar',
                              locationId: selectedRack.location.locationId,
                            })}
                          >
                            Ambil
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Removal lives at the bottom, under the contents, because whether a rack can
                  be retired is a question about what is on it — and the answer is right there. */}
              <div class="mt-4 border-t border-slate-100 pt-3">
                {selectedRack.location.active === false ? (
                  <div class="flex flex-wrap items-center gap-3">
                    <span class="text-sm text-slate-500">Rak ini diarsipkan.</span>
                    <button
                      type="button"
                      class="ml-auto flex items-center gap-1.5 text-sm font-semibold text-slate-700 underline"
                      onClick={() => setLocations((prev) => restoreLocation(prev, selectedRack.location.locationId))}
                    >
                      <RotateCcw class="h-4 w-4" /> Aktifkan lagi
                    </button>
                  </div>
                ) : confirmRemove !== selectedRack.location.locationId && (
                  <button
                    type="button"
                    class="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-red-700"
                    onClick={() => setConfirmRemove(selectedRack.location.locationId)}
                  >
                    <Archive class="h-4 w-4" /> Arsipkan atau hapus rak ini
                  </button>
                )}
              </div>
            </section>
          )}
          </Sheet>

      <Sheet
        open={arranging !== null}
        title="Atur isi rak"
        description={arranging
          ? `Rak ${locations.find((l) => l.locationId === arranging)?.code ?? ''}`
          : undefined}
        onClose={() => setArranging(null)}
      >
        {arranging && (() => {
          const rack = locations.find((l) => l.locationId === arranging);
          return rack ? (
            <RackContents
              rack={rack}
              racks={locations}
              items={items}
              stock={draft.stock}
              derived={inventory.derived}
              categoryName={categoryName}
              onChange={draft.setStock}
              onDone={() => setArranging(null)}
            />
          ) : null;
        })()}
      </Sheet>
        </>
      )}
    </div>
  );
}

/** Zone plus how long ago it was counted — the two facts that decide whether to walk there. */
function rackSubtitle(location: Location, now: number): string {
  const c = countState(location, now);
  const checked = c.freshness === 'never'
    ? 'belum pernah dicek'
    : c.daysSince === 0 ? 'dicek hari ini' : `dicek ${c.daysSince} hari lalu`;
  return `${location.zone} · ${checked}`;
}

/**
 * One form for both jobs, because adding a rack and correcting one ask for exactly the same
 * three things. Inline rather than a modal: the rack map is the context, and a dialog over it
 * would hide the neighbouring codes somebody is naming this one against.
 */
/**
 * Renaming a zone, which is also the only way to remove one.
 *
 * A zone is a label carried by its racks, so it cannot exist without them: emptying it IS
 * deleting it. Renaming onto a zone that already exists therefore MERGES the two, and the form
 * says so before it happens rather than surprising somebody with a board that lost a section.
 */
function ZoneForm(
  { zone, rackCount, others, onSave, onAddRack, onCancel }:
  {
    zone: string; rackCount: number; others: string[];
    onSave: (to: string) => void; onAddRack: () => void; onCancel: () => void;
  },
) {
  const [name, setName] = useState(zone);
  const target = name.trim();
  const merging = target !== '' && target !== zone && others.includes(target);

  return (
    <div>
      <label class={LABEL} for="zone-name">Nama zona</label>
      <input
        id="zone-name"
        class={`${FIELD} min-h-touch`}
        value={name}
        autocomplete="off"
        onInput={(e: Event) => setName((e.target as HTMLInputElement).value)}
      />
      <p class="mt-1.5 text-sm text-slate-500">
        {rackCount} rak akan ikut pindah.
      </p>

      {merging && (
        <p class="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-sm text-amber-800">
          Zona <strong>{target}</strong> sudah ada — kedua zona akan digabung.
        </p>
      )}

      <div class="mt-4 flex flex-wrap items-center gap-3">
        <Button size="touch" disabled={target === '' || target === zone} onClick={() => onSave(target)}>
          Simpan
        </Button>
        <button type="button" class="font-semibold text-slate-500 underline" onClick={onCancel}>
          Batal
        </button>
      </div>

      {/* The two questions this panel gets asked next, answered here rather than left to be
          discovered: how do I add one, and how do I delete one. Neither has a button of its
          own, and both are one sentence — so the sentences go where the question is asked. */}
      <div class="mt-6 space-y-4 border-t border-slate-100 pt-4">
        <div>
          <p class="text-xs font-bold uppercase tracking-wider text-slate-500">Menambah zona</p>
          <p class="mt-1 text-xs leading-relaxed text-slate-500">
            Zona lahir dari raknya: buat rak baru, lalu isi nama zona yang belum ada.
          </p>
          <button
            type="button"
            class="mt-2 text-sm font-semibold text-slate-900 underline"
            onClick={onAddRack}
          >
            Tambah rak di zona {zone}
          </button>
        </div>

        {others.length > 0 && (
          <div>
            <p class="text-xs font-bold uppercase tracking-wider text-slate-500">Menghapus zona</p>
            <p class="mt-1 text-xs leading-relaxed text-slate-500">
              Ganti namanya menjadi nama zona lain — semua raknya pindah ke sana dan zona ini
              hilang dengan sendirinya. Zona hanyalah nama yang dibawa oleh rak-raknya, jadi
              tanpa rak ia memang tidak ada.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const NEW_ZONE = '\u0000new';

function RackForm(
  { title, initial, zones, onSave, onCancel }:
  {
    title?: string; initial: LocationEdit; zones: string[];
    onSave: (edit: LocationEdit) => void; onCancel: () => void;
  },
) {
  const [code, setCode] = useState(initial.code);
  const [name, setName] = useState(initial.name);
  const [zone, setZone] = useState(initial.zone);
  const [artId, setArtId] = useState(initial.artId);
  /** Starts typing when the zone is new — an unknown zone has nothing to pick from. */
  const [typingZone, setTypingZone] = useState(
    () => initial.zone !== '' && !zones.includes(initial.zone),
  );

  const submit = () => { if (code.trim() !== '') onSave({ code, name, zone, artId }); };

  // What it will be drawn as right now: the choice if one was made, otherwise read from the
  // name as the operator types it.
  const art = rackArtFor({ code, name, zone, artId });

  return (
    // No card and no heading when it is inside a Sheet: the panel supplies both, and a second
    // frame around a form that already fills the panel is just another box to look past.
    <section class={title ? `${CARD} border-slate-900` : ''}>
      {title && <h2 class="mb-3 font-bold text-slate-900">{title}</h2>}
      <div class={`grid gap-3 ${title ? 'sm:grid-cols-3' : ''}`}>
        <div>
          <label class={LABEL} for="rack-code">Kode rak</label>
          <input
            id="rack-code"
            class={`${FIELD} min-h-touch`}
            value={code}
            placeholder="A1"
            // `onInput`, never `onChange`: Octane has no synthetic event layer, so `change`
            // is the platform event and only fires on blur.
            onInput={(e: Event) => setCode((e.target as HTMLInputElement).value)}
          />
          <p class="mt-1 text-xs text-slate-400">Yang tertulis di raknya.</p>
        </div>
        <div>
          <label class={LABEL} for="rack-name">Isi rak (opsional)</label>
          <input
            id="rack-name"
            class={`${FIELD} min-h-touch`}
            value={name}
            placeholder="Sabun & pembersih"
            onInput={(e: Event) => setName((e.target as HTMLInputElement).value)}
          />
        </div>
        <div>
          <label class={LABEL} for="rack-zone">Zona</label>
          {/* A list, not a blank field. A zone is only a string on each rack, so nothing keeps
              two spellings apart: typed free-hand, "Gudang Utama" and "gudang utama" become two
              zones and the board quietly splits in half. Offering what already exists makes the
              right answer the easy one, and typing a new one is still one tap away. */}
          {typingZone || zones.length === 0 ? (
            <input
              id="rack-zone"
              class={`${FIELD} min-h-touch`}
              value={zone}
              placeholder="Gudang Utama"
              autocomplete="off"
              onInput={(e: Event) => setZone((e.target as HTMLInputElement).value)}
            />
          ) : (
            <Select
              id="rack-zone"
              value={zones.includes(zone) ? zone : (zones[0] ?? '')}
              onChange={(e: Event) => {
                const picked = (e.target as HTMLSelectElement).value;
                if (picked === NEW_ZONE) { setTypingZone(true); setZone(''); }
                else setZone(picked);
              }}
            >
              {zones.map((z) => <option key={z} value={z}>{z}</option>)}
              <option value={NEW_ZONE}>+ Zona baru…</option>
            </Select>
          )}
          <p class="mt-1 text-xs text-slate-400">Ruangan atau areanya.</p>
        </div>
      </div>

      {/* Chosen, not asked for. The guess from the name is right most of the time — "Lemari
          arsip" is a cabinet — so this is an override, laid out as pictures because that is
          what is being chosen. Explicit beats inferred here, unlike the item drawings, because
          a rack is named once and lives for years; an item is named fifty times in an
          afternoon and cannot afford the decision. */}
      <div class="mt-4">
        <span class={LABEL}>Jenis penyimpanan</span>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2" role="radiogroup" aria-label="Jenis penyimpanan">
          {RACK_ART_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={art === id}
              aria-label={RACK_ART_LABEL[id]}
              class={`flex flex-col items-center gap-1 rounded-lg border-2 px-1 py-2 transition-colors ${
                art === id ? 'border-slate-900 bg-slate-900/5' : 'border-slate-200 bg-white hover:border-slate-400'
              }`}
              onClick={() => setArtId(id)}
            >
              <RackArt art={id} size={30} />
              <span class="text-[10px] leading-tight text-slate-600">{RACK_ART_LABEL[id]}</span>
            </button>
          ))}
        </div>
        {artId && (
          <button
            type="button"
            class="mt-2 text-xs font-semibold text-slate-600 underline"
            onClick={() => setArtId(undefined)}
          >
            Kembali ke otomatis
          </button>
        )}
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-3">
        <Button size="touch" disabled={code.trim() === ''} onClick={submit}>Simpan</Button>
        <button type="button" class="font-semibold text-slate-500 underline" onClick={onCancel}>
          Batal
        </button>
        {/* Only when there is a code to change. Said out loud there because it is the thing
            people are most afraid of, and it is not true: the QR encodes an id that never
            moves, so nothing already stuck to a shelf stops working when the code is
            corrected. On a rack that does not exist yet it is reassurance about a sticker
            nobody has printed. */}
        {initial.code !== '' && (
          <span class="ml-auto max-w-xs text-xs text-slate-400">
            Mengubah kode tidak merusak stiker QR yang sudah dicetak.
          </span>
        )}
      </div>
    </section>
  );
}

/** Why a rack cannot be retired yet, in the words of the thing standing in the way. */
function blockText(block: RemovalBlock): string {
  if (block.kind === 'has-history') return 'Rak ini pernah dicek, jadi riwayatnya perlu disimpan.';
  const names = block.names.join(', ');
  return block.count > block.names.length
    ? `Masih ada ${block.count} barang di sini (${names}, dan lainnya).`
    : `Masih ada ${block.count} barang di sini (${names}).`;
}

/**
 * Two verbs, not one, and the difference is explained rather than assumed.
 *
 * Archiving keeps the rack in the record and takes it off the board — the honest answer for a
 * shelf that was dismantled but still appears in months of history. Deleting is only offered
 * for a rack that never became real: nothing on it, never counted. That is the "typed it
 * twice" case, and refusing to clean it up leaves permanent litter on the map.
 */
function RemoveRack(
  { code, archiveBlock, deleteBlock, onArchive, onDelete, onCancel }:
  {
    code: string;
    archiveBlock: RemovalBlock | null;
    deleteBlock: RemovalBlock | null;
    onArchive: () => void;
    onDelete: () => void;
    onCancel: () => void;
  },
) {
  return (
    <div class="mb-4 rounded-lg border border-red-200 bg-red-50/40 p-4" role="group" aria-label={`Hapus rak ${code}`}>
      <p class="mb-3 text-sm font-bold text-slate-900">Rak {code} mau diapakan?</p>

      {archiveBlock ? (
        <p class="mb-3 rounded-md bg-white px-3 py-2 text-sm text-slate-600">
          {blockText(archiveBlock)} Pindahkan dulu isinya, baru rak ini bisa diarsipkan.
        </p>
      ) : (
        <div class="mb-3 flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={onArchive}>
            <Archive class="h-4 w-4" /> Arsipkan
          </Button>
          <span class="min-w-0 flex-1 text-xs text-slate-500">
            Hilang dari peta, riwayatnya tetap tersimpan. Bisa diaktifkan lagi kapan saja.
          </span>
        </div>
      )}

      {deleteBlock ? (
        !archiveBlock && (
          <p class="text-xs text-slate-500">
            Tidak bisa dihapus permanen — {blockText(deleteBlock).toLowerCase()}
          </p>
        )
      ) : (
        <div class="flex flex-wrap items-center gap-3 border-t border-red-100 pt-3">
          <Button variant="danger" onClick={onDelete}>
            <Trash2 class="h-4 w-4" /> Hapus permanen
          </Button>
          <span class="min-w-0 flex-1 text-xs text-slate-500">
            Rak ini kosong dan belum pernah dicek — aman dihapus kalau salah ketik.
          </span>
        </div>
      )}

      <button type="button" class="mt-3 text-sm font-semibold text-slate-500 underline" onClick={onCancel}>
        Batal
      </button>
    </div>
  );
}
