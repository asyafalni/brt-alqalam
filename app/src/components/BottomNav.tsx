// Mobile navigation — a bottom tab bar, not the sidebar drawer.
//
// The sidebar is SmartInv's, and it is right on a desktop. On a phone held one-handed in a
// gudang it is wrong twice over: the trigger sits in the top-left, the furthest point from a
// thumb, and opening it covers the screen you were reading. A bottom bar puts every
// destination inside the thumb arc, which is the whole point on a device someone is holding
// while also holding a mop.

import type { Route } from '../state/route';

interface Tab {
  name: string;
  short: string;
  icon: (props: { class?: string }) => unknown;
  route: Route;
  badge?: number;
}

export function BottomNav(
  { route, tabs, onNavigate }:
  { route: Route; tabs: Tab[]; onNavigate: (route: Route) => void },
) {
  return (
    <nav
      class="no-print fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md md:hidden"
      /* Clears the iOS home indicator, so the last tab is not sitting under it. */
      style="padding-bottom:env(safe-area-inset-bottom)"
      aria-label="Navigasi utama"
    >
      <div class="mx-auto flex max-w-lg items-stretch">
        {tabs.map((tab) => {
          const active = tab.route.name === route.name;
          return (
            <button
              key={tab.name}
              type="button"
              aria-current={active ? 'page' : undefined}
              aria-label={tab.name}
              class={
                'relative flex min-h-touch flex-1 flex-col items-center justify-center gap-0.5 py-2 ' +
                'transition-colors ' + (active ? 'text-sky-500' : 'text-slate-400')
              }
              onClick={() => onNavigate(tab.route)}
            >
              {active && (
                <span class="absolute inset-x-3 top-0 h-0.5 rounded-full bg-sky-500" aria-hidden="true" />
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
        })}
      </div>
    </nav>
  );
}
