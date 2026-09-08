import { lazy, Suspense, useEffect, useMemo, useState } from 'octane';
import { CircleCheck, ClipboardList, LayoutDashboard, MapPin, Package, TriangleAlert } from '@octanejs/lucide';
import { Sidebar, railRightEdge } from './components/Sidebar';
import { Flyout } from './components/Flyout';
import { RegisterLoading, TopProgress } from './components/Progress';
import { Navbar } from './components/Navbar';
import { BottomNav } from './components/BottomNav';
import { Card, PageHeader } from './components/ui';
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
import { History } from './features/history/History';
import { ScanResult } from './features/scan/ScanResult';
import { MovementSheet } from './features/movement/MovementSheet';
import { ConnectPanel } from './features/gateway/ConnectPanel';
import { SubmitRequest } from './features/requests/SubmitRequest';
import { newRequestId } from './features/requests/newRequestId';
import { PinFlow } from './features/gateway/PinFlow';
import { canRecord, loadConnection } from './state/connection';
import type { Connection } from './state/connection';
import { useRegister } from './state/useRegister';
import { gatewayDraft } from './state/useDraft';
import { useCatalogWriter } from './state/useCatalogWriter';
import { AdminPanel, AdminSummary } from './features/admin/AdminPanel';
import type { AdminSession } from './features/admin/AdminPanel';
import { append, closeSession, GatewayError } from '../../data/gateway';
import type { AppendEntry } from '../../data/gateway';
import { enqueue, pending, pendingCount, settle } from '../../data/outbox';
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
  /* Declared BEFORE the register, because an admin changes which tier it reads. */
  const register = useRegister(connection, admin?.getToken);
  /* Rows appended in this visit, shown ahead of the next poll: somebody who records a
     withdrawal has to see the number move now, not in a minute. */
  const [freshTxns, setFreshTxns] = useState<Txn[]>([]);
  const [connectOpen, setConnectOpen] = useState(false);
  const [pinFor, setPinFor] = useState<AppendEntry[] | null>(null);
  const [pinError, setPinError] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  /** How many movements are recorded but not yet in the sheet. Shown, never hidden. */
  const [queued, setQueued] = useState(0);

  const refreshQueue = () => { void pendingCount().then(setQueued).catch(() => setQueued(0)); };
  useEffect(refreshQueue, [connection?.url]);

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

  const draft = register.state
    ? gatewayDraft(
      register.state,
      [...register.state.txns, ...freshTxns],
      canRecord(connection),
      admin ? writer : undefined,
    )
    : localDraft;
  const [route, go] = useRoute();
  const [search, setSearch] = useState('');
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
  const progress = register.loading && (
    <TopProgress label={firstLoad ? 'Memuat register' : 'Memperbarui data'} />
  );

  /* `!firstLoad` is load-bearing, not caution: this runs during render, and on the first pass a
     connected device still has the EMPTY local draft — so the prefilled name resolved to '' and,
     because the panel was already open by then, never resolved again. Waiting for the register
     costs one render and is the difference between "Pisau potong (Pisau #1)" and a blank field. */
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
        queued={queued}
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
          {firstLoad ? (
            /* The whole content area, because every block below renders from an empty draft
               until the gateway answers — zeroes, "belum ada data", and a button offering demo
               rows. Replacing them is the only honest option; overlaying a spinner would leave
               those wrong numbers legible underneath it. */
            <RegisterLoading
              error={register.error}
              onRetry={register.refresh}
              onOpenConnection={() => setConnectOpen(true)}
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
            />
          )}
          {route.name === 'pengajuan' && (
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
          )}
          {route.name === 'histori' && (
            <History
              txns={inventory.txns}
              items={draft.items}
              locations={draft.locations}
              stock={draft.stock}
              search={search}
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
          />
        </Flyout>

        <Flyout
          open={connectOpen}
          anchor={isMobile ? null : railRightEdge(isMobile, collapsed)}
          title="Sambungkan ke gateway"
          onClose={() => setConnectOpen(false)}
        >
          <ConnectPanel
            connection={connection}
            queued={queued}
            onChange={(c) => { setConnection(c); setFreshTxns([]); }}
            onSendQueued={() => {
              /* Sending needs a PIN like any other write — the queue holds no credential, so
                 there is nothing to send it WITH. An empty batch is right: the pending entries
                 are picked up ahead of it. */
              setConnectOpen(false);
              setPinError('');
              setPinFor([]);
            }}
          />
        </Flyout>

        <Sheet
          open={pinFor !== null}
          title="Masukkan PIN"
          description="Sekali untuk satu kunjungan."
          onClose={() => setPinFor(null)}
        >
          {pinFor && connection?.deviceSecret && (() => {
            // Narrowed once, so the closures below carry a string rather than re-asserting it.
            const { url, deviceSecret } = connection;
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
                setPinBusy(true);
                setPinError('');
                void (async () => {
                  const token = session.token;
                  try {
                    /* Anything stranded by earlier bad wifi goes FIRST, and in the order it was
                       recorded — the log is a sequence, and sending today's withdrawal ahead of
                       yesterday's invents a different one. */
                    const waiting = await pending().catch(() => []);
                    const batch = [...waiting.map((w) => w.entry), ...pinFor];

                    const result = await append(url, token, batch);
                    /* Duplicates count as settled: the gateway already holds them, and leaving
                       them queued would retry for ever against rows that exist. */
                    await settle([
                      ...result.appended.map((t) => t.clientTxnId),
                      ...result.duplicates,
                    ]).catch(() => undefined);

                    setFreshTxns((prev) => [...prev, ...result.appended]);
                    setPinFor(null);
                    refreshQueue();
                    // Re-read rather than trusting the local fold: the sheet is the register,
                    // and anything another device did belongs on this screen too.
                    register.refresh();
                  } catch (err) {
                    const code = err instanceof GatewayError ? err.code : 'offline';

                    /* Only a NETWORK failure is queued. A refused PIN or a revoked device is
                       not something a retry will fix, and queueing it would hide the reason
                       behind a badge that never clears. */
                    if (code === 'offline') {
                      await Promise.all(pinFor.map((e) => enqueue(e, 'perangkat ini')))
                        .catch(() => undefined);
                      refreshQueue();
                      setPinFor(null);
                      setPinError('');
                    } else {
                      setPinError(explainPin(code));
                    }
                  } finally {
                    setPinBusy(false);
                    /* Closed even when the append failed: the session covers one visit, and
                       leaving it open on a shared tablet is exactly the misattribution §58.5
                       set out to make structurally impossible. */
                    if (token) await closeSession(url, token).catch(() => undefined);
                  }
                })();
              }}
            />
            );
          })()}
        </Sheet>

        <MovementSheet
          target={moving}
          derived={moving ? inventory.derived.items[moving.item.itemId] : undefined}
          locations={draft.locations}
          /* Two destinations, one action. Connected, a movement goes to the gateway and needs
             a PIN — so the entry is held until that PIN is given rather than written first and
             attributed afterwards. Not connected, it is the local log, as during a stock-take. */
          onCommit={(txn) => {
            /* A viewer has no device secret and cannot record — so the movement goes nowhere
               rather than to the local draft, which would be a private number diverging from
               the shared one under the same heading. The buttons are hidden for that case, so
               reaching here at all would be a bug. */
            if (connection && canRecord(connection)) {
              setPinError('');
              setPinFor([{
                clientTxnId: txn.clientTxnId, type: txn.type, itemId: txn.itemId,
                assetId: txn.assetId, locationId: txn.locationId, qtyDelta: txn.qtyDelta,
                recipient: txn.recipient, condition: txn.condition, note: txn.note,
              }]);
            } else if (!connection) {
              localDraft.setTxns((prev) => [...prev, txn]);
            }
            setMoving(null);
          }}
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
