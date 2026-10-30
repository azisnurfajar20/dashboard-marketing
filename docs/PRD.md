# PRD — Dashboard Marketing Lapangan
**LPK Duta Persada Yogyakarta**  
Versi 1.0 — Draft untuk pengembangan

## 1. Ringkasan Produk

Dashboard ini membantu tim LPK Duta Persada Yogyakarta memantau hubungan dengan sekolah, prioritas sekolah berdasarkan tier, aktivitas kunjungan marketing, dan tindak lanjut.

Sistem berbentuk website yang mengambil data dari Google Sheets. Pada versi pertama, tim tetap mengisi dan memperbarui data melalui Google Sheets, sedangkan website menyajikan ringkasan, pencarian, filter, dan detail.

## 2. Tujuan

- Memudahkan marketing menentukan sekolah yang perlu dikunjungi atau ditindaklanjuti.
- Membantu koordinator memantau aktivitas dan pembagian tanggung jawab.
- Menampilkan sebaran sekolah serta perubahan tier dari tahun ke tahun.
- Mengurangi kebutuhan menyusun laporan secara manual.

## 3. Pengguna

| Pengguna | Kebutuhan |
|---|---|
| Marketing LPK | Melihat sekolah tanggung jawabnya, kontak PIC, riwayat kunjungan, dan tindak lanjut |
| Koordinator/manager | Memantau sekolah, aktivitas tim, sebaran tier, dan follow-up |
| Admin data | Memelihara data Google Sheets dan memantau masalah sinkronisasi |

Pada versi pertama, seluruh pengguna yang diberi akses dapat melihat data tim. Pembatasan data per marketing dapat dikembangkan jika diperlukan.

## 4. Ruang Lingkup

### Versi pertama

1. Login pengguna.
2. Sinkronisasi data dari Google Sheets.
3. Dashboard ringkasan.
4. Daftar dan detail sekolah.
5. Ringkasan serta perbandingan tier tahunan.
6. Riwayat kunjungan marketing.
7. Daftar tindak lanjut.
8. Indikator kelengkapan data.

### Pengembangan berikutnya

- Input dan perubahan data langsung dari website.
- Pencatatan calon siswa, pembayaran DP, dan mulai pelatihan.
- Pengukuran keberhasilan rekrutmen.
- Notifikasi follow-up.
- Peta sekolah dan perencanaan rute kunjungan.

Jumlah siswa kelas XII tidak termasuk dalam sistem.

## 5. Sumber Data

Sumber utama adalah dokumen Google Sheets **Database Marketing Offline Duta Persada**, dengan empat tab:

| Tab | Fungsi |
|---|---|
| Data Sekolah | Daftar utama sekolah dan marketing penanggung jawab |
| Data Pic Sekolah | Kontak guru atau pihak sekolah |
| Data Tier Sekolah | Tier setiap sekolah berdasarkan tahun |
| Riwayat Kunjungan | Catatan kegiatan marketing dan tindak lanjut |

**Google Sheets menjadi satu-satunya tempat input pada versi pertama.** Website tidak mengubah isi spreadsheet.

Format Tier 2024, Tier 2025, dan seterusnya tetap dipertahankan. Sistem mengubah susunannya secara internal untuk kebutuhan filter dan grafik.

## 6. Persiapan Data

Persiapan berikut diperlukan sebelum dashboard digunakan secara operasional:

| Bagian | Persyaratan |
|---|---|
| Identitas sekolah | Setiap sekolah mempunyai ID unik dan tidak ganda |
| Hubungan antartab | Data PIC, tier, dan kunjungan menggunakan ID Sekolah yang sama |
| Nama sekolah | Ditampilkan berdasarkan Data Sekolah sebagai acuan utama |
| Marketing | Penulisan nama marketing konsisten |
| Tanggal | Tanggal kunjungan dan follow-up tersimpan sebagai tanggal yang valid |
| WhatsApp | Disimpan sebagai teks agar angka nol di depan tetap ada |
| Tier | Nilai yang diterima: Tier 1, Tier 2, Tier 3, atau kosong |
| Follow-up | Memiliki tindak lanjut, tanggal follow-up, dan status follow-up |

Data yang belum memenuhi persyaratan ditampilkan sebagai masalah data. Sistem tidak menebak hubungan sekolah berdasarkan kemiripan nama.

## 7. Struktur Data Minimum

### Data Sekolah

- ID Sekolah
- Nama Sekolah
- Daerah
- Negeri/Swasta
- Koordinator atau marketing penanggung jawab
- Status Sekolah

### Data PIC Sekolah

- ID PIC
- ID Sekolah
- Nama PIC
- Jabatan
- Nomor WhatsApp
- Status Kontak

Satu sekolah dapat mempunyai beberapa PIC.

### Data Tier Sekolah

- ID Sekolah
- Kolom tier per tahun, seperti Tier 2024 dan Tier 2025
- Keterangan, jika tersedia

Nama sekolah dan daerah yang juga terdapat dalam tab ini diperlakukan sebagai informasi pendukung. Data Sekolah tetap menjadi acuan utama.

### Riwayat Kunjungan

- ID Visit
- Tanggal
- ID Sekolah
- Marketing pelaksana
- Kegiatan
- PIC yang ditemui
- Hasil
- Next Action atau Tindak Lanjut
- Tanggal Follow-up
- Status Follow-up

Pilihan status follow-up: **Belum Selesai, Selesai, Dibatalkan**.

Satu baris mewakili satu kunjungan. Satu kunjungan dapat mencakup silaturahmi BK, titip brosur, dan sosialisasi sekaligus.

## 8. Halaman dan Fitur

### 8.1 Dashboard Ringkasan

Menampilkan:

- Total sekolah.
- Jumlah sekolah aktif.
- Jumlah sekolah per tier pada tahun terpilih.
- Jumlah sekolah yang tier-nya belum diisi.
- Jumlah kunjungan dalam rentang tanggal terpilih.
- Jumlah sekolah unik yang dikunjungi.
- Jumlah follow-up hari ini dan terlambat.

Grafik utama:

- Sebaran tier sekolah.
- Jumlah sekolah berdasarkan daerah.
- Tren kunjungan per bulan.
- Jumlah kunjungan per marketing.

Angka ringkasan dapat diklik untuk membuka daftar pendukung dengan filter yang sama.

### 8.2 Daftar Sekolah

Fitur:

- Pencarian nama atau ID sekolah.
- Filter daerah, marketing penanggung jawab, status sekolah, dan tier.
- Pilihan tahun tier.
- Pengurutan nama sekolah dan kunjungan terakhir.

Kolom utama:

**Nama Sekolah, Daerah, Marketing Penanggung Jawab, Tier Tahun Terpilih, Tanggal Kunjungan Terakhir.**

### 8.3 Detail Sekolah

Menampilkan:

- Identitas dan status sekolah.
- Marketing penanggung jawab.
- Daftar PIC.
- Riwayat tier tahunan.
- Riwayat kunjungan.
- Hasil kunjungan terakhir.
- Tindak lanjut yang masih terbuka.

Tombol WhatsApp membuka kontak PIC melalui tautan WhatsApp. Sistem tidak mengirim pesan otomatis.

### 8.4 Tier Sekolah

Menampilkan:

- Ringkasan tier berdasarkan tahun.
- Tabel perbandingan tier antartahun.
- Daftar sekolah yang berubah tier.
- Sekolah yang belum mempunyai tier pada tahun terpilih.

Perubahan tier hanya dibandingkan jika kedua tahun mempunyai nilai. Nilai kosong tidak dianggap kenaikan atau penurunan.

Tahun diambil otomatis dari judul kolom dengan pola **Tier YYYY**. Penambahan kolom seperti Tier 2028 akan dikenali setelah sinkronisasi.

### 8.5 Riwayat Kunjungan

Menampilkan:

- Tanggal.
- Sekolah.
- Marketing pelaksana.
- Kegiatan.
- PIC.
- Hasil.
- Tindak lanjut.

Filter: rentang tanggal, daerah, sekolah, marketing pelaksana, dan kegiatan.

### 8.6 Follow-up

Kelompok tampilan:

| Kelompok | Aturan |
|---|---|
| Terlambat | Belum selesai dan tanggal follow-up sebelum hari ini |
| Hari ini | Belum selesai dan tanggal follow-up sama dengan hari ini |
| Mendatang | Belum selesai dan tanggal follow-up setelah hari ini |
| Belum dijadwalkan | Ada tindak lanjut, tetapi tanggal belum terisi |
| Selesai | Status follow-up Selesai |

Tindak lanjut dengan status kosong ditandai **Status Belum Diisi**. Data tersebut tetap terlihat dan tidak dianggap selesai.

### 8.7 Status Data

Menampilkan:

- Waktu sinkronisasi terakhir yang berhasil.
- Status koneksi Google Sheets.
- Jumlah ID sekolah ganda.
- Referensi sekolah yang tidak ditemukan.
- Tanggal yang tidak valid.
- Nilai tier yang tidak dikenali.
- Kolom wajib yang hilang.

Setiap masalah mencantumkan tab dan nomor baris sumber agar mudah diperbaiki.

## 9. Filter dan Definisi Angka

Terdapat dua kontrol waktu yang terpisah:

- **Tahun tier:** menentukan tier sekolah yang ditampilkan.
- **Rentang tanggal aktivitas:** menentukan kunjungan yang dihitung.

Filter marketing menggunakan label yang jelas:

- **Marketing penanggung jawab** untuk data sekolah.
- **Marketing pelaksana** untuk aktivitas kunjungan.

| Indikator | Definisi |
|---|---|
| Total sekolah | Jumlah ID sekolah unik dan valid sesuai filter |
| Sekolah aktif | Sekolah dengan status Aktif |
| Sekolah per tier | Sekolah dengan tier terkait pada tahun terpilih |
| Tier belum diisi | Sekolah tanpa nilai tier pada tahun terpilih |
| Jumlah kunjungan | Jumlah ID Visit unik dengan tanggal dan ID sekolah valid dalam periode |
| Sekolah dikunjungi | Jumlah ID sekolah unik dari kunjungan yang valid dalam periode |
| Kunjungan terakhir | Tanggal kunjungan valid paling baru untuk sekolah tersebut |

Sekolah berstatus nonaktif tetap tersimpan dalam riwayat dan dapat ditampilkan melalui filter.

## 10. Aturan Tier

Definisi kerja yang disepakati:

| Tier | Kriteria |
|---|---|
| Tier 1 | Menghasilkan minimal satu siswa yang telah membayar DP dan mulai mengikuti pelatihan pada periode terkait |
| Tier 2 | Belum menghasilkan peserta sesuai kriteria Tier 1, tetapi sudah diizinkan sosialisasi |
| Tier 3 | Belum diizinkan sosialisasi, tetapi hubungan dengan guru sudah terjalin |
| Kosong | Belum ada penilaian yang dicatat |

Pada versi pertama, **dashboard membaca tier yang diisi di Google Sheets**. Sistem belum menghitung tier otomatis karena data dasar evaluasi dan calon siswa belum tersedia.

Tier historis tetap ditampilkan sesuai sumber dan tidak otomatis dinilai ulang menggunakan definisi baru.

## 11. Sinkronisasi Google Sheets

- Integrasi menggunakan Google Sheets API melalui server.
- Akun layanan atau identitas integrasi diberi akses baca hanya ke spreadsheet yang diperlukan.
- Kredensial disimpan di server dan tidak dikirim ke browser.
- Sinkronisasi otomatis dilakukan setiap 5 menit.
- Tersedia tombol **Perbarui Data** untuk meminta pembaruan.
- Website menampilkan waktu sinkronisasi terakhir.
- Jika sinkronisasi gagal, data terakhir yang berhasil tetap ditampilkan dengan pemberitahuan.
- Data kosong ditampilkan sebagai kosong; kegagalan koneksi tidak ditampilkan sebagai angka nol.

Pergantian nama atau penghapusan kolom wajib menghasilkan pemberitahuan yang menjelaskan kolom bermasalah. Data terakhir yang valid tetap tersedia.

## 12. Akses dan Perlindungan Data

- Login wajib sebelum mengakses dashboard.
- Akses diberikan kepada pengguna yang disetujui admin.
- Kontak PIC dan data internal tidak tersedia pada halaman publik.
- Informasi kesalahan tidak memuat kredensial atau nomor WhatsApp.
- Integrasi tidak memerlukan spreadsheet dibuka untuk umum.
- Dashboard tidak mengubah hak akses atau isi Google Sheets.

## 13. Kebutuhan Tampilan dan Performa

- Bahasa antarmuka: Indonesia.
- Zona waktu: Asia/Jakarta.
- Tampilan nyaman digunakan melalui HP dan laptop.
- Tabel pada HP menyediakan kolom utama dan tombol detail.
- Warna tier konsisten dan selalu disertai label teks.
- Tampilan kosong menjelaskan penyebabnya, seperti “Belum ada kunjungan pada periode ini”.
- Target tampilan awal maksimal 3 detik pada koneksi stabil dengan data yang sudah tersimpan di server.
- Target awal mendukung minimal 1.000 sekolah dan 10.000 catatan kunjungan.

## 14. Kriteria Penerimaan

Versi pertama dinyatakan siap jika:

1. Pengguna tanpa login tidak dapat mengakses data internal.
2. Jumlah sekolah dan tier cocok dengan Google Sheets pada filter yang sama.
3. Tier kosong terlihat terpisah dari Tier 1–3.
4. Detail sekolah menampilkan PIC dan kunjungan berdasarkan ID sekolah yang benar.
5. Filter marketing penanggung jawab dan marketing pelaksana bekerja sesuai fungsinya.
6. Kunjungan dihitung tanpa menggandakan ID Visit.
7. Follow-up hari ini dan terlambat dihitung berdasarkan waktu Jakarta.
8. Data tidak valid ditandai dan tidak diam-diam diperlakukan sebagai data valid.
9. Perubahan Google Sheets muncul setelah sinkronisasi berhasil.
10. Kolom tahun tier baru dikenali tanpa perubahan kode.
11. Kegagalan sinkronisasi menampilkan data terakhir beserta pemberitahuan.
12. Halaman utama dan detail dapat digunakan melalui HP.

## 15. Tahapan Implementasi

| Tahap | Hasil |
|---|---|
| 1. Validasi data | ID, kolom, tanggal, status, dan kemungkinan sekolah ganda diperiksa |
| 2. Desain tampilan | Rancangan dashboard, daftar sekolah, detail, dan follow-up |
| 3. Integrasi | Koneksi baca Google Sheets dan pemeriksaan kualitas data |
| 4. Pengembangan | Login, filter, ringkasan, grafik, dan halaman detail |
| 5. Pengujian | Angka dicocokkan dengan sumber dan alur diuji di HP |
| 6. Uji operasional | Tim memakai sistem untuk aktivitas nyata dan memberi masukan |

## 16. Batasan Versi Pertama

Dashboard dapat memantau sekolah, tier, kunjungan, dan tindak lanjut. Dashboard belum dapat mengukur jumlah calon siswa, pembayaran DP, konversi, atau hasil rekrutmen aktual sampai data tersebut dicatat.

Riwayat kunjungan dan follow-up yang belum diisi akan menghasilkan tampilan kosong dengan penjelasan, sehingga tidak menimbulkan kesan bahwa aktivitas sudah lengkap tercatat.

## Ketentuan Teknologi dan Desain Website

### Teknologi
- Website menggunakan **Bootstrap** sebagai dasar tampilan.
- Tampilan responsif untuk HP, tablet, dan laptop.
- Gaya khusus ditempatkan pada berkas CSS tersendiri agar mudah dirawat.

### Identitas Visual
- **Warna utama:** `#06509B` — untuk navigasi, judul, dan tombol utama.
- **Warna aksen:** `#F1D043` — untuk penanda menu aktif, sorotan, dan elemen penting.
- Latar konten menggunakan putih dan abu-abu muda agar data mudah dibaca.
- Elemen berlatar kuning menggunakan teks biru tua atau gelap agar terbaca jelas.
- Status dan tier selalu dilengkapi label teks.

### Penempatan Logo
- Tersedia ruang logo pada halaman login dan bagian atas sidebar.
- Pada HP, logo tampil di bagian navigasi atas.
- Logo mempertahankan proporsi aslinya dan tidak terpotong.
- Sebelum logo dipasang, tampil placeholder bertuliskan **LPK Duta Persada**.
- Berkas logo diletakkan pada lokasi aset khusus agar mudah diganti.

### Struktur Folder
Kode dipisahkan berdasarkan tanggung jawab, dengan susunan dasar:

```text
marketing-dashboard/
├── public/
│   └── assets/
│       ├── images/
│       │   └── logo/
│       ├── icons/
│       ├── css/
│       └── js/
├── src/
│   ├── components/
│   │   ├── layout/
│   │   └── shared/
│   ├── pages/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── schools/
│   │   ├── tiers/
│   │   ├── visits/
│   │   └── follow-ups/
│   ├── services/
│   │   └── api/
│   ├── styles/
│   └── utils/
├── server/
│   ├── config/
│   ├── routes/
│   ├── controllers/
│   ├── services/
│   │   └── google-sheets/
│   ├── middleware/
│   └── validators/
├── tests/
├── .env.example
└── README.md
```

Struktur akhir disesuaikan dengan framework yang dipilih, dengan aturan:
- Komponen yang digunakan berulang disimpan pada satu tempat.
- Koneksi Google Sheets dan kredensial dikelola di server.
- Konfigurasi, tampilan, dan logika pengolahan data dipisahkan.
- Tidak ada kredensial dalam folder publik atau kode browser.
- README menjelaskan pemasangan, konfigurasi, menjalankan website, dan mengganti logo.

### Kriteria Penerimaan Tambahan
- Bootstrap terpasang dan digunakan secara konsisten.
- Warna merek diterapkan melalui variabel tema terpusat.
- Ruang logo tersedia dan dapat diisi tanpa mengubah susunan halaman.
- Navigasi berubah menjadi menu yang dapat dibuka dan ditutup pada HP.
- Struktur folder mengikuti pembagian di atas tanpa menumpuk seluruh kode dalam satu berkas.