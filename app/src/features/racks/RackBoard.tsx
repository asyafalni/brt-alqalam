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
  Archive, Check, ClipboardCheck, MapPin, Package, Pencil, Plus, RotateCcw, Trash2,
} from '@octanejs/lucide';
import { groupByZone, rollupLocations, racksNeedingAttention } from '../../../../domain/locations';
import type { LocationSummary, LocationStatus } from '../../../../domain/locations';
import { countState } from '../../../../domain/cycleCount';
import { contentsOf } from '../../../../domain/stock';
import type { Category, Item, Location } from '../../../../domain/types';
import type { Draft } from '../../state/useDraft';
import type { Inventory } from '../../state/useInventory';
import { Button, CARD, CODE, FIELD, LABEL, PageHeader, Stat } from '../../components/ui';
import {
  applyCount, archiveLocation, blocksArchive, blocksDelete, createLocation, deleteLocation,
  editLocation, markCounted, restoreLocation,
} from '../stocktake/draft';
import type { LocationEdit, RemovalBlock } from '../stocktake/draft';
import { itemStatusBadge, PILL } from '../scan/resolve';
import { artFor, ItemArt } from '../items/ItemArt';
import { CountSheet } from './CountSheet';
import { Sheet } from '../../components/Sheet';

/** Cell skins. Literal class strings — Tailwind never sees an interpolated one. */
const CELL: Record<LocationStatus, string> = {
  out: 'bg-red-50 border-red-200 text-red-800 hover:border-red-300',
  low: 'bg-amber-50 border-amber-200 text-amber-800 hover:border-amber-300',
  available: 'bg-white border-slate-400 text-slate-700 hover:border-slate-900',
  empty: 'bg-slate-50 border-dashed border-slate-400 text-slate-500 hover:border-slate-900',
};

const ZONE_NOTE: Record<LocationStatus, string> = {
  out: 'Ada yang habis',
  low: 'Ada yang menipis',
  available: 'Aman',
  empty: 'Kosong',
};

export function RackBoard(
  { draft, inventory, search, now, openRack, onOpenItem }:
  { draft: Draft; inventory: Inventory; search: string; now: number; openRack?: string;
    onOpenItem: (id: string) => void },
) {
  const { items, categories, locations, setLocations } = draft;
  // Seeded from the route so a rack link on the stock list lands with the panel already open.
  const [selected, setSelected] = useState<string | null>(openRack ?? null);
  useEffect(() => { if (openRack) setSelected(openRack); }, [openRack]);
  const [counting, setCounting] = useState<string | null>(null);
  /** `'new'` while adding; a locationId while editing that rack. One form, two jobs. */
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [showArchive, setShowArchive] = useState(false);

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

      {editing === 'new' && (
        <RackForm
          title="Rak baru"
          initial={{ code: '', name: '', zone: locations[locations.length - 1]?.zone ?? '' }}
          onSave={addRack}
          onCancel={() => setEditing(null)}
        />
      )}

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
                <h2 class="font-bold text-slate-900">{zone.zone}</h2>
                <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {zone.racks.length} rak ·{' '}
                  {zone.racks.filter((r) => r.status === 'low' || r.status === 'out').length} perlu diurus ·{' '}
                  {zone.racks.reduce((n, r) => n + r.unitCount, 0)} unit
                </span>
              </div>

              <div class="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2">
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
                          'flex min-h-touch w-full flex-col items-start justify-center rounded-xl border px-3 py-2 ' +
                          'text-left transition-all ' + CELL[rack.status] +
                          (isSelected ? ' ring-2 ring-orange-500 ring-offset-1' : '')
                        }
                        onClick={() => setSelected(isSelected ? null : id)}
                      >
                        <span class="text-sm font-bold uppercase tabular-nums">{rack.location.code}</span>
                        <span class="text-[10px] opacity-70">
                          {rack.itemCount === 0 ? 'kosong' : `${rack.itemCount} barang`}
                        </span>
                      </button>
                      {overdue && (
                        <button
                          type="button"
                          class="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-lg border border-slate-400 bg-white text-slate-500 transition-colors hover:border-slate-900 hover:bg-slate-900 hover:text-slate-50"
                          aria-label={`Cek Rak ${rack.location.code} — ${countNote}`}
                          title={countNote}
                          onClick={() => { setSelected(id); setCounting(id); }}
                        >
                          <ClipboardCheck class="h-3.5 w-3.5" />
                        </button>
                      )}
                      {checked && (
                        // A mark, not a tile colour: the tile's colour already means what is
                        // ON the rack (habis / menipis / aman), and overwriting that with
                        // "counted" would trade a fact somebody acts on for one they do not.
                        <span
                          class="pointer-events-none absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-lg bg-green-500 text-white"
                          title={countNote}
                        >
                          <Check class="h-4 w-4" />
                        </span>
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
                <ul class="mt-3 divide-y divide-slate-100">
                  {archived.map((l) => (
                    <li key={l.locationId} class="flex flex-wrap items-center gap-3 py-2.5">
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
                <ul class="divide-y divide-slate-100">
                  {contents.map((i) => {
                    const d = inventory.derived.items[i.itemId];
                    const badge = itemStatusBadge(d?.status ?? 'available');
                    return (
                      <li key={i.itemId}>
                        <button
                          type="button"
                          class="flex w-full items-center gap-3 py-3 text-left hover:bg-slate-50"
                          aria-label={`Buka ${i.name}`}
                          onClick={() => onOpenItem(i.itemId)}
                        >
                        <ItemArt art={artFor(i, categoryName(i.categoryId))} size={30} />
                        <div class="min-w-0 flex-1">
                          <p class="truncate text-sm font-bold text-slate-900">{i.name}</p>
                          <p class={CODE}>{categoryName(i.categoryId)}</p>
                        </div>
                        <span class={`${PILL} ${badge.chip}`}>{badge.label}</span>
                          <span class="w-20 shrink-0 text-right text-sm font-bold tabular-nums text-slate-900">
                            {/* What is on THIS shelf, not the item's total across the gudang. */}
                            {d?.byLocation[selectedRack.location.locationId] ?? 0}{' '}
                            <span class="text-xs font-normal text-slate-400">{i.unit}</span>
                          </span>
                        </button>
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
function RackForm(
  { title, initial, onSave, onCancel }:
  { title: string; initial: LocationEdit; onSave: (edit: LocationEdit) => void; onCancel: () => void },
) {
  const [code, setCode] = useState(initial.code);
  const [name, setName] = useState(initial.name);
  const [zone, setZone] = useState(initial.zone);

  const submit = () => { if (code.trim() !== '') onSave({ code, name, zone }); };

  return (
    <section class={`${CARD} border-slate-900`}>
      <h2 class="mb-3 font-bold text-slate-900">{title}</h2>
      <div class="grid gap-3 sm:grid-cols-3">
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
          <input
            id="rack-zone"
            class={`${FIELD} min-h-touch`}
            value={zone}
            placeholder="Gudang Utama"
            onInput={(e: Event) => setZone((e.target as HTMLInputElement).value)}
          />
          <p class="mt-1 text-xs text-slate-400">Ruangan atau areanya.</p>
        </div>
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-3">
        <Button size="touch" disabled={code.trim() === ''} onClick={submit}>Simpan</Button>
        <button type="button" class="font-semibold text-slate-500 underline" onClick={onCancel}>
          Batal
        </button>
        {/* Said out loud because it is the thing people are most afraid of, and it is not
            true: the QR encodes an id that never changes, so nothing already stuck to a shelf
            stops working when the code is corrected. */}
        <span class="ml-auto max-w-xs text-xs text-slate-400">
          Mengubah kode tidak merusak stiker QR yang sudah dicetak.
        </span>
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
