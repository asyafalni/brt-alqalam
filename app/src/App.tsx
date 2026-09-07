import { lazy, Suspense, useEffect, useMemo, useState } from 'octane';
import { CircleCheck, ClipboardList, LayoutDashboard, MapPin, Package } from '@octanejs/lucide';
import { Sidebar } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { BottomNav } from './components/BottomNav';
import { Card } from './components/ui';
import { Sheet } from './components/Sheet';
import { StockAlerts } from './features/alerts/StockAlerts';
import { openRequests } from '../../domain/requests';
import { RackBoard } from './features/racks/RackBoard';
import { Dashboard } from './features/dashboard/Dashboard';
import { ItemDetail } from './features/items/ItemDetail';
import { Report } from './features/report/Report';
import { RequestBoard } from './features/requests/RequestBoard';
import { AssetBoard } from './features/assets/AssetBoard';

// Split at the route, because these two carry the app's only heavy dependencies and neither is
// on the path anyone opens first. The label sheet pulls a QR *encoder* (~43kB) and the scanner
// pulls a QR *decoder* on browsers without a native one — both would otherwise sit in the
// bundle a marbot downloads just to write down how much sabun is on a shelf.
const LabelSheet = lazy(() => import('./features/labels/LabelSheet').then((m) => ({ default: m.LabelSheet })));
const ScannerView = lazy(() => import('./features/scan/ScannerView').then((m) => ({ default: m.ScannerView })));

/** Deliberately plain. A spinner that appears for 80ms reads as a flicker, not as progress. */
function Loading({ label }: { label: string }) {
  return (
    <div class="flex min-h-48 items-center justify-center p-8 text-sm text-slate-400" role="status">
      {label}
    </div>
  );
}
import { useDraft } from './state/useDraft';
import { useInventory } from './state/useInventory';
import { useRoute } from './state/useRoute';
import type { Route } from './state/route';
import { StockTake } from './features/stocktake/StockTake';

import { Board } from './features/board/Board';
import { ScanResult } from './features/scan/ScanResult';
import { MovementSheet } from './features/movement/MovementSheet';
import type { MovementTarget } from './features/movement/MovementSheet';


export function App() {
  // One draft, shared. Two screens each loading from storage would be two sources of truth,
  // and the label sheet would quietly print a stale count.
  const draft = useDraft();
  const [route, go] = useRoute();
  const [search, setSearch] = useState('');
  /* The bell opens the list where you are, rather than navigating you to a screen that has it.
     Notifikasi Stok is a thing to glance at and act on, not a destination, and sending someone
     to Beranda from the middle of a stock-take costs them their place. */
  const [alertsOpen, setAlertsOpen] = useState(false);
  /* Also at the frame: a movement is started from a scan, from an item, or from a rack, and
     hoisting it means one implementation instead of three that drift. */
  const [moving, setMoving] = useState<MovementTarget | null>(null);

  // Pinned per mount: `deriveState` is a pure function of `now`, so a moving clock would
  // recompute the whole fold on every keystroke.
  const now = useMemo(() => Date.now(), []);
  const inventory = useInventory(draft, now);

  // Broken and lost both need a person to do something; borrowed does not.
  const assetIssues = useMemo(
    () => Object.values(inventory.derived.instances)
      .filter((d) => d.status === 'broken' || d.status === 'lost').length,
    [inventory.derived],
  );

  // SmartInv App.tsx:51-64 owns this the same way. Their version force-expands on every
  // resize, overriding a manual collapse; ours only reacts when the breakpoint is crossed.
  const [isMobile, setIsMobile] = useState(() => innerWidth < 768);
  const [collapsed, setCollapsed] = useState(() => innerWidth < 768);

  useEffect(() => {
    const onResize = () => {
      const mobile = innerWidth < 768;
      setIsMobile((was) => {
        if (was !== mobile) setCollapsed(mobile);
        return mobile;
      });
    };
    addEventListener('resize', onResize);
    return () => removeEventListener('resize', onResize);
  }, []);

  const navigate = (next: Parameters<typeof go>[0]) => {
    go(next);
    if (isMobile) setCollapsed(true);
  };

  // The camera takes the whole screen: it is a viewfinder, and chrome around a viewfinder
  // is just something to mis-tap while aiming.
  if (route.name === 'pindai') {
    return (
      <Suspense fallback={<Loading label="Menyiapkan kamera…" />}>
        <ScannerView onFound={(next: Route) => go(next)} onClose={() => go({ name: 'beranda' })} />
      </Suspense>
    );
  }

  return (
    // SmartInv App.tsx:67 — the app frame.
    <div class="app-frame flex h-screen bg-slate-50 font-sans">
      {/* SmartInv's two decorative blur blobs (App.tsx:69-70) are deliberately NOT ported.
          They are pure ornament — the opposite of DOSS's restraint — and two full-viewport
          120px blur layers are the most expensive thing that can sit behind a scrolling list
          on a tablet. "Minimalist and fast" is one decision here, not two. */}

      <Sidebar
        route={route}
        collapsed={collapsed}
        isMobile={isMobile}
        itemCount={draft.items.length}
        alertCount={inventory.notifications.length}
        rackCount={draft.locations.length}
        requestCount={openRequests(draft.requests).length}
        assetIssues={assetIssues}
        onNavigate={navigate}
        onClose={() => setCollapsed(true)}
      />

      {/* App.tsx:74-77 — content column. */}
      <div class="app-column relative flex min-w-0 flex-1 flex-col">
        <Navbar
          search={search}
          alertCount={inventory.notifications.length}
          onSearch={setSearch}
          onToggleSidebar={() => setCollapsed(!collapsed)}
          onShowAlerts={() => setAlertsOpen(true)}
          onScan={() => go({ name: 'pindai' })}
          drawerAlerts={assetIssues}
        />

        {/* pb-24 on mobile keeps the last row clear of the bottom bar. */}
        {/* `relative` without a z-index on purpose. SmartInv paired it with `z-10` to sit above
            two decorative blur blobs we deliberately did not port, and the leftover z-index
            made `main` a stacking context — which trapped every `position: fixed` overlay
            rendered inside it *below* the z-40 navbar, however high its own z-index went.
            Without the index, `relative` creates no context and an overlay reaches the top. */}
        <main class="custom-scrollbar relative flex-1 overflow-y-auto px-4 pb-24 md:px-8 md:pb-8">
          {route.name === 'beranda' && (
            <Dashboard
              draft={draft}
              inventory={inventory}
              now={now}
              onNavigate={navigate}
            />
          )}
          {route.name === 'opname' && (
            <StockTake draft={draft} search={search} onSearch={setSearch} />
          )}
          {route.name === 'board' && (
            <Board
              items={draft.items}
              categories={draft.categories}
              locations={draft.locations}
              inventory={inventory}
              search={search}
              onOpenItem={(id) => navigate({ name: 'item', id })}
              onOpenRack={(id) => navigate({ name: 'racks', id })}
              filter={route.filter}
              category={route.category}
              kind={route.kind}
              sort={route.sort}
              /* Merged onto what is already in the URL, so changing the sort does not silently
                 clear the filter somebody arrived with. */
              onView={(next) => navigate({
                name: 'board',
                filter: next.filter ?? route.filter,
                category: next.category ?? route.category,
                kind: next.kind ?? route.kind,
                sort: next.sort ?? route.sort,
              })}
            />
          )}
          {route.name === 'racks' && (
            <RackBoard
              draft={draft}
              inventory={inventory}
              search={search}
              now={now}
              openRack={route.id}
              onMove={setMoving}
              onOpenItem={(id) => navigate({ name: 'item', id })}
            />
          )}
          {route.name === 'item' && (
            <ItemDetail
              id={route.id}
              draft={draft}
              inventory={inventory}
              now={now}
              onNavigate={navigate}
              onMove={setMoving}
            />
          )}
          {route.name === 'aset' && (
            <AssetBoard
              draft={draft}
              inventory={inventory}
              search={search}
              onOpenItem={(id) => navigate({ name: 'item', id })}
              onRequest={(type, assetId) => navigate({ name: 'pengajuan', type, assetId })}
            />
          )}
          {route.name === 'pengajuan' && (
            <RequestBoard
              draft={draft}
              inventory={inventory}
              now={now}
              /* Keyed by the prefill so arriving from a second broken unit remounts the form
                 rather than reusing the state of the first. */
              key={route.assetId ?? 'pengajuan'}
              prefill={route.type && route.assetId
                ? { type: route.type, assetId: route.assetId }
                : undefined}
              onPrefillUsed={() => { if (route.assetId) navigate({ name: 'pengajuan' }); }}
            />
          )}
          {route.name === 'laporan' && (
            <Report draft={draft} inventory={inventory} now={now} />
          )}
          {route.name === 'label' && (
            <Suspense fallback={<Loading label="Menyiapkan label…" />}>
              <LabelSheet
                items={draft.items}
                categories={draft.categories}
                locations={draft.locations}
                stock={draft.stock}
              />
            </Suspense>
          )}
          {route.name === 'scan' && (
            <ScanResult
              target={route.target}
              id={route.id}
              items={draft.items}
              categories={draft.categories}
              locations={draft.locations}
              stock={draft.stock}
              inventory={inventory}
              now={now}
              onBack={() => navigate({ name: 'beranda' })}
              onMove={setMoving}
            />
          )}
          {route.name === 'scan-empty' && (
            <div class="space-y-6 pt-6">
              <Card class="border-red-100 text-center">
                <h1 class="mb-2 text-2xl font-bold text-slate-900">Label tidak terbaca</h1>
                <p class="mb-5 text-slate-500">
                  QR ini tidak menyebut barang apa pun. Mungkin rusak atau tercetak sebagian.
                </p>
                <button
                  type="button"
                  class="min-h-touch rounded-lg bg-slate-900 px-6 font-semibold text-slate-50 hover:bg-slate-800"
                  onClick={() => navigate({ name: 'opname' })}
                >
                  Buka Opname Gudang
                </button>
              </Card>
            </div>
          )}
        </main>

        {/* At the frame, not inside a screen: the bell is in the navbar, so the panel it opens
            has to exist on every route the navbar does. */}
        <Sheet
          open={alertsOpen}
          title="Notifikasi Stok"
          description={
            inventory.notifications.length > 0
              ? `${inventory.notifications.length} barang menyentuh atau melewati batas minimum.`
              : undefined
          }
          onClose={() => setAlertsOpen(false)}
        >
          {inventory.notifications.length === 0 ? (
            <div class="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50/60 px-4 py-3">
              <CircleCheck class="h-5 w-5 shrink-0 text-green-600" />
              <p class="text-sm text-green-800">Semua stok aman.</p>
            </div>
          ) : (
            <StockAlerts
              notifications={inventory.notifications}
              derived={inventory.derived}
              categoryNameOf={(id) => draft.categories.find((c) => c.categoryId === id)?.name ?? ''}
              now={now}
              onOpenItem={(id) => { setAlertsOpen(false); navigate({ name: 'item', id }); }}
            />
          )}
        </Sheet>

        <MovementSheet
          target={moving}
          derived={moving ? inventory.derived.items[moving.item.itemId] : undefined}
          locations={draft.locations}
          /* Appended, never edited: the stock number is folded back out of this log, so a
             movement is a new fact rather than a correction of the old one. */
          onCommit={(txn) => { draft.setTxns((prev) => [...prev, txn]); setMoving(null); }}
          onClose={() => setMoving(null)}
        />
      </div>

      <BottomNav
        route={route}
        tabs={[
          // Four tabs plus the scan button. Printing labels is a desk job and lives in the
          // sidebar; putting it here would cost a thumb-sized slot for something nobody does
          // while standing at a shelf.
          { name: 'Beranda', short: 'Beranda', icon: LayoutDashboard, route: { name: 'beranda' }, badge: inventory.notifications.length },
          { name: 'Opname Gudang', short: 'Opname', icon: ClipboardList, route: { name: 'opname' } },
          { name: 'Peta Rak', short: 'Rak', icon: MapPin, route: { name: 'racks' } },
          { name: 'Stok Sekarang', short: 'Stok', icon: Package, route: { name: 'board' } },
        ]}
        onNavigate={navigate}
        onScan={() => go({ name: 'pindai' })}
      />
    </div>
  );
}
