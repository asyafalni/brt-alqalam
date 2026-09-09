// Ported from SmartInv `frontend/components/Navbar.tsx` (see reuse map §4.3).
//
// Departures: no `useAuth` user chip (nobody is signed in on a kiosk), and the notification
// bell is BOUND to Notifikasi Stok. In the template the bell's unread dot is always rendered
// and wired to nothing (`Navbar.tsx:47-53`) — carrying that over would ship a permanent red
// dot that means nothing.

import { Bell, Menu, ScanLine, Search, X } from '@octanejs/lucide';

interface Props {
  search: string;
  alertCount: number;
  onSearch: (value: string) => void;
  onToggleSidebar: () => void;
  onShowAlerts: () => void;
  onScan: () => void;
  /** Alerts on screens that live only in the drawer on a phone. */
  drawerAlerts: number;
}

export function Navbar(p: Props) {
  // The bar takes the PAGE's ground, not white. SmartInv's header is near-white because its
  // page is near-white too; ours is a warm beige (§66), so a white bar sat on top of it as a
  // separate pale strip — three grounds stacked down the screen (black rail, white bar, beige
  // page) with nothing explaining the middle one. Same colour as the page, slightly
  // translucent with a blur so content scrolling under it stays legible, and a hairline to
  // separate the two once it does.
  return (
    <header class="no-print sticky top-0 z-40 flex h-20 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-slate-50/85 px-4 backdrop-blur-md md:px-8">
      {/* Aset, Laporan and Cetak Label live only in the drawer on a phone, so a problem on
          one of them would otherwise be invisible until someone happened to open it. */}
      <button
        type="button"
        class="relative rounded-full border border-slate-500 bg-white p-3 text-slate-600 transition-transform active:scale-90 md:hidden"
        onClick={p.onToggleSidebar}
        aria-label={p.drawerAlerts > 0 ? `Buka menu — ${p.drawerAlerts} perlu diurus` : 'Buka menu'}
      >
        <Menu class="h-5 w-5" />
        {p.drawerAlerts > 0 && (
          <span class="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-orange-500" />
        )}
      </button>

      {/* White on the beige bar, the same way every card on the page is white on beige — so
          the field reads as the one place you can type rather than as a differently-tinted
          patch of header. `slate-400` on the border, not a hairline: a form field's boundary
          has to clear 3:1 (WCAG 1.4.11), and white-on-beige is 1.28:1 by itself. */}
      {/* Shown on a PHONE too, which it was not: it sat behind `hidden sm:flex`, so the one
          device the gudang actually runs on had no way to search at all — and "where is the
          soap" is the question §0 says this whole register exists to answer. It takes the
          leftover width there and its fixed sizes only from `sm` up. */}
      <div class="flex min-w-0 flex-1 items-center gap-3 rounded-full border border-slate-500 bg-white px-4 py-3 transition-colors focus-within:border-slate-900 focus-within:ring-4 focus-within:ring-slate-900/10 sm:w-72 sm:flex-none sm:px-5 md:w-96">
        <Search class="h-4 w-4 shrink-0 text-slate-400" />
        <input
          class="w-full min-w-0 border-none bg-transparent text-sm outline-none placeholder:text-slate-400"
          value={p.search}
          placeholder="Cari barang atau rak…"
          aria-label="Cari barang atau rak"
          onInput={(e: Event) => p.onSearch((e.target as HTMLInputElement).value)}
          /* Escape clears, because the results replace the page: the way out has to be under
             the hand that is already on the keyboard, not only on a button further down. */
          onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Escape') p.onSearch(''); }}
        />
        {p.search !== '' && (
          <button
            type="button"
            class="-mr-1 shrink-0 rounded-full p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            onClick={() => p.onSearch('')}
            aria-label="Hapus pencarian"
          >
            <X class="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Hidden on mobile, where the raised centre button in the bottom bar owns this.
          `ml-auto` keeps it beside the bell: from `sm` up the search field goes back to a fixed
          width, so without it `justify-between` shares out the slack and strands this in the
          middle of the bar with nothing on either side of it. */}
      <button
        type="button"
        class="ml-auto hidden items-center gap-2 rounded-full bg-slate-900 px-5 py-3 font-semibold text-slate-50 md:flex"
        onClick={p.onScan}
      >
        <ScanLine class="h-5 w-5" />
        Pindai
      </button>

      <button
        type="button"
        class="relative rounded-full border border-slate-500 bg-white p-3 text-slate-600 transition-transform hover:-translate-y-0.5"
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
