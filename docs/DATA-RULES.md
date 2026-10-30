# Aturan normalisasi dan perhitungan data

Modul bersama ini murni, tanpa jaringan atau dependensi paket. Sumber input adalah objek workbook dengan nama tab persis seperti PRD; baris pertama berisi header. Nomor baris pada `source` dan `issues` mengikuti Google Sheets (header = baris 1). Input tidak diubah.

## Ekspor publik

`shared/data.mjs`:
- `normalizeWorkbook(workbook)` → `{ schools, pics, tiers, visits, years, issues, hasFatalIssues }`.

`shared/selectors.mjs`:
- `jakartaToday(now = new Date())` → tanggal ISO di zona `Asia/Jakarta`.
- `classifyFollowUp(visit, today = jakartaToday())` → kategori tindak lanjut.
- `filterSchools(data, filters = {})` → sekolah sesuai filter, diurutkan tanpa mengubah cache.
- `filterVisits(data, filters = {})` → kunjungan sesuai filter.
- `dashboardSummary(data, filters = {})` → KPI sesuai kontrak.
- `compareTiers(data, fromYear, toYear, filters = {})` → perbandingan per sekolah.

## Header wajib dan alias

Header biasa dicocokkan tanpa membedakan kapital, dengan spasi luar/berulang diabaikan. Spasi di sekitar `/` juga diabaikan. Urutan kolom bebas. Setiap bidang berikut wajib mempunyai tepat satu kolom:

| Tab | Bidang/header yang diterima |
| --- | --- |
| Data Sekolah | ID Sekolah; Nama Sekolah; Daerah; Negeri/Swasta; Status Sekolah |
| Data Sekolah: penanggung jawab | Koordinator/Marketing Penanggung Jawab **atau** Koordinator **atau** Marketing Penanggung Jawab **atau** Koordinator atau marketing penanggung jawab |
| Data Pic Sekolah | ID PIC; ID Sekolah; Nama PIC; Jabatan; Status Kontak / Statusm Kontak |
| Data Pic Sekolah: kontak | Nomor WhatsApp / Nomer WhatsApp / No WhatsApp / No. WhatsApp / WhatsApp / Nomor WA / No WA |
| Data Tier Sekolah | ID Sekolah; minimal satu kolom `Tier YYYY` |
| Riwayat Kunjungan | ID Visit / ID Kunjungan; Tanggal / Tanggal Kunjungan; ID Sekolah; Marketing pelaksana / Marketing; Kegiatan; PIC yang ditemui / PIC; Hasil |
| Riwayat Kunjungan: tindak lanjut | Next Action / Tindak Lanjut; Tanggal Follow-up / Tanggal Follow Up; Status Follow-up / Status Follow Up |

Tanda `/` pada daftar alias berarti pilihan alternatif, bukan sebuah header gabungan, kecuali `Negeri/Swasta` dan `Koordinator/Marketing Penanggung Jawab`. Kolom pendukung lain diabaikan. Nama tab harus persis `Data Sekolah`, `Data Pic Sekolah`, `Data Tier Sekolah`, dan `Riwayat Kunjungan`.

Header tier menggunakan pola **case-sensitive** `/^Tier (\d{4})$/` setelah trim. `Tier 2028` dikenali otomatis; `Tier 28`, `Tier 20290`, dan `Not Tier 2027` bukan kolom tahun. `years` berisi angka unik terurut naik.

Tab/header wajib hilang atau beberapa kolom mengacu ke bidang/tahun yang sama menghasilkan `hasFatalIssues: true` dan array data kosong. Pemanggil harus menolak snapshot ini dan mempertahankan cache berhasil sebelumnya; modul normalisasi sendiri tidak mengelola cache. Masalah per baris tidak bersifat fatal bagi snapshot.

## Identitas, relasi dan duplikasi

- Teks di-trim; ID tetap case-sensitive, tanpa pencocokan nama, perbaikan pola, atau penambahan angka nol. ID teks `001` berbeda dari `1` dan `s-1` berbeda dari `S-1`.
- Sekolah wajib memiliki ID dan nama. Semua salinan ID sekolah ganda dikeluarkan, termasuk salinan yang mempunyai bidang lain tidak lengkap. Setiap baris ganda ditandai.
- PIC, tier dan kunjungan hanya disertakan jika ID sekolah merujuk sekolah valid yang tidak ambigu. Nama/daerah di tab pendukung tidak menggantikan Data Sekolah.
- PIC wajib memiliki ID dan nama; seluruh salinan ID PIC ganda dikeluarkan. Nomor WhatsApp tetap teks sehingga angka nol awal yang memang tersimpan sebagai teks dipertahankan; angka nol yang sudah hilang di sumber tidak ditebak kembali.
- Kunjungan wajib memiliki ID, sekolah valid dan tanggal valid. Untuk ID Visit ganda, hanya **baris valid pertama dalam urutan sumber** yang disertakan. Semua baris dengan ID tersebut ditandai, termasuk baris awal yang tidak valid. Kapital ID tetap membedakan kunjungan.
- Tanggal kunjungan terakhir adalah maksimum dari kunjungan yang benar-benar disertakan, bukan dari baris duplikat/invalid yang dibuang.
- Baris tier sekolah ganda ditandai pada seluruh baris. Hasil mempertahankan satu entri per sekolah/tahun dengan `tier: null, invalid: true` dan sumber baris pertama, bukan memilih salah satu penilaian atau menganggap kosong.
- Baris array kosong atau hanya spasi diabaikan tanpa menggeser nomor sumber.
- `owner` adalah marketing penanggung jawab sekolah; `marketer` adalah marketing pelaksana kunjungan. Keduanya tidak saling menggantikan.
- Kegiatan multiselect dipisahkan pada koma, titik koma, baris baru atau `|`; token di-trim dan token identik dideduplikasi. Garis miring bukan pemisah kegiatan.

## Tier dan tanggal

Nilai tier yang sah setelah trim hanya `Tier 1`, `Tier 2`, `Tier 3`, atau kosong. Kosong menjadi `tier: null` tanpa `invalid: true`. Nilai lain, termasuk angka `1`, `0`, boolean, atau `Tier 4`, menjadi `tier: null, invalid: true`; nilai mentah tidak dibawa ke pesan masalah. Sekolah yang tidak mempunyai baris/kolom penilaian pada tahun terpilih dianggap belum dinilai, bukan tier rendah.

Tanggal yang diterima:
- ISO persis `YYYY-MM-DD`.
- Format Indonesia `D/M/YYYY` atau `D-M-YYYY`, hari/bulan satu atau dua digit dan pemisah harus konsisten.
- Serial Google Sheets nonnegatif, berupa angka atau teks numerik, dengan epoch `1899-12-30`; bagian pecahan waktu dibuang. Hasil harus tetap dalam tahun 1899–9999.

Panjang bulan dan aturan kabisat Gregorian diperiksa: 29 Februari 2024/2000 sah; 29 Februari 2023/1900/2100 tidak sah. Urutan bulan/hari tidak digunakan: `02/03/2026` berarti 2 Maret dan `02/29/2024` ditolak. Tahun dua digit, ISO tanpa padding, timestamp, bentuk bahasa bebas, nilai nonfinite dan rollover seperti 31 April ditolak. Tidak menggunakan parsing tanggal bebas yang diam-diam mengganti hari tidak valid.

Tanggal kunjungan invalid membuang kunjungan. Follow-up kosong menjadi `followUpDate: null`; follow-up terisi tetapi invalid tetap mempertahankan kunjungan dengan `followUpDate: null, invalidFollowUpDate: true`. Hal ini **bukan** follow-up belum dijadwalkan.

## Tindak lanjut dan zona waktu

`jakartaToday` menggunakan `Intl` dengan zona eksplisit `Asia/Jakarta`, bukan zona mesin. Pergantian hari Jakarta terjadi pukul 17:00 UTC. `today` dapat diberikan secara eksplisit agar pengujian deterministik.

Urutan klasifikasi:
1. Status `Selesai` → `completed`; `Dibatalkan` → `cancelled`, mengalahkan tanggal invalid.
2. Penanda/tanggal follow-up invalid → `invalid`.
3. Tindak lanjut dan status sama-sama kosong → `none`.
4. Status kosong/tidak dikenal pada pekerjaan yang terlihat → `status-missing` (bukan selesai).
5. Status `Belum Selesai`: tanpa tanggal → `unscheduled`; sebelum hari ini → `overdue`; sama → `today`; sesudah → `upcoming`.

Status resmi dicocokkan tanpa kapital dan dikembalikan dengan label kanonis. Status kosong dengan aksi/tanggal, serta status tidak dikenal, menghasilkan peringatan sumber tanpa membuang kunjungan.

## Filter, KPI dan perbandingan

- `filterSchools`: `search` nama/ID tidak membedakan kapital; `region`, `owner`, `status`, `tier`, `year`, `schoolIds`, `sort`. Filter label biasa tidak membedakan kapital; ID pada `schoolIds` tetap persis.
- `tier: 'unassessed'` hanya untuk penilaian benar-benar kosong/tidak ada; `'invalid'` terpisah. `year` kosong memakai tahun tertinggi yang ditemukan, bukan tahun kalender saat ini.
- Pengurutan default `name-asc`; tersedia `name-desc` dan `last-visit` terbaru dahulu, tanpa kunjungan di akhir. Nama dan ID menjadi pembanding tie-break yang deterministik.
- `filterVisits`: `start`, `end`, `region`, `schoolId`, `marketer`, `activity`, `schoolIds`. Batas tanggal ISO **inklusif**. Batas invalid/terbalik menghasilkan daftar kosong. Kegiatan mencocokkan token penuh, bukan substring.
- `schoolIds: []` secara eksplisit berarti tidak ada sekolah; bukan semua sekolah. Semua filter digabung sebagai AND; filter kosong berarti semua.
- KPI sekolah memakai filter sekolah; jumlah kunjungan/sekolah dikunjungi memakai tambahan rentang tanggal, marketer dan kegiatan. Total sekolah, jumlah kunjungan, dan sekolah dikunjungi dideduplikasi berdasarkan ID.
- KPI follow-up mengambil **seluruh waktu** untuk sekolah terpilih dan marketer terpilih. Rentang tanggal kunjungan dan filter kegiatan tidak membatasi antrian ini. Pekerjaan selesai/dibatalkan, status hilang, dan tanggal invalid tidak dihitung sebagai hari ini/terlambat.
- Perbandingan menggunakan tahun argumen, termasuk tahun baru yang ditemukan. Filter tier perbandingan secara default memakai tahun tujuan; `filters.year` dapat memilih tahun filter secara eksplisit. Hanya dua tier sah yang sama-sama terisi dapat `improved`/`declined`/`unchanged`; angka tier mengecil berarti meningkat. Salah satu kosong → `unassessed`; salah satu invalid → `invalid`.

## Masalah data yang aman

Bentuk masalah persis `{ code, tab, row, column, message, severity }`. `column` menggunakan label kanonis/kolom tahun yang terverifikasi. Pesan Indonesia tidak memuat nilai sel, ID sumber, nomor kontak, header tak dikenal, kredensial, atau isi workbook mentah.

Kode fatal: `MISSING_TAB`, `MISSING_HEADER`, `AMBIGUOUS_HEADER`.

Kode baris: `MISSING_REQUIRED_FIELD`, `DUPLICATE_SCHOOL_ID`, `AMBIGUOUS_SCHOOL_ID`, `UNKNOWN_SCHOOL_ID`, `DUPLICATE_PIC_ID`, `DUPLICATE_TIER_ROW`, `INVALID_TIER`, `INVALID_VISIT_DATE`, `INVALID_FOLLOW_UP_DATE`, `DUPLICATE_VISIT_ID`, `MISSING_FOLLOW_UP_STATUS`, `UNKNOWN_FOLLOW_UP_STATUS`. Duplikat kunjungan dan masalah status adalah `warning`; kesalahan lain `error`.

## Pengujian dan performa

Jalankan dari akar proyek dengan Node >=22.12:

```sh
node --test tests/domain.test.mjs tests/selectors.test.mjs
```

Pengujian perilaku dikembangkan dalam siklus RED → implementasi minimal → GREEN per irisan: pemetaan sekolah, alias, skema fatal, relasi, tanggal, duplikasi, tier, status, zona waktu dan setiap ekspor selector. Uji regresi performa membuat 1.000 sekolah / 10.000 kunjungan secara deterministik, memverifikasi jumlah hasil, lalu menjalankan normalisasi dan seluruh jalur selector dengan batas gabungan **<= 3.000 ms**. Waktu aktual dicetak sebagai diagnostik `node:test`; bukan angka contoh atau hasil jaringan.
