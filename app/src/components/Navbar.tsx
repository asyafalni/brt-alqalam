// Ported from SmartInv `frontend/components/Navbar.tsx` (see reuse map §4.3).
//
// Departures: no `useAuth` user chip (nobody is signed in on a kiosk), and the notification
// bell is BOUND to Notifikasi Stok. In the template the bell's unread dot is always rendered
// and wired to nothing (`Navbar.tsx:47-53`) — carrying that over would ship a permanent red
// dot that means nothing.

import { Bell, Menu, ScanLine, Search } from '@octanejs/lucide';

interface Props {
  search: string;
  alertCount: number;
  onSearch: (value: string) => void;
  onToggleSidebar: () => void;
  onShowAlerts: () => void;
  onScan: () => void;
}

export function Navbar(p: Props) {
  return (
    <header class="no-print sticky top-0 z-40 flex h-20 shrink-0 items-center justify-between gap-4 border-b border-slate-200/50 bg-white/80 px-4 backdrop-blur-md md:px-8">
      <button
        type="button"
        class="rounded-2xl border border-slate-100 bg-white p-3 text-slate-500 shadow-sm transition-transform active:scale-90 md:hidden"
        onClick={p.onToggleSidebar}
        aria-label="Buka menu"
      >
        <Menu class="h-5 w-5" />
      </button>

      <div class="hidden w-72 items-center gap-3 rounded-[20px] border border-white bg-white/60 px-5 py-3 shadow-sm backdrop-blur-md focus-within:border-slate-900/40 focus-within:ring-4 focus-within:ring-slate-900/5 sm:flex md:w-96">
        <Search class="h-4 w-4 shrink-0 text-slate-400" />
        <input
          class="w-full border-none bg-transparent text-sm outline-none placeholder:text-slate-400"
          value={p.search}
          placeholder="Cari barang…"
          aria-label="Cari barang"
          onInput={(e: Event) => p.onSearch((e.target as HTMLInputElement).value)}
        />
      </div>

      {/* Hidden on mobile, where the raised centre button in the bottom bar owns this. */}
      <button
        type="button"
        class="ml-auto hidden items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-slate-50 shadow-sm md:flex"
        onClick={p.onScan}
      >
        <ScanLine class="h-5 w-5" />
        Pindai
      </button>

      <button
        type="button"
        class="relative rounded-2xl border border-slate-100 bg-white p-3 text-slate-500 shadow-sm transition-transform hover:-translate-y-0.5"
        onClick={p.onShowAlerts}
        aria-label={
          p.alertCount > 0 ? `${p.alertCount} barang menipis` : 'Tidak ada notifikasi stok'
        }
      >
        <Bell class="h-5 w-5" />
        {/* Unlike the template's, this dot only appears when something is actually low. */}
        {p.alertCount > 0 && (
          <span class="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500" />
        )}
      </button>
    </header>
  );
}
