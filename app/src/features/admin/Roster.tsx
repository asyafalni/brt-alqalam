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
import { Dices, KeyRound, Plus, RotateCcw, ShieldCheck, UserMinus, UserPlus } from '@octanejs/lucide';
import {
  GatewayError, listRoster, setRosterActive, setRosterPin, suggestPin,
} from '../../../../data/gateway';
import type { RosterRole, RosterUser } from '../../../../data/gateway';
import { Button, ERROR_TEXT, FIELD, LABEL, Select } from '../../components/ui';

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
  needs_admin_utama: 'Hanya Admin Utama yang bisa membuat atau mengubah Admin lain.',
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
  { url, getToken, canManageAdmins = false }:
  {
    url: string;
    getToken: () => Promise<string>;
    /**
     * Whether the signed-in person is `admin_utama`.
     *
     * The gateway enforces this regardless — hiding a dropdown is decoration, and the one thing
     * an ordinary admin must not be able to do is quietly promote a colleague. This only stops
     * the screen offering an option that would be refused.
     */
    canManageAdmins?: boolean;
  },
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
    /* Filled in before the admin can type a taken one. Uniqueness by construction rather than
       by refusal — the old flow let them choose, then said no. Still overwritable. */
    void fresh();
  }

  async function fresh() {
    try {
      setPin(await suggestPin(url, await getToken()));
    } catch {
      /* Silent: an admin who has to type their own PIN is mildly inconvenienced, and the
         gateway still refuses a genuinely bad one. An error here would be noise. */
    }
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
    <div class="rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm">
      {/* A 304px panel has room for a title OR a labelled button on one line, not both — the
          heading was wrapping to two lines to make space for "+ Tambah". The button becomes an
          icon with a real accessible name, which is what the width can carry. */}
      <div class="flex items-center gap-2">
        <KeyRound class="h-4 w-4 shrink-0 text-slate-500" />
        <h2 class="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">PIN anggota</h2>
        {!editing && (
          <button
            type="button"
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-slate-50 hover:bg-slate-700"
            aria-label="Tambah orang baru"
            title="Tambah orang baru"
            onClick={() => open('new')}
          >
            <Plus class="h-4 w-4" />
          </button>
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
              {canManageAdmins && <option value="admin">Admin — PIN admin di kios</option>}
              {/* No `admin_utama`. The spec creates only Admin and Anggota in the UI (§72), and
                  a second permanent super-admin is not a thing anybody should mint by accident. */}
            </Select>
          </div>
          <div>
            <label class={LABEL} for="roster-pin">PIN baru (4–8 angka)</label>
            <div class="flex items-center gap-2">
              <input
                id="roster-pin"
                class={`${FIELD} tracking-[0.3em]`}
                type="text"
                inputmode="numeric"
                maxlength={8}
                value={pin}
                onInput={(e: Event) => setPin((e.target as HTMLInputElement).value)}
              />
              <button
                type="button"
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-500 text-slate-600 hover:bg-slate-100"
                aria-label="Ambil PIN lain yang belum dipakai"
                title="Ambil PIN lain"
                onClick={() => void fresh()}
              >
                <Dices class="h-4 w-4" />
              </button>
            </div>
            <p class="mt-1 text-xs text-slate-500">
              Sudah dipilihkan yang belum dipakai siapa pun. Boleh diganti.
            </p>
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
            <li key={u.userId} class="flex items-center gap-2 py-2">
              {u.role === 'anggota'
                ? <UserPlus class="h-4 w-4 shrink-0 text-slate-400" />
                : <ShieldCheck class="h-4 w-4 shrink-0 text-slate-500" />}

              {/* Name and role on ONE line. Two stacked lines in a 304px row is where the
                  wrapping started, and `min-w-0` is what actually lets the name truncate
                  instead of shoving the buttons off the end. */}
              <div class="flex min-w-0 flex-1 items-baseline gap-1.5">
                <span class={`truncate text-sm font-semibold ${u.disabled ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                  {u.name}
                </span>
                <span class="shrink-0 text-[11px] text-slate-500">{ROLE_LABEL[u.role] ?? u.role}</span>
              </div>

              {/* Icons, not words. "Ganti PIN" as text took a third of the row and pushed the
                  name into wrapping — and the name is the part somebody is reading. */}
              <button
                type="button"
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                aria-label={`Ganti PIN ${u.name}`}
                title="Ganti PIN"
                onClick={() => open(u)}
              >
                <KeyRound class="h-4 w-4" />
              </button>

              {/* Admin Utama has no button at all, rather than a disabled one: the spec draws
                  that account as Tetap (§72), and a control that can never work is a control
                  somebody will keep trying. */}
              {u.role !== 'admin_utama' && (
                <button
                  type="button"
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-900"
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
    </div>
  );
}
