# SPEC INVENTORY — Requirements PDF (15 pages), literal transcription

Source: `scratchpad/spec/p-01.png` … `p-15.png` (rendered pages of the BRT Masjid Al-Qalam
requirements document). Everything below is transcribed as written, in Bahasa Indonesia,
including capitalisation, punctuation and spelling as it appears. Annotation text (the grey
callout boxes and the arrow-prefixed notes) is the *actual requirement text* and is quoted
verbatim.

**Verified page → heading mapping** (read from the images, not assumed):

| Page | Heading as written |
| --- | --- |
| p-01 | `SISTEM DATA INVENTARIS BRT MASJID AL-QALAM` (document title + MENU UTAMA screen) |
| p-02 | `MENU STOK 1 :` |
| p-03 | `MENU STOK 2 :` |
| p-04 | `MENU STOK 3 :` (+ footer line about MENU STOK 4–14) |
| p-05 | `MENU STOK 15 :` |
| p-06 | `MENU STOK 16 :` |
| p-07 | `MENU ADMIN :` |
| p-08 | `MENU ADMIN – PENYETELAN WAKTU :` |
| p-09 | `MENU ADMIN – BUAT PASSWORD :` |
| p-10 | `MENU ADMIN – GANTI PASSWORD :` |
| p-11 | `MENU ADMIN – EDIT MENU UTAMA :` |
| p-12 | `MENU ADMIN – EDIT JENIS BARANG :` |
| p-13 | `MENU ADMIN – TAMBAH/KURANG STOK :` |
| p-14 | `MENU ADMIN – NOTIFIKASI STOK :` |
| p-15 | `MENU ADMIN – HISTORI DATA :` |

> Note: there is **no page for MENU STOK 4–14**; p-04 ends with the line
> `MENU STOK 4 dan seterusnya hingga MENU STOK 14` (see p-04), i.e. those 11 screens are
> explicitly declared identical in structure to MENU STOK 1/2/3.

---

## p-01 — SISTEM DATA INVENTARIS BRT MASJID AL-QALAM (MENU UTAMA)

**Page heading (title):** `SISTEM DATA INVENTARIS BRT MASJID AL-QALAM`
**Green banner:** `SISTEM DATA INVENTARIS BRT MASJID AL-QALAM`

**Annotation (top):**
> `Saat aplikasi dibuka langsung masuk ke tampilan` **`MENU UTAMA`**

### Screen: MENU UTAMA
- Title chip: `MENU UTAMA`
- Subtitle: `SISTEM DATA INVENTARIS BRT`
- Instruction: `PILIH SALAH SATU KATEGORI YANG DIINGINKAN :`
- Each row has a **radio button** on the right.

**The 17 menu rows and their targets** (arrow text `masuk ke` → target chip):

| # | Row label (exact) | Target |
| --- | --- | --- |
| 1 | `1. PERLENGKAPAN KEBERSIHAN` | `MENU STOK 1` |
| 2 | `2. PERLENGKAPAN SANITASI & PLUMBING` | `MENU STOK 2` |
| 3 | `3. PERLENGKAPAN LISTRIK` | `MENU STOK 3` |
| 4 | `4. PERLENGKAPAN ELEKTRONIK` | `MENU STOK 4` |
| 5 | `5. PERLENGKAPAN SIPIL` | `MENU STOK 5` |
| 6 | `6. PERLENGKAPAN KEAMANAN` | `MENU STOK 6` |
| 7 | `7. PERLENGKAPAN PHBI` | `MENU STOK 7` |
| 8 | `8. PERLENGKAPAN LAIN-LAIN` | `MENU STOK 8` |
| 9 | `9. PERALATAN KEBERSIHAN` | `MENU STOK 9` |
| 10 | `10. PERALATAN SANITASI & PLUMBING` | `MENU STOK 10` |
| 11 | `11. PERALATAN LISTRIK` | `MENU STOK 11` |
| 12 | `12. PERALATAN ELEKTRONIK` | `MENU STOK 12` |
| 13 | `13. PERALATAN SIPIL` | `MENU STOK 13` |
| 14 | `14. PERALATAN KEAMANAN` | `MENU STOK 14` |
| 15 | `15. PERALATAN PHBI` | `MENU STOK 15` |
| 16 | `16. PERALATAN LAIN-LAIN` | `MENU STOK 16` |
| 17 | `17. ADMIN` | `MENU ADMIN` |

- Button: `KELUAR` → arrow text `keluar dari aplikasi`

**Annotation (bottom):**
> `Pilih salah satu aksi yang akan dikerjakan atau tekan` **`KELUAR`** `untuk keluar dari Aplikasi`

---

## p-02 — MENU STOK 1

**Page heading:** `MENU STOK 1 :`

### Screen: MENU STOK 1
- Title chip: `MENU STOK 1`
- Subtitle: `DAFTAR STOK 1 : PERLENGKAPAN KEBERSIHAN`

**Table — two header rows.** Row 1 is spreadsheet column letters (green), row 2 is the actual
header (grey):

| A | B | C | D | E | F |
| --- | --- | --- | --- | --- | --- |
| `NO` | `NAMA BARANG` | `STOK AWAL` | `PENGAMBILAN` | `STOK AKHIR` | `KETERANGAN` |

**Example data rows (exact):**

| NO | NAMA BARANG | STOK AWAL | PENGAMBILAN | STOK AKHIR | KETERANGAN |
| --- | --- | --- | --- | --- | --- |
| 1 | Sabun Cuci Tangan | 10 galon | 0 galon | 10 galon | `- pemakaian` |
| 2 | Pembersih Lantai | 10 galon | 0 galon | 10 galon | `- pemakaian` |
| 3 | Kamper | 10 pak | 0 pak | 10 pak | `- pemakaian` |
| 4 | Pengharum Ruangan (refill) | 10 buah | 0 buah | 10 buah | `- pemakaian` |
| 5 | Tissue Gulung Toilet | 10 gulung | 0 gulung | 10 gulung | `- pemakaian` |
| dst | dst | | | | |

**Footnote under table:**
> `* pilih salah satu barang yang akan diambil dengan mengklik pada baris barang tersebut`

- Button: `KEMBALI KE MENU UTAMA`

**Annotation:**
> `Pada saat salah satu baris yang akan diambil/dikembalikan dipilih, tampilan akan menjadi :`

### Screen: PENDATAAN PENGAMBILAN BARANG
- Title chip: `PENDATAAN PENGAMBILAN BARANG`
- Left panel label: `Pilih jumlah yang diinginkan :` with an up/down **stepper** (▲ / value `0` / ▼)
- Right panel label: `Keterangan Barang :`
  - **A free-text input box sits directly under the "Keterangan Barang :" label, above the radio list.**
  - Radio options, in this exact order:
    1. `Pemakaian`
    2. `Pengambilan`
    3. `Pengembalian`
    4. `Peminjaman`
    5. `Digunakan`
- Button: `OK`

**Annotation (right of this screen):**
> `Setelah memilih jumlah yang diinginkan, anda diwajibkan memberi keterangan pada kolom Keterangan Barang yang sesuai dengan kegunaannya`

### Screen: VERIFIKASI PENGAMBILAN BARANG
- Title chip: `VERIFIKASI PENGAMBILAN BARANG`
- Label: `Masukkan 4 digit Password anda`
- 4 masked entry cells: `x x x x`
- Numeric keypad laid out as:
  ```
  7 8 9
  4 5 6
  1 2 3
  0 ←
  ```
- Red error text: `* Password yg anda masukkan salah`

**Annotation (pointing at the verification screen):**
> `Verifikasi pengambilan barang dengan memasukkan Password Anggota anda dengan benar. Sebagai Admin, Password nya tetap dapat digunakan`

**Annotation (behaviour):**
> `Sistem akan secara otomatis menghitung sisa stok yang ada, mencatat hari, tanggal dan jam pengambilan, serta siapa yang mengambil barang tersebut. Hasil pencatatan dapat dilihat oleh Admin di` **`MENU ADMIN`** `- Cek Histori Data`

**Annotation (bottom):**
> `Selesai, otomatis kembali ke` **`MENU STOK 1`**

---

## p-03 — MENU STOK 2

**Page heading:** `MENU STOK 2 :`

- Title chip: `MENU STOK 2`
- Subtitle: `DAFTAR STOK 2 : PERLENGKAPAN SANITASI DAN PLUMBING`
  - ⚠️ Note the wording here is **"SANITASI DAN PLUMBING"** (spelled out "DAN"), whereas the
    MENU UTAMA row 2 and EDIT MENU UTAMA row 2 and EDIT JENIS BARANG heading say
    **"SANITASI & PLUMBING"**. Both spellings occur in the document.

**Table headers:** identical — A/B/C/D/E/F → `NO` · `NAMA BARANG` · `STOK AWAL` · `PENGAMBILAN` · `STOK AKHIR` · `KETERANGAN`

**Example data:**

| NO | NAMA BARANG | STOK AWAL | PENGAMBILAN | STOK AKHIR | KETERANGAN |
| --- | --- | --- | --- | --- | --- |
| 1 | Kran Wudhu | 10 buah | 0 buah | 10 buah | `- pemakaian` |
| 2 | Kran Wastafel | 10 buah | 0 buah | 10 buah | `- pemakaian` |
| 3 | Kran Toilet | 10 buah | 0 buah | 10 buah | `- pemakaian` |
| 4 | Jet Shower | 10 buah | 0 buah | 10 buah | `- pemakaian` |
| 5 | Selang Fleksibel | 10 buah | 0 buah | 10 buah | `- pemakaian` |
| dst | dst | | | | |

Footnote, `KEMBALI KE MENU UTAMA` button, PENDATAAN / VERIFIKASI screens and all four
annotations are **identical to p-02**, except the final line:
> `Selesai, otomatis kembali ke` **`MENU STOK 2`**

---

## p-04 — MENU STOK 3

**Page heading:** `MENU STOK 3 :`

- Title chip: `MENU STOK 3`
- Subtitle: `DAFTAR STOK 3 : PERLENGKAPAN LISTRIK`

**Table headers:** identical (A–F → `NO` · `NAMA BARANG` · `STOK AWAL` · `PENGAMBILAN` · `STOK AKHIR` · `KETERANGAN`)

**Example data:**

| NO | NAMA BARANG | STOK AWAL | PENGAMBILAN | STOK AKHIR | KETERANGAN |
| --- | --- | --- | --- | --- | --- |
| 1 | Lampu Downlight Kecil | 10 buah | 0 buah | 10 buah | `- pemakaian` |
| 2 | Lampu Downlight Besar | 10 buah | 0 buah | 10 buah | `- pemakaian` |
| 3 | Lampu Sorot | 10 buah | 0 buah | 10 buah | `- pemakaian` |
| 4 | Lampu PJU | 10 buah | 0 buah | 10 buah | `- pemakaian` |
| 5 | Kabel Listrik 3 x 1,5 mm² | 10 meter | 0 meter | 10 meter | `- pemakaian` |
| dst | dst | | | | |

Same footnote, same button, same PENDATAAN + VERIFIKASI screens and annotations; final line:
> `Selesai, otomatis kembali ke` **`MENU STOK 3`**

**Bottom-of-page line (verbatim, in the same underlined-heading style):**
> `MENU STOK 4` `dan seterusnya hingga` `MENU STOK 14`

(i.e. MENU STOK 4 through MENU STOK 14 are declared to follow the same pattern; no separate
mock-ups are drawn for them.)

---

## p-05 — MENU STOK 15

**Page heading:** `MENU STOK 15 :`

- Title chip: `MENU STOK 15`
- Subtitle: `DAFTAR STOK 15 : PERALATAN PHBI`

**Table headers:** identical A–F.

**Example data — note the KETERANGAN values differ here:**

| NO | NAMA BARANG | STOK AWAL | PENGAMBILAN | STOK AKHIR | KETERANGAN |
| --- | --- | --- | --- | --- | --- |
| 1 | Pisau Potong | 10 buah | 0 buah | 10 buah | `- pengembalian` |
| 2 | Timbangan 10 kg | 10 unit | 0 unit | 10 unit | `- pengembalian` |
| 3 | Alat Potong Bendsaw | 10 unit | 0 unit | 10 unit | `- pengembalian` |
| 4 | Pengait Letter S | 10 buah | 0 buah | 10 buah | `- pengembalian` |
| 5 | Gerobak 4 Roda | 10 buah | 0 buah | 10 buah | `- peminjaman` |
| dst | dst | | | | |

Same footnote, button, PENDATAAN + VERIFIKASI screens and annotations; final line:
> `Selesai, otomatis kembali ke` **`MENU STOK 15`**

---

## p-06 — MENU STOK 16

**Page heading:** `MENU STOK 16 :`

- Title chip: `MENU STOK 16`
- Subtitle: `DAFTAR STOK 16 : PERALATAN LAIN-LAIN`

**Table headers:** identical A–F.

**Example data — deliberately EMPTY (placeholder dashes):**

| NO | NAMA BARANG | STOK AWAL | PENGAMBILAN | STOK AKHIR | KETERANGAN |
| --- | --- | --- | --- | --- | --- |
| 1 | `-` | `- buah` | `- buah` | `- buah` | `- pemakaian` |
| 2 | `-` | `- buah` | `- buah` | `- buah` | `- pemakaian` |
| 3 | `-` | `- buah` | `- buah` | `- buah` | `- pemakaian` |
| 4 | `-` | `- buah` | `- buah` | `- buah` | `- pemakaian` |
| 5 | `-` | `- buah` | `- buah` | `- buah` | `- pemakaian` |
| dst | dst | | | | |

Same footnote, button, PENDATAAN + VERIFIKASI screens and annotations; final line:
> `Selesai, otomatis kembali ke` **`MENU STOK 16`**

---

## p-07 — MENU ADMIN

**Page heading:** `MENU ADMIN :`
**Green banner:** `MENU ADMIN`

**Annotation:**
> `Saat` **`MENU ADMIN`** `dipilih, maka anda diharuskan mengisi` **`Password Admin`** `terlebih dahulu`

### Screen: (Admin password gate — no title chip)
- Label: `Masukkan 4 digit Password anda`
- 4 masked cells `x x x x`
- Keypad `7 8 9 / 4 5 6 / 1 2 3 / 0 ←`
- Red error text: `* Password yg anda masukkan salah`

**Annotation:**
> `Setelah` **`PASSWORD`** `yang dimasukkan benar`

### Screen: MENU ADMIN
- Title chip: `MENU ADMIN`
- Instruction: `PILIH AKSI YANG AKAN DILAKUKAN :`
- Radio options, in this exact order:
  1. `Penyetelan Waktu`
  2. `Buat Password`
  3. `Ganti Password`
  4. `Edit Menu Utama`
  5. `Edit Jenis Barang`
  6. `Tambah/Kurang Stok`
  7. `Notifikasi Stok`
  8. `Cek Histori Data`
- Button: `KELUAR`

**Annotation (bottom):**
> `Pilih salah satu aksi yang akan dilakukan atau tekan` **`KELUAR`** `untuk keluar dari` **`MENU ADMIN`** `dan kembali ke` **`MENU UTAMA`**

---

## p-08 — MENU ADMIN – PENYETELAN WAKTU

**Page heading:** `MENU ADMIN – PENYETELAN WAKTU :`

### Screen: PENYETELAN WAKTU
- Title chip: `PENYETELAN WAKTU`
- **Five green column headers, each with its own stepper (▲ / `0` / ▼) below:**
  `TANGGAL` · `BULAN` · `TAHUN` · `JAM` · `MENIT`
- Radio options:
  - `Manual`
  - `Otomatis`
- Button: `SET`
- Footnote (small italic):
  > `* Angka awal yang tertera adalah angka terkini berdasarkan waktu pada saat ini`

**Annotation:**
> `Setelah menekan` **`SET`** `data akan disimpan dan tampilan otomatis kembali ke` **`MENU ADMIN`**

*(Note: no default is marked on either radio in the drawing — neither `Manual` nor `Otomatis`
is shown pre-selected. `DETIK` (seconds) is NOT a field — resolution is minutes.)*

---

## p-09 — MENU ADMIN – BUAT PASSWORD

**Page heading:** `MENU ADMIN – BUAT PASSWORD :`

### Screen: BUAT PASSWORD (roster list)
- Title chip: `BUAT PASSWORD`
- Rows, each of the form:
  `- Password [x x x x] atas nama : [x x x x x x x x]  - <ROLE>  [action]`

| Row | Password cells | Name cells | Role label | Right-hand control |
| --- | --- | --- | --- | --- |
| 1 | 4 cells | 8 cells | `- Admin Utama` | `Tetap` (a static box, **not** a radio — no delete) |
| 2 | 4 cells | 8 cells | `- Admin` | `○ Hapus` |
| 3 | 4 cells | 8 cells | `- Anggota` | `○ Hapus` |
| 4 | `- dst` | | | |

- Footnote (small italic): `(* Hanya Nama - Password disembunyikan)`
- Right-hand control below the list: `○  Buat Password baru`
- Button: `KEMBALI KE MENU ADMIN`

**Annotation — delete flow:**
> `Saat tanda` `○ Hapus` `dipilih, akan keluar pertanyaan :`

Confirmation dialog:
- `Apakah anda yakin ?`
  - `○ YA`
  - `○ TIDAK`

> `Jika YA, maka Password yang dihapus tidak bisa digunakan lagi dan tampilan akan kembali ke Menu` **`BUAT PASSWORD`**
> `Jika TIDAK, maka akan kembali ke Menu` **`BUAT PASSWORD`**

**Annotation — create flow:**
> `Saat tanda` `○ Buat Password baru` `dipilih, akan keluar tampilan :`

Three sequential screens:

**1) BUAT PASSWORD**
- Title chip: `BUAT PASSWORD`
- Radios: `○ Admin`   `○ Anggota`
- Footnote: `* Pilih Password sebagai Admin atau Anggota`
- Label: `Masukkan 4 digit Password anda`
- 4 masked cells + keypad `7 8 9 / 4 5 6 / 1 2 3 / 0 ←`
- Red error text: `* Password yg anda masukkan sudah digunakan, pilih Password lain`

**2) VERIFIKASI PASSWORD**
- Title chip: `VERIFIKASI PASSWORD`
- Label: `Verifikasi ulang Password anda`
- 4 masked cells + keypad
- Red error text: `* Password yg anda masukkan salah`

**3) BUAT NAMA**
- Title chip: `BUAT NAMA`
- Label: `Masukkan nama anda`
- 8 entry cells `x x x x x x x x`
- Red footnote: `* maksimum 16 karakter`
- On-screen QWERTY keyboard:
  ```
  Q W E R T Y U I O P
  A S D F G H J K L
  Z X C V B N M  .  ←
        SPASI
  ```
- Button: `SIMPAN`

**Annotation (audit):**
> `Saat tanda` `○ Hapus` `atau` **`SIMPAN`** `dipilih, semua perubahan dicatat berikut hari, tanggal dan jam perubahannya. Hasil pencatatan dapat dilihat oleh Admin di` **`MENU SETTING`** `- Cek Histori Data`

**Annotations (navigation):**
> `Setelah menekan` **`SIMPAN`** `, tampilan otomatis akan kembali ke Menu` **`BUAT PASSWORD`**
> `Tekan` **`KEMBALI KE MENU ADMIN`** `untuk kembali kembali ke` **`MENU ADMIN`**

*(Note: the annotations on p-09 through p-13 still say `MENU SETTING` even though the menu was
renamed `MENU ADMIN` — an inconsistency left in the document.)*

---

## p-10 — MENU ADMIN – GANTI PASSWORD

**Page heading:** `MENU ADMIN – GANTI PASSWORD :`

Four sequential screens:

**1) GANTI PASSWORD**
- Title chip: `GANTI PASSWORD`
- Radios: `○ Admin`   `○ Anggota`
- Footnote: `* Pilih Password sebagai Admin atau Anggota`
- Label: `Masukkan 4 digit Password anda`
- 4 masked cells + keypad `7 8 9 / 4 5 6 / 1 2 3 / 0 ←`
- Red error text: `* Password yg anda masukkan sudah digunakan, pilih Password lain`

**2) PASSWORD BARU**
- Title chip: `PASSWORD BARU`
- Label: `Masukkan 4 digit Password baru`
- 4 masked cells + keypad
- Red error text: `* Password yg anda masukkan sudah digunakan, pilih Password lain`

**3) VERIFIKASI PASSWORD**
- Title chip: `VERIFIKASI PASSWORD`
- Label: `Verifikasi ulang Password anda`
- 4 masked cells + keypad
- Red error text: `* Password yg anda masukkan salah`

**4) BUAT NAMA**
- Title chip: `BUAT NAMA`
- Label: `Masukkan nama anda`
- 8 entry cells, red footnote `* maksimum 16 karakter`
- On-screen QWERTY keyboard (`QWERTYUIOP / ASDFGHJKL / ZXCVBNM . ←` / `SPASI`)
- Button: `SIMPAN`

**Annotation (audit):**
> `Saat tanda` **`SIMPAN`** `ditekan, semua perubahan dicatat berikut hari, tanggal dan jam perubahannya. Hasil pencatatan dapat dilihat oleh Admin di` **`MENU SETTING`** `- Cek Histori Data`

**Annotation (navigation):**
> `Setelah menekan` **`SIMPAN`** `, tampilan otomatis akan kembali ke` **`MENU ADMIN`**

*(Note: GANTI PASSWORD also ends with a BUAT NAMA step — i.e. changing a password re-enters the
name too. There is no "old password of a specific named user" selector — the person is
identified by entering their existing PIN.)*

---

## p-11 — MENU ADMIN – EDIT MENU UTAMA

**Page heading:** `MENU ADMIN – EDIT MENU UTAMA :`

### Screen: EDIT MENU UTAMA
- Title chip: `EDIT MENU UTAMA`
- Subtitle: `SISTEM DATA INVENTARIS BRT`
- Instruction: `PILIH SALAH SATU KATEGORI YANG DIINGINKAN :`
- The **same 17 rows** as MENU UTAMA, but each row now has a **dropdown marker `▼`** instead of a
  radio button:
  1. `1. PERLENGKAPAN KEBERSIHAN` ▼
  2. `2. PERLENGKAPAN SANITASI & PLUMBING` ▼
  3. `3. PERLENGKAPAN LISTRIK` ▼
  4. `4. PERLENGKAPAN ELEKTRONIK` ▼
  5. `5. PERLENGKAPAN SIPIL` ▼
  6. `6. PERLENGKAPAN KEAMANAN` ▼
  7. `7. PERLENGKAPAN PHBI` ▼
  8. `8. PERLENGKAPAN LAIN-LAIN` ▼
  9. `9. PERALATAN KEBERSIHAN` ▼
  10. `10. PERALATAN SANITASI & PLUMBING` ▼
  11. `11. PERALATAN LISTRIK` ▼
  12. `12. PERALATAN ELEKTRONIK` ▼
  13. `13. PERALATAN SIPIL` ▼
  14. `14. PERALATAN KEAMANAN` ▼
  15. `15. PERALATAN PHBI` ▼
  16. `16. PERALATAN LAIN-LAIN` ▼
  17. `17. ADMIN` ▼   ← **the ADMIN row also carries an edit dropdown**
- Button: `KEMBALI KE MENU ADMIN`

**Annotation:**
> `Saat tanda` `▼` `dipilih, akan keluar tampilan :`

Popup panel containing a combo box (`▼`) and three radios:
- `○ Edit`   → `Edit Kategori yang dikehendaki`
- `○ Tambah` → `masuk ke Menu` **`TAMBAH KATEGORI`**
- `○ Hapus`  → `Hapus Kategori ini dari daftar`

### Screen: TAMBAH KATEGORI
- Title chip: `TAMBAH KATEGORI`
- Radios: `○ Jenis Barang`   `○ Satuan`
- One yellow text field (dashed placeholder)
- Footnote (small italic): `* Isi Jenis Barang serta Satuannya secara bergantian`
- Full on-screen keyboard:
  ```
  ' 1 2 3 4 5 6 7 8 9 0 - = ←
  Tab Q W E R T Y U I O P { } Enter
  Caps A S D F G H J K L : ' \
  Shift Z X C V B N M , . / Shift
            SPASI
  ```
- Buttons: `KEMBALI`   `SIMPAN`

**Annotation (audit):**
> `Saat tanda` **`SIMPAN`** `dipilih, semua perubahan dicatat berikut hari, tanggal & jam perubahannya. Hasil pencatatan dapat dilihat oleh Admin di` **`MENU SETTING`** `- Cek Histori Data`

**Annotation (navigation):**
> `Otomatis kembali ke Menu` **`EDIT MENU UTAMA`**

⚠️ **Anomaly worth flagging:** the `TAMBAH KATEGORI` screen is drawn with `Jenis Barang` / `Satuan`
radios and the note `* Isi Jenis Barang serta Satuannya secara bergantian` — i.e. it is the *same
form as* `TAMBAH JENIS BARANG` (p-12), not a category-name form. Either the drawing was copied,
or adding a category is meant to immediately capture its first item + unit.

---

## p-12 — MENU ADMIN – EDIT JENIS BARANG

**Page heading:** `MENU ADMIN – EDIT JENIS BARANG :`

### Screen: EDIT JENIS BARANG
- Title chip: `EDIT JENIS BARANG`
- Shows **multiple category tables stacked on one screen**:

**Sub-heading 1:** `DAFTAR STOK 1 : PERLENGKAPAN KEBERSIHAN`
Headers A–F: `NO` · `NAMA BARANG` · `STOK AWAL` · `PENGAMBILAN` · `STOK AKHIR` · `KETERANGAN`
Rows 1–5 = Sabun Cuci Tangan / Pembersih Lantai / Kamper / Pengharum Ruangan (refill) /
Tissue Gulung Toilet (10 galon/galon/pak/buah/gulung, 0 taken, 10 remaining, `- pemakaian`),
plus `dst`.
**Each NAMA BARANG cell carries a `▼` dropdown marker** (including the `dst` row).

Footnote:
> `* Klik tanda` `▼` `untuk mengedit, saat ada penambahan/penghapusan Nama Jenis Barang nomor urut akan berubah secara otomatis`

**Sub-heading 2:** `DAFTAR STOK 2 : PERLENGKAPAN SANITASI & PLUMBING`
Same headers; rows Kran Wudhu / Kran Wastafel / Kran Toilet / Jet Shower / Selang Fleksibel
(10 buah / 0 buah / 10 buah / `- pemakaian`), plus `dst`, each with `▼`.
Same footnote repeated verbatim.

**Then, in place of the remaining tables:**
> `DAFTAR STOK 3 : PERLENGKAPAN LISTRIK`
> `hingga`
> `DAFTAR STOK 16 : PERALATAN LAIN-LAIN`

- Button: `KEMBALI KE MENU ADMIN`

**Annotation:**
> `Saat tanda` `▼` `dipilih, akan keluar tampilan :`

Popup panel with a combo box and three radios:
- `○ Edit`   → `Edit Nama Barang yang dikehendaki`
- `○ Tambah` → `masuk ke Menu` **`TAMBAH JENIS BARANG`**
- `○ Hapus`  → `Hapus Jenis Barang ini dari daftar`

### Screen: TAMBAH JENIS BARANG
- Title chip: `TAMBAH JENIS BARANG`
- Radios: `○ Jenis Barang`   `○ Satuan`
- One yellow text field (dashed placeholder)
- Footnote: `* Isi Jenis Barang serta Satuannya secara bergantian`
- Full on-screen keyboard (same layout as p-11)
- Buttons: `KEMBALI`   `SIMPAN`

**Annotation (audit):**
> `Saat tanda` **`SIMPAN`** `dipilih, semua perubahan dicatat berikut hari, tanggal & jam perubahannya. Hasil pencatatan dapat dilihat oleh Admin di` **`MENU SETTING`** `- Cek Histori Data`

**Annotation (navigation):**
> `Otomatis kembali ke Menu` **`EDIT JENIS BARANG`**

---

## p-13 — MENU ADMIN – TAMBAH/KURANG STOK

**Page heading:** `MENU ADMIN – TAMBAH/KURANG STOK :`

### Screen: TAMBAH/KURANG STOK
- Title chip: `TAMBAH/KURANG STOK`
- Same stacked layout as EDIT JENIS BARANG:

**Sub-heading 1:** `DAFTAR STOK 1 : PERLENGKAPAN KEBERSIHAN`
Headers A–F: `NO` · `NAMA BARANG` · `STOK AWAL` · `PENGAMBILAN` · `STOK AKHIR` · `KETERANGAN`
Rows 1–5 as before + `dst`.
**Here the spinner control (`⬍`, an up/down stepper) appears in the `STOK AWAL` column AND in the
`STOK AKHIR` column** — on every row including the `dst` row. `PENGAMBILAN` has no stepper.

Footnote:
> `* Klik tanda` `▼` `untuk menambah/mengurangi jumlah Stok Awal, jumlah Stok Akhir akan berubah secara otomatis`

**Sub-heading 2:** `DAFTAR STOK 2 : PERLENGKAPAN SANITASI & PLUMBING` — same structure, same footnote.

**Then:**
> `DAFTAR STOK 3 : PERLENGKAPAN LISTRIK`
> `hingga`
> `DAFTAR STOK 16 : PERALATAN LAIN-LAIN`

- Button: `KEMBALI KE MENU ADMIN`

**Annotation (left branch):**
> `Saat tanda` `⬍` `di setiap kolom STOK AWAL dipilih, akan menampilkan :`

Popup: `Pilih jumlah yang diinginkan :` with stepper (▲ / `0` / ▼) and button `OK`.

Explanatory box beside it:
> `Nilai awal yang tertera pada tampilan adalah jumlah awal pada STOK AWAL sebelum ditambahkan. Perubahan nilai pada STOK AWAL akan secara otomatis merubah nilai pada STOK AKHIR`

**Annotation (right branch):**
> `Saat tanda` `⬍` `di setiap kolom STOK AKHIR dipilih, akan menampilkan :`

Popup: `Pilih nilai minimum yang diinginkan :` with stepper (▲ / **`-`** / ▼) and button `OK`.
**The default/initial value shown in this stepper is `-` (dash), not `0`.**

Explanatory box beside it:
> `Setelan pada STOK AKHIR adalah Setting Minimum untuk penanda apabila stok mendekati habis, dan akan mengirimkan notifikasi ke Admin yang akan didata pada Menu Notifikasi Stok. Jika memilih (-), maka tidak akan ada Notifikasi`

**Annotation (audit + navigation):**
> `Saat tanda` **`OK`** `ditekan, semua perubahan dicatat berikut hari, tanggal dan jam perubahannya. Hasil pencatatan dapat dilihat oleh Admin di` **`MENU SETTING`** `- Cek Histori Data.`
> `Tampilan otomatis kembali ke Menu` **`TAMBAH/KURANG STOK`**

---

## p-14 — MENU ADMIN – NOTIFIKASI STOK

**Page heading:** `MENU ADMIN – NOTIFIKASI STOK :`

### Screen: NOTIFIKASI STOK
- Title chip: `NOTIFIKASI STOK`

**Table — column letters + headers (EXACT):**

| A | B | C | D | E | F |
| --- | --- | --- | --- | --- | --- |
| `NO` | `HARI, TGL, JAM` | `NAMA BARANG` | `STOK AKHIR` | `SET MIN.` | `KETERANGAN` |

Rows 1–5 all shown empty (`-` in every cell), then a `dst` row (`dst` / `dst` / `dst` / `-` / `-` / `-`).

- Button: `KEMBALI KE MENU ADMIN`

**Per-column behaviour annotations (verbatim):**

> `Kolom A secara otomatis no urut akan timbul apabila ada Jenis Barang yang kurang/bermasalah`

> `Kolom B secara otomatis mencatat HARI, TANGGAL dan JAM kejadian permasalahan`

> `Kolom C secara otomatis memberitahu NAMA BARANG yang kurang/bermasalah`

> `Kolom D secara otomatis menampilkan jumlah STOK AKHIR dari barang yang kurang/bermasalah yang nilainya diambil dari masing-masing` **`MENU STOK`** `- STOK AKHIR, apabila nilainya sama atau lebih rendah dari nilai Setting Minimum yang ditetapkan untuk notifikasi`

> `Kolom E secara otomatis menampilkan nilai Setting Minimum yang nilainya diambil dari masing-masing nilai pada` **`MENU ADMIN`** `-` **`TAMBAH/KURANG STOK`** `- STOK AKHIR yang ditetapkan, jika nilainya ( - ) maka tidak akan ada notifikasi nilai minimum stok barang`

> `Kolom F secara otomatis menampilkan keterangan yang datanya diambil dari masing-masing pilihan keterangan pada` **`MENU STOK`** `- KETERANGAN`

---

## p-15 — MENU ADMIN – HISTORI DATA

**Page heading:** `MENU ADMIN – HISTORI DATA :`

### Screen: HISTORI DATA
- Title chip: `HISTORI DATA`

**Table — column letters + headers (EXACT, 8 columns):**

| A | B | C | D | E | F | G | H |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `NO` | `HARI, TGL, JAM` | `NAMA BARANG` | `STOK AWAL` | `AMBIL` | `STOK AKHIR` | `KETE-RANGAN` | `PENGAMBIL` |

(Column G is hyphenated across two lines in the drawing: `KETE-` / `RANGAN` → `KETERANGAN`.)

Rows 1–5 empty (`-`), then a `dst` row.

- Button: `KEMBALI KE MENU ADMIN`

**Per-column behaviour annotations (verbatim):**

> `Kolom A secara otomatis no urut akan timbul apabila ada perubahan pada Data Inventaris Barang`

> `Kolom B secara otomatis mencatat HARI, TANGGAL dan JAM kejadian perubahan Data inventaris`

> `Kolom C secara otomatis memberitahu NAMA BARANG yang berubah jumlah stoknya`

> `Kolom D secara otomatis menampilkan jumlah STOK AWAL yang nilainya diambil dari masing-masing nilai pada` **`MENU STOK`** `- STOK AWAL`

> `Kolom E secara otomatis menampilkan jumlah perubahan (pengambilan/pengembalian) yang nilainya diambil dari masing-masing nilai pada` **`MENU STOK`** `- PENGAMBILAN`

> `Kolom F secara otomatis menampilkan jumlah STOK AKHIR yang nilainya diambil dari masing-masing nilai pada` **`MENU STOK`** `- STOK AKHIR`

> `Kolom G secara otomatis menampilkan keterangan yang datanya diambil dari masing-masing pilihan keterangan pada` **`MENU STOK`** `- KETERANGAN`

> `Kolom H secara otomatis menampilkan keterangan siapa PENGAMBIL barang, yang datanya diambil saat PENGAMBIL memasukkan Password pada` **`MENU STOK`** `-` **`VERIFIKASI PENGAMBILAN BARANG`**

---

## Consolidated answers to the called-out questions

### The 16 MENU STOK categories (exact names, from MENU UTAMA / EDIT MENU UTAMA)
1. `PERLENGKAPAN KEBERSIHAN`
2. `PERLENGKAPAN SANITASI & PLUMBING` (rendered `PERLENGKAPAN SANITASI DAN PLUMBING` on the MENU STOK 2 screen)
3. `PERLENGKAPAN LISTRIK`
4. `PERLENGKAPAN ELEKTRONIK`
5. `PERLENGKAPAN SIPIL`
6. `PERLENGKAPAN KEAMANAN`
7. `PERLENGKAPAN PHBI`
8. `PERLENGKAPAN LAIN-LAIN`
9. `PERALATAN KEBERSIHAN`
10. `PERALATAN SANITASI & PLUMBING`
11. `PERALATAN LISTRIK`
12. `PERALATAN ELEKTRONIK`
13. `PERALATAN SIPIL`
14. `PERALATAN KEAMANAN`
15. `PERALATAN PHBI`
16. `PERALATAN LAIN-LAIN`

Plus a 17th non-stock row: `17. ADMIN` → `MENU ADMIN`.

### KETERANGAN options on a transaction (PENDATAAN PENGAMBILAN BARANG)
A free-text box **plus** five radios, in order:
`Pemakaian` · `Pengambilan` · `Pengembalian` · `Peminjaman` · `Digunakan`
Mandatory: *"anda diwajibkan memberi keterangan pada kolom Keterangan Barang yang sesuai dengan kegunaannya"*.

### HISTORI DATA columns
`NO` · `HARI, TGL, JAM` · `NAMA BARANG` · `STOK AWAL` · `AMBIL` · `STOK AKHIR` · `KETERANGAN` · `PENGAMBIL`

### NOTIFIKASI STOK columns
`NO` · `HARI, TGL, JAM` · `NAMA BARANG` · `STOK AKHIR` · `SET MIN.` · `KETERANGAN`

### MENU STOK table columns (all 16 screens)
`NO` · `NAMA BARANG` · `STOK AWAL` · `PENGAMBILAN` · `STOK AKHIR` · `KETERANGAN`
(spreadsheet letters A–F are printed above them)

### Passwords / PIN
- **4 digits**, entered on a numeric keypad `7 8 9 / 4 5 6 / 1 2 3 / 0 ←`, masked as `x x x x`.
- **Three roles:** `Admin Utama` (marked `Tetap` — cannot be deleted), `Admin`, `Anggota`.
  But **BUAT PASSWORD / GANTI PASSWORD only offer two radios: `Admin` and `Anggota`** — there is
  no way to *create* an Admin Utama.
- Names: max **16 characters**, entered on an on-screen QWERTY keyboard.
- Roster screen shows **name + role only**; `(* Hanya Nama - Password disembunyikan)`.
- PIN uniqueness is enforced: `* Password yg anda masukkan sudah digunakan, pilih Password lain`.
- Wrong PIN: `* Password yg anda masukkan salah`.
- Entering `MENU ADMIN` requires the **Password Admin** first.
- At a stock transaction the **Anggota** password is used, and
  *"Sebagai Admin, Password nya tetap dapat digunakan"* — an Admin's PIN also works.
- Delete flow: `○ Hapus` → `Apakah anda yakin ?` → `YA` / `TIDAK`;
  `Jika YA, maka Password yang dihapus tidak bisa digunakan lagi`.

### PENYETELAN WAKTU
- Five steppers: `TANGGAL` · `BULAN` · `TAHUN` · `JAM` · `MENIT` (no seconds).
- Radios `Manual` / `Otomatis` — **neither is drawn as pre-selected**.
- `* Angka awal yang tertera adalah angka terkini berdasarkan waktu pada saat ini`
- `SET` saves and returns automatically to `MENU ADMIN`.

### EDIT MENU UTAMA
- Categories are **editable, addable and deletable**: per-row `▼` → `Edit` / `Tambah` / `Hapus`.
- `Tambah` opens `TAMBAH KATEGORI`; `Hapus` = `Hapus Kategori ini dari daftar`.
- The `17. ADMIN` row also has a `▼`.
- All changes are audit-logged with day/date/time to `Cek Histori Data`.

### TAMBAH/KURANG STOK
- `STOK AWAL` stepper → popup `Pilih jumlah yang diinginkan :` (default `0`). Changing STOK AWAL
  **automatically recalculates STOK AKHIR**.
- `STOK AKHIR` stepper → popup `Pilih nilai minimum yang diinginkan :` (default `-`).
  This stepper **is the Setting Minimum**, not the closing stock.
- `Jika memilih (-), maka tidak akan ada Notifikasi` — minimum is nullable / opt-out.
- `OK` logs the change with day/date/time and returns to `TAMBAH/KURANG STOK`.

---

## Things that could easily be missed

1. **The KETERANGAN control is a free-text box AND five radios.** The `Keterangan Barang :`
   panel on PENDATAAN has an empty input field directly under the label, above the radio list.
   Every design note so far has treated keterangan as a pure 5-way enum; the spec drawing shows
   a text field too (either a free-text note, or a "selected value" display).

2. **`Digunakan` is the 5th keterangan and its stock effect is never stated.** The spec lists it
   but no annotation explains what it does to STOK AKHIR. (Already flagged in CLAUDE.md §52/§53,
   but confirmed here: the document itself is silent.)

3. **`TAMBAH KATEGORI` (p-11) is drawn as a `Jenis Barang` / `Satuan` form**, identical to
   `TAMBAH JENIS BARANG` — including the note `* Isi Jenis Barang serta Satuannya secara
   bergantian`. So "add a category" as drawn does not capture a category *name*; it captures an
   item name and unit. Either a copy-paste artefact or an intentional "create category with its
   first item" flow. **Needs confirming with the owner.**

4. **The `17. ADMIN` row is itself editable in EDIT MENU UTAMA** (it carries a `▼` like the 16
   stock categories). Literally read, an admin could rename or delete the ADMIN menu entry —
   almost certainly unintended; needs a guard.

5. **`Admin Utama` can be created only by seeding.** BUAT PASSWORD and GANTI PASSWORD both offer
   only `Admin` / `Anggota` radios. `Admin Utama` exists in the roster with a hard-coded `Tetap`
   badge and no Hapus control. So the super-admin must be provisioned outside the UI.

6. **`GANTI PASSWORD` ends with a `BUAT NAMA` step.** Changing a PIN also re-enters the name
   (max 16 chars). There is no "select which user" step — the person is identified by typing
   their *current* PIN, which confirms the Model-C "PIN alone identifies you" reading.

7. **The `Satuan` (unit) is entered via a radio toggle on the same single text field**
   (`○ Jenis Barang` / `○ Satuan`, note `Isi Jenis Barang serta Satuannya secara bergantian` =
   "fill in the item name and its unit alternately"). It is one field reused for two values, not
   two fields. Units seen in examples: `galon`, `pak`, `buah`, `gulung`, `meter`, `unit`.

8. **Item numbering (`NO`) is auto-renumbering.** `saat ada penambahan/penghapusan Nama Jenis
   Barang nomor urut akan berubah secara otomatis` — the row number is a display ordinal, not a
   stable id. Anything that treats `NO` as a key will break.

9. **The `KETERANGAN` column on the MENU STOK list screens shows a *default/last* keterangan per
   item** (`- pemakaian` for consumables, `- pengembalian` / `- peminjaman` for the PHBI tools on
   MENU STOK 15). This looks like a per-item hint value that lives on the *catalog row*, which is
   a different thing from the per-transaction keterangan — and NOTIFIKASI STOK Kolom F says its
   keterangan is taken from `MENU STOK - KETERANGAN`, i.e. from this column, not from a
   transaction. Worth reconciling with our "breaching-transaction keterangan" interpretation.

10. **`PENGAMBILAN` on the MENU STOK screen is a per-item running counter, not just a form
    field.** It is column D of the list table and always shows `0 <unit>` in the examples;
    HISTORI DATA Kolom E says `AMBIL` is taken from `MENU STOK - PENGAMBILAN`. So the list screen
    is expected to display an accumulated "taken" figure alongside STOK AWAL / STOK AKHIR.

11. **NOTIFIKASI STOK is a *timestamped event list*, not just a filtered view.** Kolom B records
    `HARI, TANGGAL dan JAM kejadian permasalahan` — the moment the breach happened. The trigger
    condition is stated precisely: `apabila nilainya sama atau lebih rendah dari nilai Setting
    Minimum` (**≤**, not `<`).

12. **The notification is actively *sent*, not just listed:** `akan mengirimkan notifikasi ke
    Admin yang akan didata pada Menu Notifikasi Stok` — a push to the Admin plus a log entry.

13. **`Kurang/bermasalah` — NOTIFIKASI STOK covers "low OR problematic".** Kolom A/C both say
    `Jenis Barang yang kurang/bermasalah`. "Bermasalah" (problematic) is never defined anywhere
    in the document. This is the only hint in the spec of a non-quantity problem state.

14. **`PENYETELAN WAKTU` has a `Manual` mode with real steppers.** An admin can set the system
    clock by hand (tanggal/bulan/tahun/jam/menit). This is a genuine feature with an audit
    implication — a manually set clock stamps every subsequent HISTORI DATA row.

15. **Every admin action is audit-logged, not just stock movements.** Password create/delete,
    password change, category add/edit/delete, item add/edit/delete, and stock adjustments all
    carry the note `semua perubahan dicatat berikut hari, tanggal dan jam perubahannya … dapat
    dilihat oleh Admin di MENU SETTING - Cek Histori Data`. But HISTORI DATA's columns
    (`NAMA BARANG` / `STOK AWAL` / `AMBIL` / `STOK AKHIR`) have **no room for a password or
    category change** — the schema and the stated audit scope conflict.

16. **The `dst` row is a real UI element.** In TAMBAH/KURANG STOK and EDIT JENIS BARANG the `dst`
    row also carries the `▼` / stepper controls — it functions as the "add new row here" affordance.

17. **`MENU SETTING` vs `MENU ADMIN` naming inconsistency.** p-07 renamed the menu to
    `MENU ADMIN`, and p-02..p-06 annotations say `MENU ADMIN - Cek Histori Data`, but every
    audit annotation on p-09 through p-13 still says `MENU SETTING - Cek Histori Data`.

18. **Navigation is fully specified and auto-returning.** Nearly every flow ends with an explicit
    "otomatis kembali ke <screen>" instruction (transaction → its own MENU STOK n; SET → MENU
    ADMIN; SIMPAN → BUAT PASSWORD or MENU ADMIN; OK → TAMBAH/KURANG STOK). The spec expects a
    kiosk-style automatic return, not a manual back button.

19. **`EDIT JENIS BARANG` and `TAMBAH/KURANG STOK` are single scrolling screens showing ALL 16
    category tables stacked**, not one category at a time (`DAFTAR STOK 3 … hingga DAFTAR STOK
    16`). That is a very different screen from the per-category MENU STOK n list.

20. **STOK AKHIR is drawn as an editable stepper on the TAMBAH/KURANG STOK table**, showing the
    stock value (e.g. `10 galon`) — yet its popup edits the *minimum*, whose default is `-`.
    The column visually shows one number but edits a different one. Easy to implement wrongly.

21. **No barcode, QR, scanner, camera, search, filter, kit, session, borrower-name, or offline
    feature appears anywhere in the spec.** Row selection is explicitly `dengan mengklik pada
    baris barang tersebut`. Everything barcode/QR-related in our design is our own addition.

22. **There is no "who is it lent to / where did it go" field anywhere.** `PENGAMBIL` (from the
    PIN) is the only person recorded. `Peminjaman` and `Pengembalian` exist as keterangan values
    but no borrower/recipient/destination field is drawn — which matches the CLAUDE.md §56
    decision not to force a borrower field, and means the spec has no notion of an outstanding
    loan register.

23. **No rusak/hilang condition anywhere in the spec.** `Pengembalian` carries no condition
    option. Our normal/rusak/hilang lifecycle remains purely our extension.
