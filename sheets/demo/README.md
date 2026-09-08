# Data contoh, siap diimpor

Isi seluruh sistem dengan data yang dipakai tombol **Muat contoh data** di aplikasi — 50 barang
di 14 rak, 44 unit berlabel, 7 pengajuan, dan 25 transaksi yang membuat setiap status bisa
terlihat: dipinjam, rusak, hilang, menipis, habis.

Ini untuk **menguji sistem yang sudah tersambung**, bukan untuk dipakai sungguhan. Kosongkan
sebelum opname yang asli.

## Mengimpor

Untuk tiap berkas, di spreadsheet:

**File → Import → Upload → pilih berkas → Import location: _Replace current sheet_**

Pilih tab yang namanya sama lebih dulu, lalu impor ke situ. *Replace current sheet*, bukan
*Insert new sheet* — kalau tidak, Anda akan punya `Items` dan `Items-1`, dan gateway membaca
yang salah tanpa mengeluh.

Urutannya tidak penting kecuali satu: **`Transactions` terakhir.** Isinya merujuk ke barang dan
rak, dan mengimpornya lebih dulu berarti sesaat log-nya menunjuk ke katalog yang belum ada.

## Sesudahnya

Jalankan `checkSpreadsheet()` di Apps Script. Ketujuh tab harus hijau, header cocok kolom demi
kolom — dan ini juga yang membuktikan header ekspor aplikasi sama dengan yang diharapkan sheet.

## Membuat ulang

Berkas-berkas ini digenerasi dari `app/src/data/demo.ts` lewat writer CSV yang sama dengan yang
dipakai tombol Ekspor. Jadi mereka bukan salinan yang bisa basi diam-diam: kalau writer dan
template berbeda, `draft.test.ts` gagal — yang sudah terjadi sekali, waktu kolom `keterangan`
hilang dari ekspor sementara sheet dan gateway sama-sama mengharapkannya.
