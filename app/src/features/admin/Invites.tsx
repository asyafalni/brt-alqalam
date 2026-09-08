// Inviting somebody to become an admin.
//
// AN INVITATION, NOT AN ACCOUNT, and that distinction is what makes this safe enough to exist.
// Clerk emails a link; the person sets their own password there; the role travels as
// `public_metadata`, which is exactly where the gateway's JWT template reads it from. No
// password is ever typed here, sent through the gateway, or stored anywhere by us.
//
// It is `admin_utama` only, enforced at the gateway rather than by hiding this panel — and it
// can never invite another `admin_utama`. The permanent super-admin is born once, by hand, in
// the Clerk dashboard: not remotely, and not by anything with an HTTP endpoint.

import { useEffect, useState } from 'octane';
import { MailPlus, TriangleAlert, X } from '@octanejs/lucide';
import { GatewayError, inviteAdmin, listInvitations, revokeInvitation } from '../../../../data/gateway';
import type { Invitation } from '../../../../data/gateway';
import { Button, ERROR_TEXT, FIELD, LABEL } from '../../components/ui';

const REASON: Record<string, string> = {
  bad_email: 'Itu bukan alamat email.',
  bad_role: 'Peran itu tidak bisa diundang dari sini.',
  needs_admin_utama: 'Hanya Admin Utama yang bisa mengundang admin.',
  offline: 'Tidak bisa menghubungi gateway.',
};
const explain = (e: unknown) => {
  if (!(e instanceof GatewayError)) return REASON.offline;
  if (REASON[e.code]) return REASON[e.code];
  // Clerk's own wording — it says things like "duplicate invitation" better than a paraphrase.
  return e.hint ? `Clerk menolak: ${e.hint}` : `Gateway menolak: ${e.code}`;
};

export function Invites(
  { url, getToken }: { url: string; getToken: () => Promise<string> },
) {
  const [invites, setInvites] = useState<Invitation[] | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /* Distinguished from any other failure, because it is not a failure: it means nobody has
     given the gateway a Clerk key, which is a deliberate state, not a broken one. */
  const [unconfigured, setUnconfigured] = useState(false);

  const run = async (fn: (t: string) => Promise<Invitation[]>) => {
    setBusy(true);
    setError('');
    try {
      setInvites(await fn(await getToken()));
      return true;
    } catch (err) {
      if (err instanceof GatewayError && err.code === 'clerk_not_configured') {
        setUnconfigured(true);
        setInvites([]);
        return false;
      }
      setError(explain(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { void run((t) => listInvitations(url, t)); }, [url]);

  if (unconfigured) {
    return (
      <div class="flex gap-3 rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm">
        <TriangleAlert class="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <div class="text-xs leading-relaxed text-slate-600">
          <p class="text-sm font-bold text-slate-900">Undangan admin belum aktif</p>
          <p class="mt-1">
            Gateway belum diberi kunci Clerk, jadi ia belum bisa membuat undangan — dan itu
            keadaan yang disengaja: tanpa kunci itu, kebocoran gateway paling jauh merusak data
            inventaris, bukan membuat akun admin.
          </p>
          <p class="mt-2">
            Untuk mengaktifkan, tambahkan <code class="font-mono">CLERK_SECRET_KEY</code> di
            Apps Script → Project Settings → Script Properties. Sampai itu dilakukan, tambah
            admin lewat dashboard Clerk.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div class="rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm">
      <div class="flex items-center gap-2">
        <MailPlus class="h-4 w-4 shrink-0 text-slate-500" />
        <h2 class="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">Undang admin</h2>
      </div>

      <form
        class="mt-3 space-y-3"
        onSubmit={(e: Event) => {
          e.preventDefault();
          /* Where they land after accepting — the register, not Clerk's own page. */
          const back = `${location.origin}/#/admin`;
          void run((t) => inviteAdmin(url, t, email.trim(), back))
            .then((ok) => { if (ok) setEmail(''); });
        }}
      >
        <div>
          <label class={LABEL} for="invite-email">Email calon admin</label>
          <input
            id="invite-email"
            class={FIELD}
            type="email"
            autocomplete="email"
            placeholder="nama@contoh.com"
            value={email}
            onInput={(e: Event) => setEmail((e.target as HTMLInputElement).value)}
          />
          {/* Said here because it is the question this form gets asked: no, you do not set
              their password, and you cannot see it either. */}
          <p class="mt-1 text-xs leading-relaxed text-slate-500">
            Clerk mengirim tautan; orangnya menentukan passwordnya sendiri. Perannya sudah
            menempel begitu ia mendaftar.
          </p>
        </div>

        {error && <p class={ERROR_TEXT} role="alert">{error}</p>}

        <Button type="submit" size="panel" disabled={busy || !email.includes('@')}>
          {busy ? 'Mengirim…' : 'Kirim undangan'}
        </Button>
      </form>

      {invites && invites.length > 0 && (
        <ul class="mt-4 divide-y divide-slate-200 border-t border-slate-200 pt-1">
          {invites.map((i) => (
            <li key={i.invitationId} class="flex items-center gap-2 py-2">
              <div class="flex min-w-0 flex-1 items-baseline gap-1.5">
                <span class="truncate text-sm font-semibold text-slate-900">{i.email}</span>
                <span class="shrink-0 text-[11px] text-slate-500">{i.status}</span>
              </div>
              <button
                type="button"
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                aria-label={`Batalkan undangan ${i.email}`}
                title="Batalkan undangan"
                onClick={() => void run((t) => revokeInvitation(url, t, i.invitationId))}
              >
                <X class="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
