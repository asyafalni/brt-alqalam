// People, PINs and devices — a screen, because it outgrew the panel it started in.
//
// Both lists began inside the 304px admin flyout, which was the right home for "who is signed
// in" and the wrong one for two editable lists with forms in them: names wrapped, buttons became
// icons to fit, and adding somebody meant working in a column narrower than a phone. The flyout
// keeps what it is good at — identity and a way out — and links here.

import { KeyRound, Smartphone, TriangleAlert } from '@octanejs/lucide';
import { PageHeader } from '../../components/ui';
import { Roster } from './Roster';
import { Devices } from '../gateway/Devices';
import type { AdminSession } from './AdminPanel';
import type { Connection } from '../../state/connection';

export function Manage(
  { connection, admin }: { connection: Connection | null; admin: AdminSession },
) {
  const isUtama = admin.who.role === 'admin_utama';

  if (!connection) {
    return (
      <div class="space-y-6 pt-2">
        <PageHeader title="Pengguna & Perangkat" subtitle="Perlu tersambung ke gateway." />
        <p class="text-sm text-slate-600">
          PIN dan perangkat disimpan di gateway, bukan di spreadsheet — sambungkan perangkat ini
          dulu lewat indikator di pojok kiri bawah.
        </p>
      </div>
    );
  }

  return (
    <div class="space-y-6 pt-2">
      <PageHeader
        title="Pengguna & Perangkat"
        subtitle="Siapa yang boleh mencatat, dan dari HP mana."
      />

      {/* The two halves of one permission, said once at the top rather than discovered twice.
          A PIN with no enrolled phone records nothing; an enrolled phone with no PIN records
          nothing either. */}
      <div class="grid gap-4 lg:grid-cols-2">
        <section class="space-y-2">
          <h2 class="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-500">
            <KeyRound class="h-4 w-4" /> Orang
          </h2>
          <Roster url={connection.url} getToken={admin.getToken} canManageAdmins={isUtama} />
          {!isUtama && (
            <p class="px-1 text-xs leading-relaxed text-slate-500">
              Hanya Admin Utama yang bisa membuat atau mengubah Admin lain.
            </p>
          )}
        </section>

        <section class="space-y-2">
          <h2 class="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-500">
            <Smartphone class="h-4 w-4" /> Perangkat
          </h2>
          <Devices url={connection.url} getToken={admin.getToken} />
        </section>
      </div>

      {/* The distinction that will otherwise be discovered the hard way, by an "admin" who
          cannot sign in. The roster issues PINs; it does not create accounts. */}
      <div class="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <TriangleAlert class="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div class="text-sm leading-relaxed text-slate-700">
          <p class="font-semibold text-slate-900">Peran di sini mengatur PIN, bukan akun.</p>
          <p class="mt-1">
            Seorang <strong>Admin</strong> di daftar ini punya PIN admin di kios. Untuk bisa
            <em> masuk dengan password</em> dan mengubah katalog, akunnya harus dibuat di
            dashboard Clerk — gateway sengaja tidak menyimpan kunci untuk membuat akun.
          </p>
        </div>
      </div>
    </div>
  );
}
