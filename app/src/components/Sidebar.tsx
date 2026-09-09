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
import { ChartColumn, ChevronLeft, ChevronRight, ClipboardList, History, LayoutDashboard, MapPin, Package, QrCode, ShieldCheck, ShieldOff, ShoppingCart, Wrench } from '@octanejs/lucide';
import type { Route } from '../state/route';
import { Logo } from './Logo';
import { useDialog } from './useDialog';

interface NavItem { name: string; icon: typeof Package; route: Route; badge?: number }

/**
 * How wide the rail is, in px — the one place that decides it.
 *
 * Exported because the footer's flyouts have to open just past its right edge, and a second copy
 * of these three numbers somewhere else would drift the moment one of them changed.
 */
export const railWidth = (isMobile: boolean, collapsed: boolean) =>
  (isMobile ? 280 : collapsed ? 90 : 260);

/** Where that edge actually is, including the 16px margin the rail carries on desktop. */
export const railRightEdge = (isMobile: boolean, collapsed: boolean) =>
  railWidth(isMobile, collapsed) + (isMobile ? 0 : 16) + 8;

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
  /** Who is signed in as an admin, if anyone. Also decides which nav items exist. */
  admin?: { name: string; role: string } | null;
  onOpenConnection: () => void;
  onOpenAdmin: () => void;
}

export function Sidebar(p: Props) {
  const panel = useRef<HTMLDivElement | null>(null);
  const asDialog = p.isMobile && !p.collapsed;
  useDialog(asDialog, p.onClose, panel);

  /*
   * Hidden on the SHARED register when nobody is signed in — not on a device working offline.
   *
   * The two screens name people, so on the gateway they are admin-only and the gateway already
   * withholds their data (§39). But an unconnected device is the stock-take walk (§59 stage 1):
   * everything on it is this phone's own draft, roles do not exist yet, and hiding them there
   * would take function away from the one mode that has no accounts at all.
   */
  const canSeeNames = !p.connected || p.admin?.role === 'admin' || p.admin?.role === 'admin_utama';

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
    /* ADMIN ONLY, both of them, and for the same reason: they are the two screens that name
       people. Pengajuan carries who asked and who decided; Histori Data carries PENGAMBIL on
       every row. The gateway already withholds that data from a device without an admin token
       (§39), so leaving the menu items visible would advertise two destinations that can only
       ever be empty — which reads as the register having lost something. */
    ...(canSeeNames ? [{
      name: 'Pengajuan', icon: ShoppingCart, route: { name: 'pengajuan' } as Route,
      badge: p.requestCount,
    }] : []),
    { name: 'Cetak Label', icon: QrCode, route: { name: 'label' }, badge: p.itemCount },
    // Below Laporan: the report is the summary somebody reads, this is the raw record they
    // drop to when the summary looks wrong.
    { name: 'Laporan', icon: ChartColumn, route: { name: 'laporan' } },
    ...(canSeeNames ? [{ name: 'Histori Data', icon: History, route: { name: 'histori' } as Route }] : []),
    /* No `Admin` entry here. It moved to the footer beside the gateway connection, which is
       where it belongs — both are facts about THIS DEVICE rather than places in the register,
       and both now open the same kind of flyout. Leaving a nav item as well would be two doors
       to one room, which §82 spends a whole Part arguing against. */
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
          /* NO SECOND LINE, and this is the only state without one.
             It used to read "Bisa mencatat", which stopped being news once a phone number
             became a way in: any connected device can record, given a registered person and
             their PIN. A line that is true of every device in every state tells nobody
             anything, and it made the one state needing no attention as loud as the three that
             do. The others keep their hint because each names something to DO — send the
             queue, reconnect, or distrust the numbers. */
          hint: '',
          aria: 'Tersambung ke gateway. Ketuk untuk mengatur sambungan.',
        };

  const width = `${railWidth(p.isMobile, p.collapsed)}px`;
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
          class="absolute -right-3 top-24 z-10 hidden h-7 w-7 items-center justify-center rounded-full border border-slate-500 bg-white text-slate-600 shadow-md transition-colors hover:border-slate-900 hover:text-slate-900 md:flex"
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
                    {status.hint && (
                      <span class="block truncate text-[11px] text-slate-400">{status.hint}</span>
                    )}
                  </span>
                  <ChevronRight class="h-4 w-4 shrink-0 text-slate-600" />
                </>
              )}
            </button>

            {/* The SECOND fact this footer carries, and it needed its own row rather than being
                folded into the first: "connected to the sheet" and "signed in as an admin" are
                different questions with different answers and different fixes. Somebody who
                lands on the dashboard and finds they cannot edit anything should be able to see
                why from here, and get to the door in one tap. */}
            <button
              type="button"
              class={`mt-1 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/5 ${showText ? '' : 'justify-center'}`}
              aria-label={p.admin
                ? `Masuk sebagai ${p.admin.name || 'admin'}, peran ${p.admin.role}. Ketuk untuk keluar.`
                : 'Belum masuk sebagai admin. Ketuk untuk masuk dan bisa mengubah katalog.'}
              title={p.admin
                ? `${p.admin.name || 'Admin'} — ${p.admin.role}`
                : 'Belum masuk sebagai admin'}
              onClick={p.onOpenAdmin}
            >
              {p.admin
                ? <ShieldCheck class="h-3.5 w-3.5 shrink-0 text-green-400" />
                : <ShieldOff class="h-3.5 w-3.5 shrink-0 text-slate-600" />}
              {showText && (
                <>
                  <span class="min-w-0 flex-1">
                    <span class={`block truncate text-xs font-semibold ${p.admin ? 'text-slate-200' : 'text-slate-300'}`}>
                      {p.admin ? (p.admin.name || 'Admin') : 'Belum masuk'}
                    </span>
                    <span class="block truncate text-[11px] text-slate-400">
                      {p.admin ? p.admin.role : 'Ketuk untuk masuk sebagai admin'}
                    </span>
                  </span>
                  <ChevronRight class="h-4 w-4 shrink-0 text-slate-600" />
                </>
              )}
            </button>

            {showText && (
              <p class="mt-2 px-2.5 text-[10px] font-bold uppercase tracking-tighter text-slate-400">
                Masjid Al-Qalam
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
