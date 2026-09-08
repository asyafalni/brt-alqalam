// Issuing PINs to the people who use the kiosk.
//
// Adding a marbot used to mean opening the Apps Script editor, editing three constants in
// `setUserPin()` and pressing Run. That works for whoever built the thing and for nobody else,
// and §0's test is whether a change removes work from people or adds it. An admin with a phone
// can now hand somebody a PIN.
//
// THE PIN IS SHOWN ONCE, HERE, AND NEVER AGAIN. It is not stored in a readable form anywhere —
// the gateway keeps HMAC-SHA256(pin, salt) keyed with a secret pepper (§65.4) — so this screen
// cannot look one up later and neither can anybody else. That is the property worth protecting,
// so the screen says it out loud rather than letting an admin discover it by needing it.

import { useEffect, useState } from 'octane';
import { KeyRound, Plus, RotateCcw, ShieldCheck, UserMinus, UserPlus } from '@octanejs/lucide';
import { GatewayError, listRoster, setRosterActive, setRosterPin } from '../../../../data/gateway';
import type { RosterRole, RosterUser } from '../../../../data/gateway';
import { Button, Card, ERROR_TEXT, FIELD, LABEL, Select } from '../../components/ui';

const ROLE_LABEL: Record<RosterRole, string> = {
  admin_utama: 'Admin Utama',
  admin: 'Admin',
  anggota: 'Anggota',
};

const REASON: Record<string, string> = {
  pin_taken: 'PIN itu sudah dipakai orang lain. Pilih PIN lain — PIN harus unik, karena PIN '
    + 'sendirian yang menentukan siapa yang mencatat.',
  bad_pin: 'PIN harus 4–8 angka.',
  bad_role: 'Peran tidak dikenal.',
  name_required: 'Nama tidak boleh kosong.',
  admin_utama_permanent: 'Admin Utama tidak bisa dinonaktifkan.',
  'not-admin': 'Hanya admin yang bisa mengelola PIN.',
  offline: 'Tidak bisa menghubungi gateway.',
};
function explain(e: unknown): string {
  if (!(e instanceof GatewayError)) return REASON.offline;
  const known = REASON[e.code];
  if (known) return known;
  // The hint is what the gateway actually threw. Without it `server_error` is a dead end.
  return e.hint ? `Gateway menolak: ${e.code} — ${e.hint}` : `Gateway menolak: ${e.code}`;
}

export function Roster(
  { url, getToken }: { url: string; getToken: () => Promise<string> },
) {
  const [users, setUsers] = useState<RosterUser[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState<RosterUser | 'new' | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState<RosterRole>('anggota');
  const [pin, setPin] = useState('');
  /** Shown once after a successful save, because there is no second chance to read it. */
  const [issued, setIssued] = useState<{ name: string; pin: string } | null>(null);

  const run = async (fn: (token: string) => Promise<RosterUser[]>) => {
    setBusy(true);
    setError('');
    try {
      setUsers(await fn(await getToken()));
      return true;
    } catch (err) {
      setError(explain(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { void run((t) => listRoster(url, t)); }, [url]);

  function open(user: RosterUser | 'new') {
    setEditing(user);
    setIssued(null);
    setError('');
    setName(user === 'new' ? '' : user.name);
    setRole(user === 'new' ? 'anggota' : user.role);
    setPin('');
  }

  async function save(e: Event) {
    e.preventDefault();
    const target = editing;
    if (!target) return;
    const ok = await run((t) => setRosterPin(url, t, {
      userId: target === 'new' ? undefined : target.userId,
      name: name.trim(),
      role,
      pin,
    }));
    if (!ok) return;
    setIssued({ name: name.trim(), pin });
    setEditing(null);
    setPin('');
  }

  return (
    <Card>
      <div class="flex items-center justify-between gap-3">
        <h2 class="flex items-center gap-2 text-base font-bold text-slate-900">
          <KeyRound class="h-4 w-4 text-slate-500" />
          PIN anggota
        </h2>
        {!editing && (
          <Button size="sm" onClick={() => open('new')}>
            <Plus class="h-4 w-4" /> Tambah
          </Button>
        )}
      </div>

      {/* Shown ONCE. There is no screen anywhere that can show it again, so this says so. */}
      {issued && (
        <div class="mt-3 rounded-lg border border-green-200 bg-green-50 p-3">
          <p class="text-sm font-semibold text-green-800">
            PIN {issued.name}: <span class="font-mono text-lg tracking-[0.3em]">{issued.pin}</span>
          </p>
          <p class="mt-1 text-xs text-green-700">
            Catat sekarang — PIN tidak bisa dilihat lagi setelah panel ini ditutup.
          </p>
        </div>
      )}

      {editing && (
        <form class="mt-3 space-y-3 rounded-lg border border-slate-200 p-3" onSubmit={save}>
          <div>
            <label class={LABEL} for="roster-name">Nama</label>
            <input
              id="roster-name"
              class={FIELD}
              value={name}
              onInput={(e: Event) => setName((e.target as HTMLInputElement).value)}
            />
          </div>
          <div>
            <label class={LABEL} for="roster-role">Peran</label>
            <Select
              id="roster-role"
              value={role}
              onChange={(e: Event) => setRole((e.target as HTMLSelectElement).value as RosterRole)}
            >
              <option value="anggota">Anggota — mencatat dengan PIN di kios</option>
              <option value="admin">Admin — juga bisa mengubah katalog</option>
              {/* No `admin_utama`. The spec creates only Admin and Anggota in the UI (§72), and
                  a second permanent super-admin is not a thing anybody should mint by accident. */}
            </Select>
          </div>
          <div>
            <label class={LABEL} for="roster-pin">PIN baru (4–8 angka)</label>
            <input
              id="roster-pin"
              class={`${FIELD} tracking-[0.3em]`}
              type="text"
              inputmode="numeric"
              maxlength={8}
              value={pin}
              onInput={(e: Event) => setPin((e.target as HTMLInputElement).value)}
            />
          </div>

          {error && <p class={ERROR_TEXT} role="alert">{error}</p>}

          <div class="flex items-center gap-2">
            <Button type="submit" size="panel" disabled={busy || !name.trim() || pin.length < 4}>
              {busy ? 'Menyimpan…' : editing === 'new' ? 'Buat' : 'Ganti PIN'}
            </Button>
            <button
              type="button"
              class="text-sm font-semibold text-slate-500 hover:text-slate-900"
              onClick={() => { setEditing(null); setError(''); }}
            >
              Batal
            </button>
          </div>
        </form>
      )}

      {!editing && error && <p class={`${ERROR_TEXT} mt-2`} role="alert">{error}</p>}

      {users === null ? (
        <p class="mt-3 text-sm text-slate-500">Memuat…</p>
      ) : users.length === 0 ? (
        <p class="mt-3 text-sm text-slate-500">
          Belum ada siapa pun. Marbot butuh PIN untuk mencatat pengambilan di kios.
        </p>
      ) : (
        <ul class="mt-3 divide-y divide-slate-200">
          {users.map((u) => (
            <li key={u.userId} class="flex items-center gap-3 py-2.5">
              {u.role === 'anggota'
                ? <UserPlus class="h-4 w-4 shrink-0 text-slate-400" />
                : <ShieldCheck class="h-4 w-4 shrink-0 text-slate-500" />}
              <div class="min-w-0 flex-1">
                <p class={`truncate text-sm font-semibold ${u.disabled ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                  {u.name}
                </p>
                <p class="text-xs text-slate-500">{ROLE_LABEL[u.role] ?? u.role}</p>
              </div>

              <button
                type="button"
                class="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => open(u)}
              >
                Ganti PIN
              </button>

              {/* Admin Utama has no button at all, rather than a disabled one: the spec draws
                  that account as Tetap (§72), and a control that can never work is a control
                  somebody will keep trying. */}
              {u.role !== 'admin_utama' && (
                <button
                  type="button"
                  class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                  aria-label={u.disabled ? `Aktifkan ${u.name}` : `Nonaktifkan ${u.name}`}
                  title={u.disabled ? 'Aktifkan lagi' : 'Nonaktifkan'}
                  onClick={() => void run((t) => setRosterActive(url, t, u.userId, !u.disabled))}
                >
                  {u.disabled ? <RotateCcw class="h-4 w-4" /> : <UserMinus class="h-4 w-4" />}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
