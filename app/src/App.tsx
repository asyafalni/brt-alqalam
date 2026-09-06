import { useEffect, useMemo, useState } from 'octane';
import { ClipboardList, MapPin, Package, QrCode } from '@octanejs/lucide';
import { Sidebar } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { BottomNav } from './components/BottomNav';
import { Card } from './components/ui';
import { RackBoard } from './features/racks/RackBoard';
import { useDraft } from './state/useDraft';
import { useInventory } from './state/useInventory';
import { useRoute } from './state/useRoute';
import { StockTake } from './features/stocktake/StockTake';
import { LabelSheet } from './features/labels/LabelSheet';
import { Board } from './features/board/Board';
import { ScanResult } from './features/scan/ScanResult';

export function App() {
  // One draft, shared. Two screens each loading from storage would be two sources of truth,
  // and the label sheet would quietly print a stale count.
  const draft = useDraft();
  const [route, go] = useRoute();
  const [search, setSearch] = useState('');

  // Pinned per mount: `deriveState` is a pure function of `now`, so a moving clock would
  // recompute the whole fold on every keystroke.
  const now = useMemo(() => Date.now(), []);
  const inventory = useInventory(draft, now);

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

  return (
    // SmartInv App.tsx:67 — the app frame.
    <div class="flex h-screen bg-slate-50 font-sans">
      {/* App.tsx:69-70 — decorative background glow. */}
      <div class="pointer-events-none fixed right-[-5%] top-[-10%] h-[40%] w-[40%] rounded-full bg-sky-200/20 blur-[120px]" />
      <div class="pointer-events-none fixed bottom-[-10%] left-[-5%] h-[40%] w-[40%] rounded-full bg-blue-200/10 blur-[120px]" />

      <Sidebar
        route={route}
        collapsed={collapsed}
        isMobile={isMobile}
        itemCount={draft.items.length}
        alertCount={inventory.notifications.length}
        rackCount={draft.locations.length}
        onNavigate={navigate}
        onClose={() => setCollapsed(true)}
      />

      {/* App.tsx:74-77 — content column. */}
      <div class="relative flex min-w-0 flex-1 flex-col">
        <Navbar
          search={search}
          alertCount={inventory.notifications.length}
          onSearch={setSearch}
          onToggleSidebar={() => setCollapsed(!collapsed)}
          onShowAlerts={() => navigate({ name: 'board' })}
        />

        {/* pb-24 on mobile keeps the last row clear of the bottom bar. */}
        <main class="custom-scrollbar relative z-10 flex-1 overflow-y-auto px-4 pb-24 md:px-8 md:pb-8">
          {route.name === 'opname' && (
            <StockTake draft={draft} search={search} onSearch={setSearch} />
          )}
          {route.name === 'board' && (
            <Board items={draft.items} categories={draft.categories} inventory={inventory} search={search} />
          )}
          {route.name === 'racks' && (
            <RackBoard
              items={draft.items}
              categories={draft.categories}
              locations={draft.locations}
              inventory={inventory}
              search={search}
            />
          )}
          {route.name === 'label' && (
            <LabelSheet items={draft.items} categories={draft.categories} locations={draft.locations} />
          )}
          {route.name === 'scan' && (
            <ScanResult
              target={route.target}
              id={route.id}
              items={draft.items}
              categories={draft.categories}
              locations={draft.locations}
              inventory={inventory}
              now={now}
              onBack={() => navigate({ name: 'opname' })}
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
                  class="min-h-touch rounded-lg bg-[#38BDF8] px-6 font-semibold text-white hover:bg-[#0EA5E9]"
                  onClick={() => navigate({ name: 'opname' })}
                >
                  Buka Opname Gudang
                </button>
              </Card>
            </div>
          )}
        </main>
      </div>

      <BottomNav
        route={route}
        tabs={[
          { name: 'Opname Gudang', short: 'Opname', icon: ClipboardList, route: { name: 'opname' } },
          { name: 'Peta Rak', short: 'Rak', icon: MapPin, route: { name: 'racks' } },
          { name: 'Stok Sekarang', short: 'Stok', icon: Package, route: { name: 'board' }, badge: inventory.notifications.length },
          { name: 'Cetak Label', short: 'Label', icon: QrCode, route: { name: 'label' } },
        ]}
        onNavigate={navigate}
      />
    </div>
  );
}
