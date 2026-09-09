import { lazy, Suspense, useEffect, useMemo, useState } from 'octane';
import { CircleCheck, ClipboardList, LayoutDashboard, MapPin, Package, TriangleAlert } from '@octanejs/lucide';
import { Sidebar, railRightEdge } from './components/Sidebar';
import { Flyout } from './components/Flyout';
import { ConnectionLost, RegisterLoading, TopProgress } from './components/Progress';
import { Navbar } from './components/Navbar';
import { BottomNav } from './components/BottomNav';
import { Card, PageHeader } from './components/ui';
import { Sheet } from './components/Sheet';
import { Flash } from './components/Flash';
import type { FlashMessage } from './components/Flash';
import { StockAlerts } from './features/alerts/StockAlerts';
import { openRequests } from '../../domain/requests';
import { mergeTxns, unsettled } from './state/txns';
import { useNow } from './state/useNow';
import { RackBoard } from './features/racks/RackBoard';
import { Dashboard } from './features/dashboard/Dashboard';
import { ItemDetail } from './features/items/ItemDetail';
import { AssetBoard } from './features/assets/AssetBoard';
import { LoanSheet } from './features/movement/LoanSheet';
import type { LoanTarget } from './features/movement/LoanSheet';
import { InspectSheet } from './features/movement/InspectSheet';
import type { InspectTarget } from './features/movement/InspectSheet';
import { Finder } from './features/search/Finder';

// Split at the route, because these two carry the app's only heavy dependencies and neither is
// on the path anyone opens first. The label sheet pulls a QR *encoder* (~43kB) and the scanner
// pulls a QR *decoder* on browsers without a native one — both would otherwise sit in the
// bundle a marbot downloads just to write down how much sabun is on a shelf.
const LabelSheet = lazy(() => import('./features/labels/LabelSheet').then((m) => ({ default: m.LabelSheet })));
const ScannerView = lazy(() => import('./features/scan/ScannerView').then((m) => ({ default: m.ScannerView })));

/*
 * ADMIN-ONLY SCREENS, SPLIT OUT. Pengajuan, Histori Data and the management page are all gated
 * on a Clerk session (§39, and the roster is a gateway credential), so the marbot's tablet was
 * downloading three screens it can never open. Same reasoning as keeping Clerk itself off the
 * kiosk path (§64.2): the hot path is the one that must stay small, and it is the one nobody
 * signs in on.
 */
const RequestBoard = lazy(() => import('./features/requests/RequestBoard').then((m) => ({ default: m.RequestBoard })));
const History = lazy(() => import('./features/history/History').then((m) => ({ default: m.History })));
const Manage = lazy(() => import('./features/admin/Manage').then((m) => ({ default: m.Manage })));
const Report = lazy(() => import('./features/report/Report').then((m) => ({ default: m.Report })));

/** One wording for a refused sign-in, whether it failed opening the session or appending. */
function explainPin(code: string): string {
  if (code === 'invalid_pin') return 'PIN salah.';
  if (code === 'locked') return 'Terkunci sementara karena terlalu banyak percobaan.';
  if (code === 'device_not_enrolled') return 'Perangkat ini tidak dikenali gateway.';
  if (code === 'offline') return 'Tidak bisa menghubungi gateway.';
  return `Gagal: ${code}`;
}

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
import { ConnectPanel } from './features/gateway/ConnectPanel';
import { Enrol } from './features/gateway/Enrol';
import { SubmitRequest } from './features/requests/SubmitRequest';
import { newRequestId } from './features/requests/newRequestId';
import { restoreAdmin } from './features/admin/restore';
import { PinFlow } from './features/gateway/PinFlow';
import { canRecord, connectionLost, loadConnection } from './state/connection';
import { endSession, keepSession, liveSession, sessionName, SESSION_TTL_MS, touchSession } from './state/session';
import type { Connection } from './state/connection';
import { useRegister } from './state/useRegister';
import { gatewayDraft } from './state/useDraft';
import { useCatalogWriter } from './state/useCatalogWriter';
import { AdminPanel, AdminSummary } from './features/admin/AdminPanel';
import type { AdminSession } from './features/admin/AdminPanel';
import { append, closeSession, finishRequest, GatewayError } from '../../data/gateway';
import type { AppendEntry } from '../../data/gateway';
import type { Txn } from '../../domain/types';
import type { MovementTarget } from './features/movement/MovementSheet';


/** Per-viewer, per-device: which side of the app the rail is on is nobody else's business. */
const RAIL_KEY = 'brt.sidebar.collapsed';

export function App() {
  // One draft, shared. Two screens each loading from storage would be two sources of truth,
  // and the label sheet would quietly print a stale count.
  const localDraft = useDraft();
  const [connection, setConnection] = useState<Connection | null>(() => loadConnection());
  /* An admin signed in with Clerk. Held here rather than inside the Admin screen because it is
     what turns every catalog setter in the app from a noop into a write — the sign-in is on one
     screen, the editing is on all of them. */
  const [admin, setAdmin] = useState<AdminSession | null>(null);
  /* Clerk is lazy (§64.2), so on an ordinary load nothing has asked it whether a session
     exists — which is why the rail said "Belum masuk" until somebody opened the admin screen.
     A device that has been signed into before looks; one that never has does not, and so never
     fetches Clerk at all. */
  useEffect(() => {
    if (!connection || admin) return;
    let alive = true;
    void restoreAdmin(connection.url, () => setAdmin(null), (corrected) => setAdmin(corrected))
      .then((session) => { if (alive && session) setAdmin(session); });
    return () => { alive = false; };
  }, [connection?.url]);

  /* Declared BEFORE the register, because an admin changes which tier it reads. */
  const register = useRegister(connection, admin?.getToken);
  /* Rows appended in this visit, shown ahead of the next poll: somebody who records a
     withdrawal has to see the number move now, not in a minute. */
  const [freshTxns, setFreshTxns] = useState<Txn[]>([]);
  const [connectOpen, setConnectOpen] = useState(false);
  const [pinFor, setPinFor] = useState<AppendEntry[] | null>(null);
  const [pinError, setPinError] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  /* The outcome of the last write, for a few seconds. Three outcomes that look identical
     without it: in the sheet, waiting on this phone, refused. */
  const [flash, setFlash] = useState<FlashMessage | null>(null);
  const say = (m: Omit<FlashMessage, 'at'>) => setFlash({ ...m, at: Date.now() });
  /* Whose visit is open, mirrored into state so ending it repaints. Read from storage rather
     than held only here, because a reload must not forget who is standing at the tablet. */
  const [actor, setActor] = useState(() => sessionName());
  const readActor = () => setActor(sessionName());
  /** How many movements are recorded but not yet in the sheet. Shown, never hidden. */


  /*
   * Send a batch under an open session.
   *
   * Hoisted out of the PIN sheet because it now has TWO callers: the sheet, when somebody has
   * just typed a PIN, and the movement itself, when an hour-long phone session is already open
   * and there is nothing to ask. Leaving it inline would have meant the same twenty lines twice,
   * which is how the request form quietly lost its photo picker.
   */
  async function record(token: string, entries: AppendEntry[], what?: string) {
    if (!connection) return;
    const { url } = connection;
    setPinBusy(true);
    setPinError('');
    try {
      const result = await append(url, token, entries);

      setFreshTxns((prev) => [...prev, ...result.appended]);
      // The one thing the person actually wanted to know.
      say({
        kind: 'ok',
        text: what && result.appended.length === 1 ? `Tercatat: ${what}` : 'Tercatat di spreadsheet.',
        hint: sessionName() ? `Sebagai ${sessionName()}.` : undefined,
      });
      setPinFor(null);
      // The gateway slid its own expiry by serving this; keep the local one in step.
      touchSession(SESSION_TTL_MS);
      readActor();
      // Re-read rather than trusting the local fold: the sheet is the register, and anything
      // another device did belongs on this screen too.
      register.refresh();
    } catch (err) {
      const code = err instanceof GatewayError ? err.code : 'offline';

      /*
       * A NETWORK failure is now a plain refusal, and the record is simply not made.
       *
       * It used to be held in an IndexedDB outbox and flushed on the next successful append.
       * Owner's call to drop that, and it is the right one: the queue needed a manual "Kirim"
       * that itself needed a PIN, and its only sign was a count in a sidebar that a phone keeps
       * behind a drawer — so a held record looked exactly like a saved one to the person who
       * made it. A second, invisible source of truth bought almost nothing over saying plainly
       * that it failed, which this can now do because the receipt exists (`components/Flash`).
       *
       * The residual risk, stated rather than solved: somebody who cannot record a withdrawal
       * may take the soap anyway (§0.0). What protects against that is signal, not software.
       */
      if (code === 'offline') {
        say({
          kind: 'problem',
          text: 'Gagal terhubung — catatan tidak tersimpan.',
          hint: 'Periksa koneksi, lalu ulangi. Tidak ada yang berubah di spreadsheet.',
        });
        setPinFor(null);
        setPinError('');
      } else {
        /* A session that is gone or revoked must not linger locally — otherwise every later
           action retries with it and fails identically, with no way for anyone to guess that
           the fix is to type a PIN again. */
        if (code === 'session_expired' || code === 'session_revoked' || code === 'no_session') {
          endSession();
          readActor();
          setPinFor(entries);
        }
        setPinError(explainPin(code));
        /* `pinError` shows INSIDE the PIN sheet, and a record made under a live session never
           opened one — so a refusal had nowhere to appear at all. */
        if (pinFor === null) say({ kind: 'problem', text: explainPin(code) });
      }
    } finally {
      setPinBusy(false);
    }
  }
  /**
   * One movement, routed to wherever this device's records actually go.
   *
   * Shared by the quantity sheet and the loan sheet, because they are the same act with
   * different forms in front of them — and two copies of this would be two places for the
   * offline path, the PIN path and the receipt to drift apart.
   */
  function commitTxn(txn: Txn, what: string) {
    /* A viewer has no device secret and cannot record — so the movement goes nowhere rather
       than to the local draft, which would be a private number diverging from the shared one
       under the same heading. The buttons are hidden for that case, so reaching here at all
       would be a bug. */
    if (connection && canRecord(connection)) {
      setPinError('');
      const entry = {
        clientTxnId: txn.clientTxnId, type: txn.type, itemId: txn.itemId,
        assetId: txn.assetId, locationId: txn.locationId, qtyDelta: txn.qtyDelta,
        recipient: txn.recipient, condition: txn.condition, note: txn.note,
      };
      /* An hour-long phone session is already an answer to "who is this?", so asking again is
         asking somebody to prove something they proved four minutes ago — which is what made
         the PIN feel like a toll rather than a lock. */
      const open = liveSession();
      if (open) void record(open, [entry], what); else setPinFor([entry]);
    } else if (!connection) {
      localDraft.setTxns((prev) => [...prev, txn]);
      /* Confirmed here too, and it says WHERE — the local draft is a legitimate mode (§59
         stage 1) and the one thing it must never do is read like the register. */
      say({
        kind: 'ok',
        text: `Tercatat: ${what}`,
        hint: 'Tersimpan di HP ini saja — belum ada gateway.',
      });
    }
  }


  /* The catalog comes from the sheet the moment this device is connected. Every screen already
     reads `draft.items` and `draft.stock`, so none of them has to know which mode it is in. */
  const writer = useCatalogWriter(
    connection?.url, register.state?.rev ?? 0, admin?.getToken, register.refresh,
  );

  /* Connected, with nothing read yet. Every screen below renders from `draft`, and the fallback
     when the gateway has not answered is the LOCAL draft — which on a connected tablet is empty.
     So the dashboard said "Belum ada data" and offered to load demo rows, while the register was
     still in flight. That is the same mistake as showing "none" for data that is withheld, in a
     third costume. */
  const firstLoad = connection != null && register.state == null;
  /* Connected once, not connected now. The local draft is still there and would render happily,
     which is precisely the danger — see `ConnectionLost`. */
  const lostConnection = connectionLost(connection);

  /*
   * One log, folded once. Spread inline this was a new array on every render, so
   * `useInventory`'s memo never hit and `deriveState` re-ran on every keystroke — and it
   * carried each appended row TWICE once the poll brought it back (see `state/txns.ts`).
   */
  const txns = useMemo(
    () => mergeTxns(register.state?.txns ?? [], freshTxns),
    [register.state?.txns, freshTxns],
  );
  /* And forget the local copies the register has caught up with, or the list grows for as long
     as the tablet stays open. `unsettled` returns the same array when nothing settled, so this
     cannot loop. */
  useEffect(() => {
    setFreshTxns((prev) => unsettled(register.state?.txns ?? [], prev));
  }, [register.state?.txns]);

  const draft = register.state
    ? gatewayDraft(
      register.state,
      txns,
      canRecord(connection),
      admin ? writer : undefined,
      admin && connection
        ? (input) => {
          void (async () => {
            try {
              const { appended } = await finishRequest(connection.url, await admin.getToken(), input);
              if (appended) setFreshTxns((prev) => [...prev, appended]);
              register.refresh();
            } catch (err) {
              /* Surfaced in the same banner as a failed catalog save. A repair that did not
                 close must not look like one that did. */
              writer.reportError(err);
            }
          })();
        }
        : undefined,
    )
    : localDraft;
  const [route, go] = useRoute();
  const [search, setSearch] = useState('');
  /*
   * The navbar box is a FINDER, on every screen without exception.
   *
   * It used to defer to five screens that filtered themselves — which meant one control did
   * five different things depending on where you stood, and none of them matched its label:
   * Stok matched a name and a unit, so a rack code found nothing; Peta Rak matched racks and
   * their contents; Opname something else again. Those screens keep their filter, but as their
   * OWN field, on the screen, where its scope is visible (`components/FilterField`).
   *
   * Nothing navigates to show results, so clearing the box puts the person back exactly where
   * they were.
   */
  const finding = search.trim() !== '';

  /*
   * The same test the sidebar uses for its two people-naming screens, in one place.
   *
   * NOT CONNECTED means the stock-take walk on somebody's own phone (§59 stage 1): there is no
   * roster, no accounts and nothing shared, so gating anything there would take function away
   * from the one mode that has no way to grant it back.
   */
  const privileged = connection == null || admin != null;
  /* The bell opens the list where you are, rather than navigating you to a screen that has it.
     Notifikasi Stok is a thing to glance at and act on, not a destination, and sending someone
     to Beranda from the middle of a stock-take costs them their place. */
  const [alertsOpen, setAlertsOpen] = useState(false);
  /* The admin panel is a side sheet like the gateway connection, not a destination: it is a
     fact you glance at and a way out, and it belongs beside whatever you were doing. Signing IN
     is the exception and keeps its own full page — a door is not a setting. */
  const [adminOpen, setAdminOpen] = useState(false);
  /* Filing a request is open to everybody; reading the list is not (§39). So the form is a
     panel anybody can open, and the list stays a screen only an admin has. */
  const [ajukanOpen, setAjukanOpen] = useState<
    { type: 'beli' | 'perbaikan'; assetId?: string; requestId: string } | null
  >(null);
  /* Also at the frame: a movement is started from a scan, from an item, or from a rack, and
     hoisting it means one implementation instead of three that drift. */
  const [moving, setMoving] = useState<MovementTarget | null>(null);
  /* Lending a labelled unit out, and closing that loan. Until this existed the whole equipment
     lifecycle was reachable only from demo data (§60, §73). */
  const [loan, setLoan] = useState<LoanTarget | null>(null);
  /* Confirming a unit is still good — the claim `available` has always made and nothing has
     ever verified (Q5b). */
  const [inspecting, setInspecting] = useState<InspectTarget | null>(null);

  const now = useNow();
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
  /* On a desktop the collapse is a PREFERENCE and it is remembered: somebody who narrows the
     rail to read a wide table does not want it back at full width on the next visit. On a phone
     it is not a preference at all — it is whether the drawer is open — so the stored value is
     ignored below the breakpoint. Wrapped, because a private window can throw on read. */
  const [collapsed, setCollapsed] = useState(() => {
    if (innerWidth < 768) return true;
    try { return localStorage.getItem(RAIL_KEY) === '1'; } catch { return false; }
  });

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

  /** Only the desktop state is worth remembering; on a phone this is drawer open/shut. */
  function toggleRail() {
    setCollapsed((was) => {
      const next = !was;
      if (!isMobile) { try { localStorage.setItem(RAIL_KEY, next ? '1' : '0'); } catch { /* private window */ } }
      return next;
    });
  }

  const navigate = (next: Parameters<typeof go>[0]) => {
    go(next);
    /* Choosing a destination while looking at search results ABANDONS the search — otherwise
       the new screen opens still showing them, and the query silently follows somebody around
       the app. Carrying it between two screens that filter IN PLACE is different and stays:
       narrowing Opname to "sabun" and then opening Stok is one continuous thought. */
    if (finding) setSearch('');
    if (isMobile) setCollapsed(true);
  };

  // The camera takes the whole screen: it is a viewfinder, and chrome around a viewfinder
  // is just something to mis-tap while aiming.
  /* Outside the shell entirely, until somebody is signed in. A sign-in wrapped in the sidebar
     and navbar of the app it guards reads as a settings panel; on its own it reads as a door. */
  /* Typing the hash must not get past the menu. `admin` is only ever set for a verified
     admin or admin_utama — `onAdmin(null)` is what a valid token with any other role produces —
     so this is the same test the sidebar uses, not a second one to keep in step. Unconnected
     devices are exempt for the reason given there: that mode has no accounts. */
  /* `pinBusy` belongs here as much as a read does: a movement recorded under a live session
     closes its sheet at once and then waits on the gateway for a second or two with nothing on
     screen moving. */
  const progress = (register.loading || pinBusy) && (
    <TopProgress label={pinBusy ? 'Menyimpan catatan' : firstLoad ? 'Memuat register' : 'Memperbarui data'} />
  );

  /* `!firstLoad` is load-bearing, not caution: this runs during render, and on the first pass a
     connected device still has the EMPTY local draft — so the prefilled name resolved to '' and,
     because the panel was already open by then, never resolved again. Waiting for the register
     costs one render and is the difference between "Pisau potong (Pisau #1)" and a blank field. */
  /* Managing people and phones is an admin screen by definition: every control on it is a
     gateway call that an admin token is the only thing that satisfies. */
  if (route.name === 'kelola' && !admin) {
    navigate({ name: 'beranda' });
  }

  if ((route.name === 'pengajuan' || route.name === 'histori') && connection && !admin && !firstLoad) {
    /* A prefilled link is somebody trying to FILE, not to read — and it is the important case
       for repairs, because the person who finds a broken knife is a marbot, not an admin.
       Bouncing them to Beranda made "Ajukan perbaikan" a dead button for everyone who is most
       likely to press it. They get the form instead of the list. */
    if (route.name === 'pengajuan' && route.type && route.assetId && !ajukanOpen) {
      setAjukanOpen({ type: route.type, assetId: route.assetId, requestId: newRequestId() });
    }
    /* Back to Aset, not Beranda, when the link named a unit: that is where the unit is, and
       where somebody following a shared link expects to end up once the form is dealt with.
       This path is now only for links that arrive from outside — a pasted URL, a message —
       since the button itself no longer routes for a non-admin. */
    navigate({ name: route.name === 'pengajuan' && route.assetId ? 'aset' : 'beranda' });
  }

  if (route.name === 'admin' && admin && !adminOpen) {
    setAdminOpen(true);
    navigate({ name: 'beranda' });
  }

  if (route.name === 'admin' && !admin) {
    return (
      <AdminPanel
        connection={connection}
        admin={admin}
        onAdmin={setAdmin}
        onHome={() => navigate({ name: 'beranda' })}
      />
    );
  }

  /* Before everything, including the loading state: this phone may have no connection at all
     yet, so there is nothing for the shell to render around it. */
  if (route.name === 'daftar') {
    return (
      <Enrol
        gateway={route.gateway}
        secret={route.secret}
        onConnected={(c) => { setConnection(c); setFreshTxns([]); }}
        /* The credential leaves the address bar the moment it is used — a secret in the URL is
           a secret in browser history and in every screenshot taken afterwards. */
        onCancel={() => navigate({ name: 'beranda' })}
      />
    );
  }

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

      {/* At the FRAME, not inside `main`. `main` scrolls, and a `position: fixed` child of an
          overflow container is clipped by it in some browsers — the one place a progress bar
          must never be is invisible. */}
      {progress}

      <Sidebar
        route={route}
        collapsed={collapsed}
        isMobile={isMobile}
        onToggle={toggleRail}
        itemCount={draft.items.length}
        alertCount={inventory.notifications.length}
        rackCount={draft.locations.length}
        requestCount={openRequests(draft.requests).length}
        assetIssues={assetIssues}
        onNavigate={navigate}
        connected={connection !== null}
        stale={register.error !== ''}
        canRecord={canRecord(connection)}
        admin={admin ? { name: admin.who.name, role: admin.who.role } : null}
        onOpenAdmin={() => setAdminOpen(true)}
        onOpenConnection={() => setConnectOpen(true)}
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
          {/* At the frame, not on the Admin screen: a catalog edit is made from Opname, from a
              rack, from the item page — so the news that it did NOT save has to reach whichever
              screen the admin was on when they made it. Silence here means an admin walks away
              believing the sheet has something it does not. */}
          {writer.error && (
            <div
              role="alert"
              class="mt-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4"
            >
              <TriangleAlert class="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
              <p class="flex-1 text-sm text-slate-800">{writer.error}</p>
              <button
                type="button"
                class="shrink-0 text-sm font-semibold text-slate-500 hover:text-slate-900"
                onClick={writer.clearError}
              >
                Tutup
              </button>
            </div>
          )}
          {lostConnection ? (
            <ConnectionLost onReconnect={() => setConnectOpen(true)} />
          ) : firstLoad ? (
            /* The whole content area, because every block below renders from an empty draft
               until the gateway answers — zeroes, "belum ada data", and a button offering demo
               rows. Replacing them is the only honest option; overlaying a spinner would leave
               those wrong numbers legible underneath it. */
            <RegisterLoading
              error={register.error}
              onRetry={register.refresh}
              onOpenConnection={() => setConnectOpen(true)}
            />
          ) : finding ? (
            <Finder
              query={search}
              items={draft.items}
              categories={draft.categories}
              locations={draft.locations}
              inventory={inventory}
              /* Requests name people — who asked, who decided — so the public tier omits them
                 entirely (§39). Handing the finder an empty list for everybody else is not a
                 permission check pretending to be one: the gateway already withheld the rows. */
              requests={privileged ? draft.requests : []}
              /* `navigate` drops the query: picking a result answered the question, and
                 carrying it onward would leave a filter running that nobody set there. */
              onOpenItem={(id) => navigate({ name: 'item', id })}
              onOpenRack={(id) => navigate({ name: 'racks', id })}
              onOpenRequests={() => navigate({ name: 'pengajuan' })}
              onClear={() => setSearch('')}
            />
          ) : (
            <>
          {route.name === 'beranda' && (
            <Dashboard
              draft={draft}
              inventory={inventory}
              now={now}
              canReview={!connection || admin != null}
              onAjukan={() => setAjukanOpen({ type: 'beli', requestId: newRequestId() })}
              onNavigate={navigate}
            />
          )}
          {route.name === 'opname' && (
            <StockTake
              draft={draft}
              canManage={privileged}
              edit={route.edit}
              /* Dropped from the address as soon as it is used, so a reload or a Back does not
                 reopen the panel over whatever the person moved on to. */
              onEditOpened={() => { if (route.edit) navigate({ name: 'opname' }); }}
              onOpenRack={(id) => navigate({ name: 'racks', id })}
            />
          )}
          {route.name === 'board' && (
            <Board
              items={draft.items}
              categories={draft.categories}
              locations={draft.locations}
              inventory={inventory}
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
              onLoan={setLoan}
              onInspect={setInspecting}
            />
          )}
          {route.name === 'aset' && (
            <AssetBoard
              draft={draft}
              inventory={inventory}
              now={now}
              onOpenItem={(id) => navigate({ name: 'item', id })}
              onRequest={(type, assetId) => {
                /* An admin goes to the Pengajuan screen, where the new request lands in the
                   list they can actually see. Everybody else opens the form WHERE THEY ARE:
                   they cannot open that screen, and routing them through it only to bounce
                   them somewhere else costs them their place on a list they were working
                   down. Reporting a second broken knife should not mean finding it again. */
                if (admin) { navigate({ name: 'pengajuan', type, assetId }); return; }
                setAjukanOpen({ type, assetId, requestId: newRequestId() });
              }}
              onOpenCounted={() => navigate({ name: 'board', kind: 'barang-tetap' })}
              onLoan={setLoan}
              onInspect={setInspecting}
            />
          )}
          {route.name === 'pengajuan' && (
            <Suspense fallback={<Loading label="Memuat pengajuan…" />}>
            <RequestBoard
              draft={draft}
              inventory={inventory}
              now={now}
              /* The public tier omits Requests entirely (§39), so an empty list here may mean
                 "withheld" rather than "none" — and only this level knows which. */
              withheld={register.state?.tier === 'public'}
              /* Keyed by the prefill so arriving from a second broken unit remounts the form
                 rather than reusing the state of the first. */
              key={route.assetId ?? 'pengajuan'}
              prefill={route.type && route.assetId
                ? { type: route.type, assetId: route.assetId }
                : undefined}
              onPrefillUsed={() => { if (route.assetId) navigate({ name: 'pengajuan' }); }}
            />
            </Suspense>
          )}
          {route.name === 'histori' && (
            <Suspense fallback={<Loading label="Memuat riwayat…" />}>
              <History
                txns={inventory.txns}
                items={draft.items}
                locations={draft.locations}
                stock={draft.stock}
                />
            </Suspense>
          )}
          {route.name === 'kelola' && admin && (
            <Suspense fallback={<Loading label="Memuat pengaturan…" />}>
              <Manage connection={connection} admin={admin} />
            </Suspense>
          )}
          {route.name === 'laporan' && (
            <Suspense fallback={<Loading label="Menyiapkan laporan…" />}>
              <Report draft={draft} inventory={inventory} now={now} />
            </Suspense>
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
              canRecord={draft.canRecord !== false}
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
            </>
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

        <Sheet
          open={ajukanOpen !== null}
          title={ajukanOpen?.type === 'perbaikan' ? 'Ajukan perbaikan' : 'Ajukan pembelian atau perbaikan'}
          description="Pengurus yang memutuskan."
          onClose={() => setAjukanOpen(null)}
        >
          {connection ? (
            <SubmitRequest
              url={connection.url}
              deviceSecret={connection.deviceSecret}
              getToken={admin?.getToken}
              items={draft.items}
              instances={Object.values(inventory.derived.instances)}
              /* Minted here, before the form opens, because photos are filed under it — and it
                 is what the gateway stores, so the attachments are not orphaned. */
              requestId={ajukanOpen?.requestId ?? 'REQ-baru'}
              prefill={ajukanOpen?.assetId
                ? { type: ajukanOpen.type, assetId: ajukanOpen.assetId }
                : undefined}
              /* Remounts per request, so a second broken knife does not inherit the first
                 one's half-typed form or its photos. */
              key={ajukanOpen?.requestId ?? 'baru'}
              onDone={() => setAjukanOpen(null)}
            />
          ) : (
            <p class="text-sm text-slate-600">
              Perangkat ini belum tersambung ke gateway, jadi pengajuan belum bisa dikirim.
            </p>
          )}
        </Sheet>

        <Flyout
          open={adminOpen}
          anchor={isMobile ? null : railRightEdge(isMobile, collapsed)}
          title="Admin"
          onClose={() => setAdminOpen(false)}
        >
          <AdminSummary
            connection={connection}
            admin={admin}
            onAdmin={setAdmin}
            onSignIn={() => { setAdminOpen(false); navigate({ name: 'admin' }); }}
            onManage={() => { setAdminOpen(false); navigate({ name: 'kelola' }); }}
          />
        </Flyout>

        <Flyout
          open={connectOpen}
          anchor={isMobile ? null : railRightEdge(isMobile, collapsed)}
          title="Sambungkan ke gateway"
          onClose={() => setConnectOpen(false)}
        >
          <ConnectPanel
            /* Disconnecting an established kiosk is `admin_utama` only. Connecting a device that
               has none stays open — the admin screen needs a gateway to verify anybody against,
               so gating that would leave a fresh device unconnectable by anyone. */
            canManage={admin?.who.role === 'admin_utama'}
            connection={connection}
                onChange={(c) => { setConnection(c); setFreshTxns([]); }}
          />
        </Flyout>

        <Sheet
          open={pinFor !== null}
          title="Masukkan PIN"
          description="Sekali untuk satu kunjungan."
          onClose={() => setPinFor(null)}
        >
          {pinFor && connection && (() => {
            /* Narrowed once, so the closures below carry a string rather than re-asserting it.
               An empty secret is the phone-number path — `PinFlow` asks for the number. */
            const { url } = connection;
            const deviceSecret = connection.deviceSecret ?? '';
            return (
            <PinFlow
              url={url}
              deviceSecret={deviceSecret}
              busy={pinBusy}
              error={pinError}
              onCancel={() => setPinFor(null)}
              onError={(code) => setPinError(code === '' ? '' : explainPin(code))}
              /* Signing in is `PinFlow`'s job, including the "whose PIN was that?" step. What is
                 left here is the part that is actually ours: flushing the queue and appending. */
              onSession={(session) => {
                /* Kept only when the gateway says it is a PHONE session. A shared tablet's
                   session is a single visit by design (§58.5), so storing it would hand the
                   next person the last one's identity. */
                keepSession(session, session.kind, session.expiresInMs);
                readActor();
                void record(session.token, pinFor);
              }}
            />
            );
          })()}
        </Sheet>

        <MovementSheet
          /* Says where the record lands. Without a connection it goes to this device's own
             draft and nowhere else — legitimate for a stock-take, indistinguishable from the
             real thing until it said so. */
          destination={connection ? 'gateway' : 'local'}
          actor={actor}
          /* Ends the visit rather than merely relabelling it: the next record asks for a PIN,
             which is the only thing that can actually establish who is holding the phone. */
          onNotMe={() => { endSession(); readActor(); }}
          target={moving}
          derived={moving ? inventory.derived.items[moving.item.itemId] : undefined}
          locations={draft.locations}
          /* Two destinations, one action. Connected, a movement goes to the gateway and needs
             a PIN — so the entry is held until that PIN is given rather than written first and
             attributed afterwards. Not connected, it is the local log, as during a stock-take. */
          onCommit={(txn) => {
            commitTxn(txn, `${moving ? moving.item.name : 'barang'} ${txn.qtyDelta > 0 ? '+' : ''}${txn.qtyDelta}`);
            setMoving(null);
          }}
          onClose={() => setMoving(null)}
        />
      </div>

      <LoanSheet
        destination={connection ? 'gateway' : 'local'}
        target={loan}
        onCommit={(txn) => {
          commitTxn(txn, loan ? loan.label : 'unit');
          setLoan(null);
        }}
        onClose={() => setLoan(null)}
      />

      <InspectSheet
        target={inspecting}
        onCommit={(txn) => {
          commitTxn(txn, inspecting ? inspecting.label : 'unit');
          setInspecting(null);
        }}
        onClose={() => setInspecting(null)}
      />

      {/* At the FRAME, above the bottom bar. A movement is recorded from Beranda, from a rack,
          from the scanner and from the item page, so its outcome has to reach whichever screen
          the person was standing on. */}
      <Flash message={flash} onDone={() => setFlash(null)} />

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
