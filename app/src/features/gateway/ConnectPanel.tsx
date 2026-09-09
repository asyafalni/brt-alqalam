// Connecting this device to the gateway.
//
// TWO KINDS OF DEVICE, and the difference is the address alone:
//
//   * a VIEWER needs only the URL. Reading is the open tier (§39), so the takmir or the boss can
//     open the register on their own phone and see that the masjid's assets are managed —
//     which is §0's third problem — without anybody issuing them a credential, granting write
//     access they never asked for, or leaving one more thing to revoke.
//   * a KIOSK adds the device secret, because recording needs one: `doPost` sees no headers, no
//     cookies and no client IP (§65.2), so an enrolled device is the only thing a PIN can be
//     rate-limited against.
//
// Done ONCE per tablet, by an admin, and then never again — so it lives in a sheet rather than
// on a screen of its own. What makes it worth care is that both failure modes are silent: a
// `/dev` URL answers with a Google sign-in page carrying HTTP 200, and a mistyped device secret
// fails only later, at the first PIN, as a refusal nobody can explain.
//
// So it TESTS before it saves. Pasting a wrong value and finding out in the gudang is the
// outcome this screen exists to prevent.

import { useEffect, useState } from 'octane';
import { CircleCheck, HardDrive, Link2, Lock, TriangleAlert, Unlink } from '@octanejs/lucide';
import { fetchState, GatewayError, openSession, closeSession } from '../../../../data/gateway';
import { clearConnection, keepStorage, saveConnection, urlProblem } from '../../state/connection';
import type { Connection } from '../../state/connection';
import { Button, CODE, ERROR_TEXT, FIELD, LABEL } from '../../components/ui';

/** What went wrong, in words that say what to do about it. */
const REASON: Record<string, string> = {
  'not-json': 'Gateway menjawab dengan halaman login, bukan data. Di Apps Script, Deploy → '
    + 'Manage deployments → Who has access harus "Anyone" (bukan "Anyone with Google account").',
  offline: 'Tidak bisa menghubungi alamat itu. Periksa koneksi, dan periksa alamatnya.',
  device_not_enrolled: 'Kode perangkat ini tidak dikenali gateway. Jalankan enrollDevice() lagi '
    + 'di Apps Script dan salin kode yang baru.',
  device_revoked: 'Perangkat ini sudah dicabut aksesnya.',
  invalid_pin: 'Perangkatnya dikenali — PIN-nya yang salah, dan itu wajar di layar ini.',
  gateway_misconfigured: 'Gateway belum selesai disetel. Jalankan setupGateway() di Apps Script.',
};
const explain = (code: string) => REASON[code] ?? `Gateway menolak: ${code}`;

export function ConnectPanel(
  { connection, onChange, queued = 0, onSendQueued, canManage = false }:
  {
    connection: Connection | null;
    onChange: (c: Connection | null) => void;
    /** Movements recorded here but not yet in the sheet. */
    queued?: number;
    onSendQueued?: () => void;
    /**
     * Whether the person looking at this may CHANGE an existing connection.
     *
     * `admin_utama` only. Disconnecting an established kiosk is how a tablet stops being able to
     * record anything until somebody with the URL and a device secret comes back to it, and the
     * person most likely to press it is the one least able to undo it.
     *
     * Connecting a device that has NO connection stays open, and that is not an oversight: the
     * admin screen needs a gateway to verify anybody against, so requiring an admin to connect
     * would mean a fresh device could never be connected by anyone, including an admin.
     *
     * This guards against an accident, not an attack — it is device-local state, and somebody
     * determined can clear it. What actually stops a reconnection being casual is that it needs
     * the gateway URL and an enrolled device secret.
     */
    canManage?: boolean;
  },
) {
  const [url, setUrl] = useState(connection?.url ?? '');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [found, setFound] = useState('');
  /* `null` while unknown: "we have not asked yet" and "the browser said no" are different
     answers, and only one of them is worth acting on. */
  const [durable, setDurable] = useState<boolean | null>(null);

  useEffect(() => {
    if (!connection?.deviceSecret) return;
    let alive = true;
    void keepStorage().then((ok) => { if (alive) setDurable(ok); });
    return () => { alive = false; };
  }, [connection?.deviceSecret]);

  async function connect() {
    setError('');
    setFound('');

    const problem = urlProblem(url);
    if (problem) { setError(problem); return; }

    setBusy(true);
    try {
      /* Two checks, because they fail for different reasons and a single one would leave the
         other undiagnosed. First: can we read at all — this catches the sign-in-page trap and
         a wrong address. */
      const state = await fetchState(url.trim());

      /* Second, and ONLY when a secret was given: is this device actually enrolled. A
         deliberately impossible PIN is used, so the reply distinguishes "device unknown" from
         "device fine, PIN wrong" WITHOUT anyone having to type a real PIN into a setup screen.
         A viewer skips this entirely — there is nothing to check. */
      if (secret.trim() !== '') try {
        const result = await openSession(url.trim(), secret.trim(), '000000000');
        // Should not happen — but if a PIN that long ever matched, do not leave it open.
        if (result.session) await closeSession(url.trim(), result.session.token).catch(() => undefined);
      } catch (err) {
        const code = err instanceof GatewayError ? err.code : 'unknown';
        // `invalid_pin` is the SUCCESS case here: the gateway got past the device check.
        if (code !== 'invalid_pin' && code !== 'locked') {
          setError(explain(code));
          setBusy(false);
          return;
        }
      }

      setFound(`${state.items.length} barang · ${state.locations.length} rak`);
      onChange(saveConnection(url, secret));
      setSecret('');
    } catch (err) {
      setError(explain(err instanceof GatewayError ? err.code : 'offline'));
    } finally {
      setBusy(false);
    }
  }

  if (connection && !found) {
    return (
      <div>
        {/* Above the "all fine" panel, because it is the one thing here that is not fine: the
            register on this screen and the register in the sheet disagree until it is sent. */}
        {queued > 0 && (
          <div class="mb-4 rounded-lg border border-amber-200 bg-amber-50/60 p-4" role="status">
            <p class="font-bold text-slate-900">
              {queued} catatan belum masuk ke spreadsheet.
            </p>
            <p class="mt-1 text-sm leading-relaxed text-slate-600">
              Tercatat atas nama siapa pun yang memasukkan PIN saat mengirim — antrean ini
              memang tidak menyimpan PIN.
            </p>
            {onSendQueued && (
              <Button size="panel" class="mt-3" onClick={onSendQueued}>Kirim sekarang</Button>
            )}
          </div>
        )}

        <div class="flex items-start gap-2.5 rounded-lg border border-green-200 bg-green-50/60 p-3">
          <CircleCheck class="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
          <div class="min-w-0">
            <p class="text-sm font-bold text-slate-900">
              {connection.deviceSecret ? 'Perangkat ini bisa mencatat.' : 'Perangkat ini bisa melihat.'}
            </p>
            <p class={`${CODE} mt-1 break-all`}>{connection.url}</p>
          </div>
        </div>

        {/* Whether the browser has PROMISED to keep the enrolment, which is otherwise invisible
            until the day it is gone. Storage is evictable under pressure and Safari discards it
            after seven days unvisited — a kiosk used daily never notices, a phone that goes a
            week between busy periods loses its enrolment for no visible reason. */}
        {connection.deviceSecret && (
          <p class="mt-2.5 flex items-start gap-2 text-[11px] leading-relaxed text-slate-600">
            <HardDrive class="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
            {durable === null
              ? 'Memeriksa ketahanan penyimpanan…'
              : durable
                ? 'Browser berjanji menyimpan pendaftaran perangkat ini secara permanen.'
                : 'Browser belum menjamin penyimpanan permanen. Kalau data situs terhapus, '
                  + 'daftarkan ulang lewat QR — sepuluh detik.'}
          </p>
        )}

        {/* One line, not a paragraph. This panel is a status somebody glances at; the reasoning
            behind the device code belongs in SETUP.md, where somebody is actually reading. */}
        <p class="mt-2.5 text-xs leading-relaxed text-slate-600">
          {connection.deviceSecret
            ? 'Katalog dibaca dari spreadsheet; pengambilan dicatat lewat gateway.'
            : 'Bisa melihat katalog dan laporan. Untuk mencatat, perlu kode perangkat.'}
        </p>

        {/* Quiet and compact. This is a rare, mildly destructive action and it was carrying
            the visual weight of a primary one — a wide pill with a 20px icon, in a panel whose
            own type is 12px. The icon says "disconnect"; the label no longer has to say it
            twice, and the full phrase stays in the accessible name. */}
        {canManage ? (
          <div class="mt-4">
            <Button
              variant="secondary"
              size="sm"
              aria-label="Putuskan sambungan perangkat ini"
              onClick={() => { clearConnection(); onChange(null); setUrl(connection.url); }}
            >
              <Unlink class="h-3.5 w-3.5" /> Putuskan
            </Button>
          </div>
        ) : (
          /* Said rather than hidden without explanation: somebody who came here to fix a
             connection problem should learn who can, not just find nothing to press. */
          <p class="mt-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[11px] leading-relaxed text-slate-600">
            <Lock class="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
            Hanya Admin Utama yang bisa memutus sambungan perangkat ini.
          </p>
        )}
        <p class="mt-2.5 text-[11px] leading-relaxed text-slate-400">
          Tablet hilang? Cabut dengan revokeDevice() di Apps Script.
        </p>
      </div>
    );
  }

  return (
    <div>
      {found && (
        <p role="status" class="mb-4 flex items-start gap-3 rounded-lg border border-green-200 bg-green-50/60 p-4">
          <CircleCheck class="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
          <span class="min-w-0 text-sm text-slate-700">
            <span class="font-bold text-slate-900">Tersambung.</span> Gateway menjawab dengan{' '}
            {found}.
          </span>
        </p>
      )}

      <label class={LABEL} for="gw-url">Alamat gateway</label>
      <input
        id="gw-url"
        class={`${FIELD} min-h-touch font-mono text-sm`}
        value={url}
        placeholder="https://script.google.com/macros/s/…/exec"
        autocomplete="off"
        onInput={(e: Event) => setUrl((e.target as HTMLInputElement).value)}
      />
      <p class="mt-1.5 text-xs text-slate-400">
        Dari Apps Script: Deploy → Manage deployments. Harus yang berakhiran <b>/exec</b>.
      </p>

      <div class="mt-4">
        <label class={LABEL} for="gw-secret">Kode perangkat (opsional)</label>
        <input
          id="gw-secret"
          class={`${FIELD} min-h-touch font-mono text-sm`}
          value={secret}
          placeholder="dicetak sekali oleh enrollDevice()"
          autocomplete="off"
          onInput={(e: Event) => setSecret((e.target as HTMLInputElement).value)}
        />
        <p class="mt-1.5 text-xs leading-relaxed text-slate-400">
          <b>Kosongkan kalau perangkat ini hanya untuk melihat</b> — laporan, stok, peta rak.
          Isi hanya untuk tablet gudang yang dipakai mencatat pengambilan: kode inilah yang
          membuat PIN 4 angka berarti, dan ia dicetak sekali oleh enrollDevice().
        </p>
      </div>

      {error && (
        <p role="alert" class="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50/60 p-3">
          <TriangleAlert class="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
          <span class={`${ERROR_TEXT} mt-0 leading-relaxed`}>{error}</span>
        </p>
      )}

      <div class="mt-5">
        <Button size="panel" disabled={busy} onClick={() => void connect()}>
          <Link2 class="h-5 w-5" />
          {busy ? 'Menguji…' : secret.trim() === '' ? 'Sambungkan untuk melihat' : 'Sambungkan'}
        </Button>
      </div>

      {/* Said out loud because it was decided out loud: this is the trade the design already
          assumed, and §65.2's answer to it is that revoking is one deleted row. */}
      {secret.trim() !== '' && (
        <p class="mt-4 text-xs leading-relaxed text-slate-400">
          Kode perangkat disimpan di perangkat ini saja. Artinya siapa pun yang memegang tablet
          ini bisa membuka layar PIN — jadi tempatkan tabletnya sebagaimana Anda menempatkan
          kunci gudang.
        </p>
      )}
    </div>
  );
}
