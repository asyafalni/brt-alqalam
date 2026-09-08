// Formatting shared across screens.
//
// `rupiah` lived in `RequestBoard`, and Beranda imported it from there — which dragged the whole
// Pengajuan screen into the main bundle and undid its lazy split entirely. A formatter is not a
// screen's property; anything that formats money should not have to load the screen that
// happened to define it first.

/** Indonesian thousands separators, and the symbol attached — `Rp95.000`, not `Rp 95,000`. */
export const rupiah = (n: number): string => `Rp${n.toLocaleString('id-ID')}`;
