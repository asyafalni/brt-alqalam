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
import { ClerkUnavailable, clerkMessage, gatewayToken, loadClerk } from '../../data/clerkLoader';
import type { ClerkClient } from '../../data/clerkLoader';
import type { Connection } from '../../state/connection';
import { Button, Card, CODE, ERROR_TEXT, FIELD, LABEL } from '../../components/ui';

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
  const clerkRef = useRef<ClerkClient | null>(null);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [formError, setFormError] = useState('');

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
   * Signing in with Clerk's headless API, through our own form.
   *
   * The password goes straight from this field into Clerk's SDK over HTTPS and is never held
   * anywhere else — not in the outbox, not in localStorage, not in a variable that outlives the
   * submit. What we gain over Clerk's mounted widget is that this form is in Bahasa, matches
   * every other screen, and cannot half-load (see `CLERK_JS_FILE`).
   */
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
      if (result.status !== 'complete' || !result.createdSessionId) {
        // Two-factor and the like. Not supported here, and saying so beats a silent no-op.
        setFormError(`Clerk meminta langkah tambahan (${result.status}), yang belum didukung `
          + 'layar ini. Selesaikan lewat dashboard Clerk.');
        return;
      }
      await clerk.setActive({ session: result.createdSessionId });
      setPassword('');
      await confirm(clerk);
    } catch (err) {
      // Clerk's own wording, which is more accurate than a guess — it is the side that knows
      // whether this was a wrong password, a breached one, or a locked account.
      setFormError(clerkMessage(err));
    } finally {
      setSigningIn(false);
    }
  }

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

      {phase === 'signed-out' && (
        <Card>
          <h2 class="text-base font-bold text-slate-900">Masuk sebagai admin</h2>
          <p class="mt-1 text-sm text-slate-600">
            Pakai email atau username Clerk-mu. Marbot tidak perlu masuk di sini — mereka pakai
            PIN di kios.
          </p>

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
