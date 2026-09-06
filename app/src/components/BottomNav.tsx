// Mobile navigation — a bottom tab bar, not the sidebar drawer.
//
// The sidebar is SmartInv's, and it is right on a desktop. On a phone held one-handed in a
// gudang it is wrong twice over: the trigger sits in the top-left, the furthest point from a
// thumb, and opening it covers the screen you were reading. A bottom bar puts every
// destination inside the thumb arc, which is the whole point on a device someone is holding
// while also holding a mop.

import { ScanLine } from '@octanejs/lucide';
import type { Route } from '../state/route';

interface Tab {
  name: string;
  short: string;
  icon: (props: { class?: string }) => unknown;
  route: Route;
  badge?: number;
}

export function BottomNav(
  { route, tabs, onNavigate, onScan }:
  { route: Route; tabs: Tab[]; onNavigate: (route: Route) => void; onScan: () => void },
) {
  // The scanner sits in the middle, raised — it is the one action taken while standing at a
  // shelf holding something, and the centre is the easiest point in the thumb arc to hit
  // without looking.
  const half = Math.ceil(tabs.length / 2);
  return (
    <nav
      class="no-print fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md md:hidden"
      /* Clears the iOS home indicator, so the last tab is not sitting under it. */
      style="padding-bottom:env(safe-area-inset-bottom)"
      aria-label="Navigasi utama"
    >
      <div class="mx-auto flex max-w-lg items-stretch">
        {tabs.map((tab, index) => {
          const active = tab.route.name === route.name;
          return (
            <button
              key={tab.name}
              type="button"
              aria-current={active ? 'page' : undefined}
              aria-label={tab.name}
              class={
                'relative flex min-h-touch flex-1 flex-col items-center justify-center gap-0.5 py-2 ' +
                'transition-colors ' + (active ? 'text-slate-900' : 'text-slate-400')
              }
              onClick={() => onNavigate(tab.route)}
            >
              {active && (
                <span class="absolute inset-x-3 top-0 h-0.5 rounded-full bg-slate-900" aria-hidden="true" />
              )}
              <span class="relative">
                <tab.icon class="h-5 w-5" />
                {tab.badge ? (
                  <span class="absolute -right-2 -top-1 min-w-4 rounded-full bg-amber-500 px-1 text-[9px] font-bold leading-4 text-white">
                    {tab.badge}
                  </span>
                ) : null}
              </span>
              <span class="text-[10px] font-semibold">{tab.short}</span>
            </button>
          );
        }).flatMap((node, index) => (index === half - 1
          ? [node, (
            <button
              key="scan"
              type="button"
              class="relative -mt-6 mx-1 flex h-14 w-14 shrink-0 items-center justify-center self-center rounded-full bg-slate-900 text-slate-50 shadow-lg"
              onClick={onScan}
              aria-label="Pindai QR"
            >
              <ScanLine class="h-6 w-6" />
            </button>
          )]
          : [node]))}
      </div>
    </nav>
  );
}
