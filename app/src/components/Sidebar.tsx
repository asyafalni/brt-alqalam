// Ported from SmartInv `frontend/components/Sidebar.tsx`. Class strings are that file's,
// verbatim (see docs/SMARTINV-REUSE-MAP.md §4.2 for line references).
//
// Two deliberate departures:
//  - No `useAuth` import. The template's Sidebar reads a user and renders a sign-out; on a
//    kiosk nobody is signed in, so that block is dropped rather than faked.
//  - Framer's spring width animation and `layoutId` shared-layout pill become CSS transitions.
//    @octanejs/motion is not a dependency yet, and its `layoutId` is single-element FLIP rather
//    than a full projection tree (OCTANE-FINDINGS.md). Static appearance is identical.

import { ChevronRight, ClipboardList, MapPin, Package, QrCode, Warehouse } from '@octanejs/lucide';
import type { Route } from '../state/route';

interface NavItem { name: string; icon: typeof Package; route: Route; badge?: number }

interface Props {
  route: Route;
  collapsed: boolean;
  isMobile: boolean;
  itemCount: number;
  alertCount: number;
  rackCount: number;
  onNavigate: (route: Route) => void;
  onClose: () => void;
}

export function Sidebar(p: Props) {
  const items: NavItem[] = [
    { name: 'Opname Gudang', icon: ClipboardList, route: { name: 'opname' } },
    { name: 'Peta Rak', icon: MapPin, route: { name: 'racks' }, badge: p.rackCount },
    { name: 'Stok', icon: Package, route: { name: 'board' }, badge: p.alertCount },
    { name: 'Cetak Label', icon: QrCode, route: { name: 'label' }, badge: p.itemCount },
  ];

  const width = p.isMobile ? '280px' : p.collapsed ? '90px' : '260px';
  const showText = !p.collapsed || p.isMobile;

  return (
    <>
      {p.isMobile && !p.collapsed && (
        <div
          class="fixed inset-0 z-[45] bg-slate-900/60 backdrop-blur-sm"
          onClick={p.onClose}
          aria-hidden="true"
        />
      )}

      <div
        class={
          'no-print fixed inset-y-0 left-0 z-50 h-full transition-[width,transform] duration-300 ease-out ' +
          'md:sticky md:top-4 md:m-4 md:mr-0 md:h-[calc(100vh-32px)] md:shrink-0 ' +
          (p.isMobile && p.collapsed ? '-translate-x-full' : 'translate-x-0')
        }
        style={`width:${width}`}
      >
        <div
          class="relative flex h-full flex-col overflow-hidden border-r border-white/10 bg-slate-900/95
                 backdrop-blur-xl md:rounded-[32px] md:border md:shadow-2xl"
        >
          <div class="relative z-10 mb-4 flex shrink-0 items-center justify-between p-6">
            <div class="flex items-center gap-3">
              <div
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-50
                       transition-transform hover:rotate-12 hover:scale-110"
              >
                <Warehouse class="h-6 w-6 text-slate-900" />
              </div>
              {showText && (
                <span class="whitespace-nowrap text-xl font-bold tracking-tight text-white">
                  BRT Inventaris
                </span>
              )}
            </div>
            {p.isMobile && (
              <button type="button" class="p-2 text-slate-400" onClick={p.onClose} aria-label="Tutup menu">
                <ChevronRight class="h-5 w-5 rotate-180" />
              </button>
            )}
          </div>

          <nav class="custom-scrollbar relative z-10 flex-1 space-y-2 overflow-y-auto overflow-x-hidden px-3">
            {items.map((item) => {
              const active = item.route.name === p.route.name;
              return (
                <button
                  key={item.name}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  class={
                    'group relative flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 transition-all ' +
                    (active ? 'text-white' : 'text-slate-400 hover:text-slate-200') +
                    (p.collapsed && !p.isMobile ? ' justify-center' : '')
                  }
                  onClick={() => p.onNavigate(item.route)}
                >
                  {active && (
                    <span class="absolute inset-0 z-0 rounded-2xl border-l-4 border-slate-50 bg-white/10" />
                  )}
                  <item.icon
                    class={
                      'relative z-10 h-5 w-5 shrink-0 transition-transform group-hover:scale-110 ' +
                      (active ? 'text-slate-50' : '')
                    }
                  />
                  {showText && (
                    <span class="relative z-10 whitespace-nowrap text-sm font-semibold">{item.name}</span>
                  )}
                  {showText && item.badge ? (
                    <span class="relative z-10 ml-auto rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold tabular-nums text-slate-300">
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>

          <div class="relative z-10 mt-auto border-t border-white/5 p-4">
            <p class="px-2 text-[10px] font-bold uppercase tracking-tighter text-slate-500">
              Masjid Al-Qalam
            </p>
            {showText && (
              <p class="px-2 text-[11px] text-slate-600">Belum terhubung ke gateway</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
