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

import { useEffect, useRef, useState } from 'octane';
import { CircleCheck, LogOut, ShieldCheck, TriangleAlert } from '@octanejs/lucide';
import { whoami } from '../../../../data/gateway';
import type { Whoami } from '../../../../data/gateway';
import { ClerkUnavailable, gatewayToken, loadClerk } from '../../data/clerkLoader';
import type { ClerkClient } from '../../data/clerkLoader';
import type { Connection } from '../../state/connection';
import { Button, Card, CODE } from '../../components/ui';

/** What an admin session gives the rest of the app: who, and a way to mint a fresh token. */
export interface AdminSession {
  who: Whoami;
  /** Minted per call — Clerk's tokens live 60 seconds, so one kept anywhere is one expired. */
  getToken: () => Promise<string>;
  signOut: () => Promise<void>;
}

type Phase = 'loading' | 'signed-out' | 'checking' | 'ready' | 'error';

export function AdminPanel(
  { connection, admin, onAdmin }:
  {
    connection: Connection | null;
    admin: AdminSession | null;
    onAdmin: (a: AdminSession | null) => void;
  },
) {
  const [phase, setPhase] = useState<Phase>(admin ? 'ready' : 'loading');
  const [error, setError] = useState('');
  const [who, setWho] = useState<Whoami | null>(admin?.who ?? null);
  const signInBox = useRef<HTMLDivElement | null>(null);
  const clerkRef = useRef<ClerkClient | null>(null);

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
      onAdmin(result.isAdmin
        ? {
          who: result,
          getToken: () => gatewayToken(clerk),
          signOut: async () => { await clerk.signOut(); onAdmin(null); setWho(null); setPhase('signed-out'); },
        }
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
   * Mounting is a side effect on a DOM node Clerk owns, so it happens after the box exists.
   *
   * WRAPPED, because an exception here took the WHOLE APP down — `#/admin` rendered a blank
   * page, not a broken card. That is the wrong failure by a wide margin: a third-party script
   * that cannot mount its own form must cost an admin one screen, never the register. The
   * specific throw was "Clerk was not loaded with Ui components", from mounting against the
   * core build before its components had arrived; the loader now fetches the build that has
   * them. This catch is not for that bug — it is for the next one.
   */
  useEffect(() => {
    const clerk = clerkRef.current;
    const box = signInBox.current;
    if (phase !== 'signed-out' || !clerk || !box) return;
    try {
      clerk.mountSignIn(box);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
      return;
    }
    return () => { try { clerk.unmountSignIn(box); } catch { /* already gone */ } };
  }, [phase]);

  if (!connection) {
    return (
      <Card>
        <h2 class="text-base font-bold text-slate-900">Belum terhubung ke gateway</h2>
        <p class="mt-2 text-sm text-slate-600">
          Masuk sebagai admin memerlukan alamat gateway, karena yang memeriksa siapa kamu adalah
          gateway — bukan aplikasi ini. Sambungkan perangkat ini dulu lewat indikator di pojok
          kiri bawah.
        </p>
      </Card>
    );
  }

  return (
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

      {/* Clerk paints its own sign-in form in here. Deliberately given nothing but a box: its
          styling is Clerk's, and fighting it would be work with no return on a screen two
          people see. */}
      <div ref={signInBox} class={phase === 'signed-out' ? '' : 'hidden'} />

      {phase === 'ready' && who && (
        <Card class={who.isAdmin ? 'border-green-200' : 'border-amber-200 bg-amber-50/40'}>
          <div class="flex items-start gap-3">
            {who.isAdmin
              ? <ShieldCheck class="h-5 w-5 shrink-0 text-green-600" />
              : <TriangleAlert class="h-5 w-5 shrink-0 text-amber-600" />}
            <div class="min-w-0 flex-1">
              <h2 class="text-base font-bold text-slate-900">
                {who.name || 'Tanpa nama'}
              </h2>
              <p class={CODE}>{who.userId}</p>

              {who.isAdmin ? (
                <p class="mt-2 flex items-center gap-1.5 text-sm text-green-700">
                  <CircleCheck class="h-4 w-4" />
                  Peran <strong>{who.role}</strong> — kamu bisa mengubah katalog.
                </p>
              ) : (
                <div class="mt-2 text-sm text-slate-700">
                  <p>
                    Token-mu sah, tetapi perannya
                    {who.role ? <> <strong>{who.role}</strong></> : ' kosong'} — bukan admin.
                  </p>
                  {/* The distinction that saves an hour: an empty role is almost never a
                      permissions decision, it is a JWT template missing a claim. From the app
                      the two are identical, so the screen has to say which one it is. */}
                  {!who.role && (
                    <p class="mt-2 rounded-lg bg-white p-3 text-xs leading-relaxed text-slate-600">
                      Peran kosong biasanya bukan soal izin, melainkan JWT template Clerk yang
                      belum mengirim klaim <code class="font-mono">role</code>. Di Clerk →
                      JWT Templates → <code class="font-mono">gateway</code>, klaimnya harus
                      memuat <code class="font-mono">
                        {'{"role": "{{user.public_metadata.role}}", "name": "{{user.full_name}}"}'}
                      </code>, dan user-nya harus punya <code class="font-mono">role</code> di
                      public metadata.
                    </p>
                  )}
                </div>
              )}

              <Button
                class="mt-4"
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
        </Card>
      )}
    </div>
  );
}
