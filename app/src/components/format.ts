import type { RequestStatus } from '../../../domain/requests';

// Formatting shared across screens.
//
// `rupiah` lived in `RequestBoard`, and Beranda imported it from there — which dragged the whole
// Pengajuan screen into the main bundle and undid its lazy split entirely. A formatter is not a
// screen's property; anything that formats money should not have to load the screen that
// happened to define it first.

/** Indonesian thousands separators, and the symbol attached — `Rp95.000`, not `Rp 95,000`. */
export const rupiah = (n: number): string => `Rp${n.toLocaleString('id-ID')}`;

/**
 * What each request status is called, in one place.
 *
 * Here rather than in `RequestBoard` for the same reason `rupiah` is: the finder shows requests
 * on every screen, and importing the word from the Pengajuan screen would pull that whole lazy
 * chunk into the main bundle. Its coloured chips stay on the board — this is the word alone.
 */
export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  diajukan: 'Diajukan',
  selesai: 'Selesai',
  dibatalkan: 'Dibatalkan',
};
