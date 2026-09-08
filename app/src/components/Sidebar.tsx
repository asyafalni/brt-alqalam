// Ported from SmartInv `frontend/components/Sidebar.tsx`. Class strings are that file's,
// verbatim (see docs/SMARTINV-REUSE-MAP.md §4.2 for line references).
//
// Two deliberate departures:
//  - No `useAuth` import. The template's Sidebar reads a user and renders a sign-out; on a
//    kiosk nobody is signed in, so that block is dropped rather than faked.
//  - Framer's spring width animation and `layoutId` shared-layout pill become CSS transitions.
//    @octanejs/motion is not a dependency yet, and its `layoutId` is single-element FLIP rather
//    than a full projection tree (OCTANE-FINDINGS.md). Static appearance is identical.
//
// ON A PHONE THIS IS A DIALOG. An accessibility audit found it failing every part of that: eight
// controls left in the tab order while it sat off-screen, no focus trap, no Escape, no scroll
// lock. It now uses the same `useDialog` as `Sheet`, and closed it goes `invisible` rather than
// merely translated — `visibility: hidden` is what actually takes its controls out of the tab
// order, and unlike unmounting it keeps the slide-out, because `visibility` is transitionable
// and so flips only once the panel has finished leaving.

import { useRef } from 'octane';
import { ChartColumn, ChevronLeft, ChevronRight, ClipboardList, History, LayoutDashboard, MapPin, Package, QrCode, ShieldCheck, ShoppingCart, Wrench } from '@octanejs/lucide';
import type { Route } from '../state/route';
import { Logo } from './Logo';
import { useDialog } from './useDialog';

interface NavItem { name: string; icon: typeof Package; route: Route; badge?: number }

interface Props {
  route: Route;
  collapsed: boolean;
  isMobile: boolean;
  itemCount: number;
  alertCount: number;
  rackCount: number;
  assetIssues: number;
  requestCount: number;
  onNavigate: (route: Route) => void;
  onClose: () => void;
  /** Desktop only: narrow the rail to icons, or widen it back. */
  onToggle: () => void;
  /** Whether this device is reading from the shared spreadsheet. */
  connected: boolean;
  /** Set when the register is being shown but could not be refreshed. */
  stale?: boolean;
  /** Movements recorded on this device but not yet in the sheet. */
  queued?: number;
  /** False when this device is connected only to read — the takmir's phone, say. */
  canRecord?: boolean;
  onOpenConnection: () => void;
}

export function Sidebar(p: Props) {
  const panel = useRef<HTMLDivElement | null>(null);
  const asDialog = p.isMobile && !p.collapsed;
  useDialog(asDialog, p.onClose, panel);

  const items: NavItem[] = [
    { name: 'Beranda', icon: LayoutDashboard, route: { name: 'beranda' } },
    { name: 'Opname Gudang', icon: ClipboardList, route: { name: 'opname' } },
    { name: 'Peta Rak', icon: MapPin, route: { name: 'racks' }, badge: p.rackCount },
    { name: 'Stok', icon: Package, route: { name: 'board' }, badge: p.alertCount },
    { name: 'Aset', icon: Wrench, route: { name: 'aset' }, badge: p.assetIssues },
    // The badge IS the notification, for now. A push to the admin's phone is a gateway job
    // (§35), and until that exists the honest version is putting the count where they already
    // look — silently holding requests until somebody thinks to check would be worse than not
    // having the screen.
    { name: 'Pengajuan', icon: ShoppingCart, route: { name: 'pengajuan' }, badge: p.requestCount },
    { name: 'Cetak Label', icon: QrCode, route: { name: 'label' }, badge: p.itemCount },
    // Below Laporan: the report is the summary somebody reads, this is the raw record they
    // drop to when the summary looks wrong.
    { name: 'Laporan', icon: ChartColumn, route: { name: 'laporan' } },
    { name: 'Histori Data', icon: History, route: { name: 'histori' } },
    /* Last, and the only entry that leads anywhere a marbot has no business going. It stays in
       the list rather than hiding behind a gesture: an admin has to be able to FIND it, and
       hiding it would protect nothing — the password is what protects it, and tapping through
       to a sign-in form costs a curious marbot ten seconds and teaches them it is not for them. */
    { name: 'Admin', icon: ShieldCheck, route: { name: 'admin' } },
  ];

  /*
   * One place decides what the footer says, because the four states are ranked and the ranking
   * is the point: an unsent movement outranks everything, since it is the only state where the
   * register on screen and the register in the sheet genuinely disagree.
   */
  const status = p.queued
    ? {
      dot: 'bg-amber-400',
      tone: 'text-amber-300',
      title: `${p.queued} belum terkirim`,
      hint: 'Ketuk untuk mengirim',
      aria: `${p.queued} catatan belum terkirim ke spreadsheet. Ketuk untuk mengirim.`,
    }
    : !p.connected
      ? {
        dot: 'bg-slate-600',
        tone: 'text-slate-300',
        title: 'Belum terhubung',
        hint: 'Ketuk untuk menyambungkan',
        aria: 'Belum terhubung ke gateway. Ketuk untuk menyambungkan perangkat ini.',
      }
      : p.stale
        ? {
          dot: 'bg-amber-400',
          tone: 'text-amber-300',
          title: 'Tersambung',
          hint: 'Data mungkin tertinggal',
          aria: 'Tersambung, tetapi data terakhir gagal diperbarui.',
        }
        : {
          dot: 'bg-green-400',
          tone: 'text-slate-200',
          title: 'Tersambung',
          /* Which of the two this device is, said plainly. A viewer that has quietly lost its
             Ambil buttons should be able to see WHY without opening anything. */
          hint: p.canRecord ? 'Bisa mencatat' : 'Hanya melihat',
          aria: p.canRecord
            ? 'Tersambung ke gateway. Perangkat ini bisa mencatat pengambilan.'
            : 'Tersambung ke gateway. Perangkat ini hanya membaca — tidak bisa mencatat.',
        };

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
        ref={panel}
        role={asDialog ? 'dialog' : undefined}
        aria-modal={asDialog ? 'true' : undefined}
        aria-label={asDialog ? 'Menu' : undefined}
        tabIndex={asDialog ? -1 : undefined}
        class={
          'no-print fixed inset-y-0 left-0 z-50 h-full outline-none '
          + 'transition-[width,transform,visibility] duration-300 ease-out '
          + 'md:visible md:sticky md:top-4 md:m-4 md:mr-0 md:h-[calc(100vh-32px)] md:shrink-0 '
          + (p.isMobile && p.collapsed ? '-translate-x-full invisible' : 'translate-x-0 visible')
        }
        style={`width:${width}`}
      >
        {/* On the panel's EDGE, not in its header: collapsed the rail is 90px and the header is
            already a 44px logo tile, so a button beside it would be the cramped half of a
            cramped row. Here it stays the same size and in the same place at both widths, which
            is what makes it findable a second time.

            A child of the OUTER element, because the panel inside clips its overflow — hung
            there, the half that sticks out would simply be cut off. */}
        <button
          type="button"
          class="absolute -right-3 top-24 z-10 hidden h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 shadow-md transition-colors hover:border-slate-900 hover:text-slate-900 md:flex"
          aria-label={p.collapsed ? 'Lebarkan menu' : 'Ciutkan menu'}
          aria-expanded={!p.collapsed}
          title={p.collapsed ? 'Lebarkan menu' : 'Ciutkan menu'}
          onClick={p.onToggle}
        >
          {p.collapsed ? <ChevronRight class="h-4 w-4" /> : <ChevronLeft class="h-4 w-4" />}
        </button>

        <div
          class="relative flex h-full flex-col overflow-hidden border-r border-white/10 bg-slate-900/95
                 backdrop-blur-xl md:rounded-[32px] md:border md:shadow-2xl"
        >
          <div class="relative z-10 mb-4 flex shrink-0 items-center justify-between p-6">
            <div class="flex items-center gap-3">
              {/* The masjid's own mark, not a generic warehouse glyph. The tile stays white
                  because the logo is a white-field star: dropped straight onto the black
                  panel its outline would be the only part still visible. */}
              <div
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white
                       transition-transform hover:rotate-12 hover:scale-110"
              >
                <Logo size={34} />
              </div>
              {showText && (
                <span class="whitespace-nowrap text-xl font-bold tracking-tight text-white">
                  BRT Al-Qalam
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

          <div class="relative z-10 mt-auto border-t border-white/5 p-3">
            {/* A ROW, not an underlined sentence. It was two wrapped lines of link text in a
                90px-to-260px column: it neither looked like a control nor read as a status, and
                the one question it exists to answer — "am I connected, and what do I do about
                it?" — took two readings. A dot, a short line, and a chevron answer it at a
                glance, and the whole row is the target. */}
            <button
              type="button"
              class={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/5 ${showText ? '' : 'justify-center'}`}
              aria-label={status.aria}
              title={status.aria}
              onClick={p.onOpenConnection}
            >
              {/* Collapsed to 90px this dot is the ENTIRE indicator, which is why the colour
                  carries the meaning rather than merely decorating the words. */}
              <span class={`h-2.5 w-2.5 shrink-0 rounded-full ${status.dot}`} aria-hidden="true" />
              {showText && (
                <>
                  <span class="min-w-0 flex-1">
                    <span class={`block truncate text-xs font-semibold ${status.tone}`}>
                      {status.title}
                    </span>
                    <span class="block truncate text-[11px] text-slate-500">{status.hint}</span>
                  </span>
                  <ChevronRight class="h-4 w-4 shrink-0 text-slate-600" />
                </>
              )}
            </button>

            {showText && (
              <p class="mt-2 px-2.5 text-[10px] font-bold uppercase tracking-tighter text-slate-600">
                Masjid Al-Qalam
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
