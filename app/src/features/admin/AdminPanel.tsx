// Signing in as an admin.
//
// THE ONE SCREEN THAT LOADS CLERK. Everything else in this app runs without it, and the marbot's
// PIN path must keep running when Clerk's servers are unreachable (§64.2) — so Clerk arrives as
// a CDN script injected the moment somebody opens this route, and on a gudang tablet that is
// never. Nothing here is imported from the kiosk path.
//
// WHY THE ROLE IS CHECKED AT THE GATEWAY rather than read from the Clerk user object: the
// browser's copy of a role is a claim the browser makes about itself. The gateway verifies the
// token's HS256 signature and reads `role` from the payload it verified, and that is the answer
// that decides whether a write succeeds — so it is the answer this screen shows, even though a
// round trip is slower than reading a field we already have.

import { lazy, Suspense, useEffect, useRef, useState } from 'octane';
import { ChevronRight, CircleCheck, LogOut, ShieldCheck, TriangleAlert, Users } from '@octanejs/lucide';
import { whoami } from '../../../../data/gateway';
import type { Whoami } from '../../../../data/gateway';
import {
  ClerkUnavailable, NEEDS_SECOND_FACTOR, clerkMessage, gatewayToken, loadClerk,
} from '../../data/clerkLoader';
import type { ClerkClient } from '../../data/clerkLoader';
import type { Connection } from '../../state/connection';
import { adminSession, forgetSignedIn, rememberSignedIn } from './restore';
import { Button, Card, CODE, ERROR_TEXT, FIELD, LABEL } from '../../components/ui';
import { Logo } from '../../components/Logo';
/* Fetched when the sign-in page is opened, and never otherwise. The fallback is the panel's own
   ground, so there is nothing to see between the two — the card floats over a dark field either
   way, and the drawing simply arrives underneath it. */
const HallPanel = lazy(() => import('./HallPanel').then((m) => ({ default: m.HallPanel })));


/** What an admin session gives the rest of the app: who, and a way to mint a fresh token. */
export interface AdminSession {
  who: Whoami;
  /** Minted per call — Clerk's tokens live 60 seconds, so one kept anywhere is one expired. */
  getToken: () => Promise<string>;
  signOut: () => Promise<void>;
}

type Phase = 'loading' | 'signed-out' | 'checking' | 'ready' | 'error';

export function AdminPanel(
  { connection, admin, onAdmin, onHome }:
  {
    connection: Connection | null;
    admin: AdminSession | null;
    onAdmin: (a: AdminSession | null) => void;
    /** Standalone mode needs a way out; inside the shell the sidebar already is one. */
    onHome?: () => void;
  },
) {
  const [phase, setPhase] = useState<Phase>(admin ? 'ready' : 'loading');
  const [error, setError] = useState('');
  const [who, setWho] = useState<Whoami | null>(admin?.who ?? null);
  const clerkRef = useRef<ClerkClient | null>(null);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [formError, setFormError] = useState('');
  /* Clerk asks for an emailed code when it does not recognise the device. Shown only when it
     asks, so the ordinary sign-in stays two fields. */
  const [code, setCode] = useState('');
  const [needsCode, setNeedsCode] = useState(false);

  /* Confirms with the gateway, not with the browser's copy of the user. Called on load and
     again after Clerk reports a session change, because signing in does not remount this. */
  async function confirm(clerk: ClerkClient) {
    if (!connection) return;
    setPhase('checking');
    try {
      const token = await gatewayToken(clerk);
      const result = await whoami(connection.url, token);
      setWho(result);
      setPhase('ready');
      /* Remembered on the DEVICE, so the next page load knows to ask Clerk at all. Without it
         the app said "Belum masuk" on every start until somebody opened this very screen. */
      if (result.isAdmin) rememberSignedIn(result); else forgetSignedIn();

      onAdmin(result.isAdmin
        ? adminSession(clerk, result, () => { onAdmin(null); setWho(null); setPhase('signed-out'); })
        : null);
    } catch (err) {
      setWho(null);
      onAdmin(null);
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  }

  useEffect(() => {
    if (!connection) { setPhase('error'); setError('belum-terhubung'); return; }
    let live = true;
    let stop: (() => void) | undefined;

    loadClerk().then((clerk) => {
      if (!live) return;
      clerkRef.current = clerk;
      // Clerk signs in inside its own mounted component, so nothing here would otherwise learn
      // that it happened — the screen would sit on the sign-in form after a successful login.
      stop = clerk.addListener(() => {
        if (!live) return;
        if (clerk.session) confirm(clerk);
      });
      if (clerk.session) confirm(clerk);
      else setPhase('signed-out');
    }).catch((err) => {
      if (!live) return;
      setError(err instanceof ClerkUnavailable ? err.message : String(err));
      setPhase('error');
    });

    return () => { live = false; stop?.(); };
  }, [connection?.url]);

  /*
   * Signing in with Clerk's headless API, through our own form.
   *
   * The password goes straight from this field into Clerk's SDK over HTTPS and is never held
   * anywhere else — not in the outbox, not in localStorage, not in a variable that outlives the
   * submit. What we gain over Clerk's mounted widget is that this form is in Bahasa, matches
   * every other screen, and cannot half-load (see `CLERK_JS_FILE`).
   */
  async function finish(clerk: ClerkClient, sessionId: string) {
    await clerk.setActive({ session: sessionId });
    setPassword('');
    setCode('');
    setNeedsCode(false);
    await confirm(clerk);
  }

  async function signIn(e: Event) {
    e.preventDefault();
    const clerk = clerkRef.current;
    if (!clerk?.client) { setFormError('Clerk belum siap. Muat ulang halaman.'); return; }

    setSigningIn(true);
    setFormError('');
    try {
      const result = await clerk.client.signIn.create({
        strategy: 'password', identifier: identifier.trim(), password,
      });

      if (result.status === 'complete' && result.createdSessionId) {
        await finish(clerk, result.createdSessionId);
        return;
      }

      /* NOT a failure — the password was accepted and Clerk wants the device proved. Reporting
         this as a rejection would tell an admin their password is wrong when it is not, which
         is the most expensive wrong message a login screen can show. */
      if (NEEDS_SECOND_FACTOR.includes(result.status)) {
        await clerk.client.signIn.prepareSecondFactor({ strategy: 'email_code' });
        setNeedsCode(true);
        return;
      }

      setFormError(`Clerk meminta langkah "${result.status}", yang belum didukung layar ini. `
        + 'Selesaikan lewat dashboard Clerk.');
    } catch (err) {
      setFormError(clerkMessage(err));
    } finally {
      setSigningIn(false);
    }
  }

  async function submitCode(e: Event) {
    e.preventDefault();
    const clerk = clerkRef.current;
    if (!clerk?.client) return;
    setSigningIn(true);
    setFormError('');
    try {
      const result = await clerk.client.signIn.attemptSecondFactor({
        strategy: 'email_code', code: code.trim(),
      });
      if (result.status === 'complete' && result.createdSessionId) {
        await finish(clerk, result.createdSessionId);
      } else {
        setFormError(`Clerk menjawab "${result.status}". Minta kode baru dan coba lagi.`);
      }
    } catch (err) {
      setFormError(clerkMessage(err));
    } finally {
      setSigningIn(false);
    }
  }

  const content = !connection ? (
    (
      <Card>
        <h2 class="text-base font-bold text-slate-900">Belum terhubung ke gateway</h2>
        <p class="mt-2 text-sm text-slate-600">
          Masuk sebagai admin memerlukan alamat gateway, karena yang memeriksa siapa kamu adalah
          gateway — bukan aplikasi ini. Sambungkan perangkat ini dulu lewat indikator di pojok
          kiri bawah.
        </p>
      </Card>
    )
  ) : (
    <div class="space-y-4">
      {phase === 'loading' && (
        <Card><p class="text-sm text-slate-600">Memuat Clerk…</p></Card>
      )}

      {phase === 'checking' && (
        <Card><p class="text-sm text-slate-600">Memeriksa peranmu di gateway…</p></Card>
      )}

      {phase === 'error' && (
        <Card class="border-red-200 bg-red-50/40">
          <div class="flex gap-3">
            <TriangleAlert class="h-5 w-5 shrink-0 text-red-500" />
            <div>
              <h2 class="text-sm font-bold text-slate-900">Tidak bisa masuk</h2>
              <p class="mt-1 text-sm text-slate-700">{error}</p>
            </div>
          </div>
        </Card>
      )}

      {phase === 'signed-out' && needsCode && (
        <Card class="border-t-4 border-t-[#c9a86a] shadow-xl">
          <h2 class="text-base font-bold text-slate-900">Masukkan kode dari email</h2>
          <p class="mt-1 text-sm text-slate-600">
            Password benar. Clerk mengirim kode ke emailmu untuk mengenali perangkat ini.
          </p>

          <form class="mt-4 space-y-4" onSubmit={submitCode}>
            <div>
              <label class={LABEL} for="admin-code">Kode</label>
              <input
                id="admin-code"
                class={`${FIELD} tracking-[0.4em]`}
                type="text"
                inputmode="numeric"
                autocomplete="one-time-code"
                maxlength={8}
                value={code}
                onInput={(e: Event) => setCode((e.target as HTMLInputElement).value)}
              />
            </div>

            {formError && <p class={ERROR_TEXT} role="alert">{formError}</p>}

            <div class="flex items-center gap-3">
              <Button type="submit" disabled={signingIn || code.trim().length < 4}>
                {signingIn ? 'Memeriksa…' : 'Lanjut'}
              </Button>
              <button
                type="button"
                class="text-sm font-semibold text-slate-500 underline-offset-4 hover:text-slate-900 hover:underline"
                onClick={() => { setNeedsCode(false); setCode(''); setFormError(''); }}
              >
                Kembali
              </button>
            </div>
          </form>
        </Card>
      )}

      {phase === 'signed-out' && !needsCode && (
        <Card class="border-t-4 border-t-[#c9a86a] shadow-xl">
          <h2 class="text-base font-bold text-slate-900">Masuk sebagai admin</h2>
          <p class="mt-1 text-sm text-slate-600">Email atau username Clerk-mu.</p>

          <form class="mt-4 space-y-4" onSubmit={signIn}>
            <div>
              <label class={LABEL} for="admin-id">Email atau username</label>
              <input
                id="admin-id"
                class={FIELD}
                type="text"
                autocomplete="username"
                value={identifier}
                /* onInput, never onChange: these are native DOM events under Octane, and
                   `change` only fires on blur (§62). */
                onInput={(e: Event) => setIdentifier((e.target as HTMLInputElement).value)}
              />
            </div>
            <div>
              <label class={LABEL} for="admin-pw">Password</label>
              <input
                id="admin-pw"
                class={FIELD}
                type="password"
                autocomplete="current-password"
                value={password}
                onInput={(e: Event) => setPassword((e.target as HTMLInputElement).value)}
              />
            </div>

            {formError && <p class={ERROR_TEXT} role="alert">{formError}</p>}

            <Button type="submit" disabled={signingIn || !identifier || !password}>
              {signingIn ? 'Memeriksa…' : 'Masuk'}
            </Button>
          </form>
        </Card>
      )}

      {phase === 'ready' && who && (
        <div class={`rounded-lg border bg-white p-3.5 shadow-sm ${who.isAdmin ? 'border-green-200' : 'border-amber-200 bg-amber-50/40'}`}>
          <div class="flex items-start gap-2.5">
            {who.isAdmin
              ? <ShieldCheck class="h-5 w-5 shrink-0 text-green-600" />
              : <TriangleAlert class="h-5 w-5 shrink-0 text-amber-600" />}
            <div class="min-w-0 flex-1">
              <h2 class="truncate text-sm font-bold text-slate-900">
                {who.name || 'Tanpa nama'}
              </h2>
              <p class={`${CODE} truncate`}>{who.userId}</p>

              {who.isAdmin ? (
                /* A CHIP, not a sentence in a flex row. `flex items-center` on a paragraph makes
                   every text node its own flex item, so "Peran admin_utama — kamu bisa mengubah
                   katalog" broke into three pieces that wrapped past each other. */
                <p class="mt-1.5 inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                  <CircleCheck class="h-3 w-3 shrink-0" />
                  {who.role}
                </p>
              ) : (
                <div class="mt-1.5 text-xs leading-relaxed text-slate-700">
                  <p>
                    Token sah, tetapi perannya
                    {who.role ? <> <strong>{who.role}</strong></> : ' kosong'} — bukan admin.
                  </p>
                  {/* The distinction that saves an hour: an empty role is almost never a
                      permissions decision, it is a JWT template missing a claim. From the app
                      the two are identical, so the screen has to say which one it is. */}
                  {!who.role && (
                    <p class="mt-2 rounded-lg bg-white p-3 text-xs leading-relaxed text-slate-600">
                      Peran kosong biasanya JWT template Clerk yang belum mengirim klaim
                      <code class="font-mono"> role</code>, bukan soal izin.
                    </p>
                  )}
                </div>
              )}

              <Button
                class="mt-3"
                size="sm"
                variant="ghost"
                onClick={() => {
                  const clerk = clerkRef.current;
                  if (!clerk) return;
                  clerk.signOut().then(() => { onAdmin(null); setWho(null); setPhase('signed-out'); });
                }}
              >
                <LogOut class="h-4 w-4" />
                Keluar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  /* INSIDE the shell once somebody is signed in, STANDALONE until then.
   *
   * A sign-in that sits in a page of the app it is guarding reads as a settings panel — the
   * sidebar, the search field and nine destinations are all still there, none of which work for
   * the person looking at it. Standalone, the screen has one thing to do and says so. */
  if (!onHome) return content;

  return (
    <div class="relative min-h-screen lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* On a phone the hall is the BACKGROUND, not a band across the top. The band version put
          white text on a 200px strip and the tagline immediately overflowed it onto a grey gap —
          a full bleed with the card floating over it has neither problem and looks better. */}
      <div class="absolute inset-0 overflow-hidden lg:relative lg:inset-auto lg:h-auto">
        <Suspense fallback={<div class="h-full w-full bg-[#14100b]" />}>
          <HallPanel />
        </Suspense>
      </div>

      <div class="relative flex min-h-screen items-center justify-center px-5 py-12 sm:px-10 lg:min-h-0 lg:bg-[#faf7f2]">
        {/* The building's one motif, at a whisper, CENTRED so the form sits inside the arch
            rather than beside it. Hung off the edge it read as two stray vertical rules.

            CLIPPED BY ITS OWN WRAPPER, and that is not cosmetic: at 115% height and centred, the
            arch hangs 68px below the fold and 18px past the right edge, and a decorative element
            that overflows the viewport is a decorative element that gives the whole page a
            scrollbar. It did — an empty band under a full-height login, which reads as a broken
            layout rather than as an ornament. The wrapper is `inset-0`, so the arch can be as
            large as it likes and nothing it does can ever add a pixel of scroll.

            Desktop only — on a phone this half IS the photograph. */}
        <div class="pointer-events-none absolute inset-0 hidden overflow-hidden lg:block">
          <svg
            class="absolute left-1/2 top-1/2 h-[115%] w-auto -translate-x-1/2 -translate-y-1/2"
            viewBox="0 0 100 140"
            fill="none"
            aria-hidden="true"
          >
            <path d="M8 140 V52 Q50 4 92 52 V140" stroke="#c9a86a" stroke-opacity="0.16" stroke-width="1.2" />
            <path d="M22 140 V60 Q50 24 78 60 V140" stroke="#c9a86a" stroke-opacity="0.11" stroke-width="1.2" />
          </svg>
        </div>

        <div class="relative w-full max-w-md">
          {/* The phone's brand lockup, over the photograph. The desktop's lives in the hall
              panel, where there is room for the tagline as well. */}
          <div class="mb-6 flex items-center gap-3 lg:hidden">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-lg">
              <Logo size={38} />
            </div>
            <div>
              <p class="text-lg font-bold leading-tight text-white drop-shadow">BRT Masjid Al-Qalam</p>
              <p class="text-sm text-slate-300 drop-shadow">Sistem Inventaris</p>
            </div>
          </div>

          {content}

          <button
            type="button"
            class="mt-6 text-sm font-semibold text-slate-300 underline-offset-4 hover:text-white hover:underline lg:text-slate-500 lg:hover:text-slate-900"
            onClick={onHome}
          >
            &larr; Kembali ke beranda
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The admin panel as a side sheet, opened from the sidebar's own status row.
 *
 * SIGNED IN, this is the whole admin screen — who you are, what the gateway says your role is,
 * and the way out. It was a route with a page header and one card on it, which is a whole
 * destination for a fact you want to glance at; the sheet puts it beside whatever you were
 * doing, like the gateway connection beneath it.
 *
 * SIGNED OUT, it does NOT hold the sign-in form. Signing in is the one thing on this screen that
 * deserves the full page — it is a door, not a setting — so this offers the door instead of
 * becoming a second, smaller one that would drift out of step with it.
 */
export function AdminSummary(
  { connection, admin, onAdmin, onSignIn, onManage }:
  {
    connection: Connection | null;
    admin: AdminSession | null;
    onAdmin: (a: AdminSession | null) => void;
    onSignIn: () => void;
    /** Opens the management screen. Absent means there is nowhere to go yet. */
    onManage?: () => void;
  },
) {
  if (admin) {
    return (
      <div class="space-y-3">
        <AdminPanel connection={connection} admin={admin} onAdmin={onAdmin} />
        {/* A LINK, not the lists themselves. Two editable lists with forms in them do not fit a
            304px column: names wrapped, buttons shrank to icons to make room, and adding
            somebody meant working in a space narrower than a phone. The panel is good at "who
            am I and how do I leave"; it was never going to be good at this. */}
        {connection && onManage && (
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm hover:border-slate-400"
            onClick={onManage}
          >
            <Users class="h-4 w-4 shrink-0 text-slate-500" />
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-bold text-slate-900">Pengguna & Perangkat</span>
              <span class="block text-[11px] text-slate-500">PIN, peran, dan HP yang terdaftar</span>
            </span>
            <ChevronRight class="h-4 w-4 shrink-0 text-slate-400" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div class="space-y-4">
      <div class="rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm">
        <h2 class="text-sm font-bold text-slate-900">Belum masuk</h2>
        <p class="mt-1 text-xs leading-relaxed text-slate-600">
          Perangkat ini bisa melihat, tidak bisa mengubah katalog.
        </p>
        {/* Auto width, not full. A black pill spanning a 304px panel gives a once-a-month
            action the weight of the panel's whole reason for existing; sized to its own label
            it reads as the one thing to do here without shouting it. */}
        <Button size="panel" class="mt-3" onClick={onSignIn}>
          <ShieldCheck class="h-4 w-4" />
          Masuk sebagai admin
        </Button>
      </div>

      <p class="px-1 text-[11px] text-slate-500">Marbot pakai PIN di kios, bukan akun.</p>
    </div>
  );
}
