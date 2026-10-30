# Google Sheets, autentikasi, dan operasi server

## Hasil koneksi lokal — 23 Oktober 2026

Website lokal di `http://127.0.0.1:3001` telah dialihkan ke **`DATA_MODE=sheets`** dan direstart. Uji API serta browser mengonfirmasi `mode=sheets`, `connection=connected`, tanpa banner/login demo. Sinkronisasi nyata berhasil pada `2026-10-23T15:08:41.269Z`; hasil API dibandingkan langsung dengan pembacaan baru keempat tab menggunakan loader produksi dan hasilnya identik.

| Data tervalidasi saat pengujian | Jumlah |
|---|---:|
| Sekolah | 179 |
| PIC | 175 |
| Penilaian sekolah-tahun tier (2024–2027, termasuk tier kosong) | 716 |
| Kunjungan | 0 |

`Riwayat Kunjungan` saat pengujian berisi header tanpa baris kunjungan. Angka nol tersebut berasal dari sumber asli, bukan data pengganti/demo. Kolom `ID Sekolah` pada tab PIC telah ditambahkan oleh pemilik spreadsheet; relasi tetap menggunakan ID persis, bukan kemiripan nama.

Header `Nomer WhatsApp` dan `Statusm Kontak` didukung sebagai alias eksplisit untuk bidang WhatsApp dan status kontak. Header canonical tetap `Nomor WhatsApp` dan `Status Kontak`. Jika canonical dan alias untuk bidang yang sama muncul bersama, normalisasi tetap menolak ambiguitas. Pengujian regresi mencakup alias, kolom ganda, kewajiban ID sekolah, serta tidak mengubah sumber.

### Catatan kualitas sumber yang masih perlu diperbaiki

Ada **16 catatan pemeriksaan nonfatal**, bukan 16 kunjungan atau 16 baris unik:

| Tab | Lokasi | Masalah |
|---|---|---|
| `Data Sekolah` | Baris 181–185 | Hanya nomor urut; ID dan nama sekolah belum diisi. Lengkapi atau kosongkan/hapus nomor pada baris yang tidak dipakai. |
| `Data Pic Sekolah` | Baris 47, 57, 77, 121 | Nama PIC kosong; catatan tidak dimasukkan ke daftar PIC valid. |
| `Data Pic Sekolah` | Baris 181 | ID sekolah tidak ditemukan pada daftar sekolah valid. |
| `Data Tier Sekolah` | Baris 7 | ID sekolah tidak ditemukan pada daftar sekolah valid. |

Catatan tersebut terlihat di halaman **Status data**. Baris invalid dikeluarkan sesuai aturan; tidak ada ID yang ditebak atau data sumber yang diubah. Jumlah valid dapat berubah setelah sumber diperbaiki dan sinkronisasi berikutnya berhasil.

### Akses dan batas verifikasi

- Key, allowlist pengguna, cache, dan sesi lokal disimpan di luar proyek pada direktori privat OS; nilai kredensial tidak dicetak atau dimasukkan ke bundle.
- Akun awal lokal telah dibuat dengan password acak. Informasi login ada pada file privat `C:\Users\Acer\AppData\Local\marketing-dashboard\secrets\akses-dashboard.txt`; jangan unggah file ini atau JSON key ke chat/Git.
- Uji mencakup login UI, pencocokan KPI dengan API nyata, halaman desktop/mobile, detail sekolah dengan ID persis, tombol **Perbarui data**, logout yang mencabut akses, penolakan akses anonim, pemblokiran file privat, dan login demo nonaktif. Tidak ada galat JavaScript pada jalur tersebut.
- Timer sinkronisasi backend berjalan setiap 5 menit; frontend mengambil snapshot setiap 1 menit. **Perbarui data** memaksa pembacaan sumber segera. Tick otomatis nyata juga telah diamati tanpa memanggil `POST /api/sync`: sukses `2026-10-23T15:13:36.421Z`, jadwal berikutnya `2026-10-23T15:18:35.302Z`, tetap `mode=sheets` dan `connection=connected`.
- Regresi setelah penambahan alias: **64/64 tes unit/integrasi** dan **20/20 tes browser demo terisolasi** lulus; build berhasil. Uji browser live tambahan memverifikasi tujuh halaman desktop (termasuk detail sekolah) dan enam halaman mobile, login, KPI, refresh sumber, serta logout. Server demo uji telah dihentikan; server live port 3001 tetap berjalan.
- Server tetap **lokal/loopback**, bukan deployment internet. TLS, akses tim jarak jauh, backup/retensi, dan operasional produksi belum diverifikasi.
- Pengujian otomatis berbasis fixture tetap terpisah dari uji Google nyata. Key tidak dipakai untuk mengubah sharing, isi sel, atau izin spreadsheet.

## 1. Mode sumber dan konfigurasi

Salin `.env.example` ke `.env` secara lokal. Jangan menimpa secret yang sudah dibuat. `.env` dibaca oleh `server/index.mjs` dari akar proyek, bukan dari direktori kerja shell. Environment proses mengungguli `.env`.

| Variabel | Aturan |
| --- | --- |
| `DATA_MODE` | `demo` atau `sheets`. Default demo hanya nonproduksi; produksi wajib menetapkan mode secara eksplisit. |
| `NODE_ENV` | `production` untuk deployment HTTPS. Demo ditolak dalam produksi. |
| `HOST`, `PORT` | Default `127.0.0.1:3001`. Demo hanya loopback. |
| `APP_ORIGIN` | Origin dashboard tanpa path/query, misalnya `https://marketing.example.org`. HTTPS wajib dalam produksi. |
| `SESSION_SECRET` | Minimal 32 karakter acak; gunakan 48 byte acak atau lebih. Live wajib diisi. Demo lokal tanpa secret menghasilkan secret sementara sehingga login hilang saat restart. |
| `USERS_FILE` | Default `server/config/users.json`; array pengguna yang disetujui, bukan pendaftaran publik. Live mewajibkan minimal satu pengguna valid. |
| `GOOGLE_SPREADSHEET_ID` | Live: ID dokumen, bukan URL lengkap. |
| `GOOGLE_SERVICE_ACCOUNT_FILE` | Live: path JSON akun layanan privat. Berkas harus dapat dibaca, bertipe `service_account`, dan memiliki kunci RSA valid. |
| `CACHE_DIR` | Default `server/private/cache`. Data kontak di cache tetap bersifat privat. |
| `SESSION_DIR` | Default `server/private/sessions`. Jangan dipublikasikan atau dimasukkan ke bundle. |
| `TRUST_PROXY` | Kosong secara default. Nilai yang diterima hanya `loopback`, untuk reverse proxy lokal yang dipercaya. |

Kredensial, allowlist, cache, dan sesi tidak boleh berada di `public/`, `dist/`, atau `src/`, termasuk target symlink. Lebih baik simpan kunci Google di luar repository. Terapkan izin filesystem/ACL khusus akun OS server; `0600`/`0700` tidak menggantikan ACL Windows. Jangan menaruh private data di folder yang disalin Vite.

Mode `sheets` tidak pernah otomatis berubah menjadi demo. Konfigurasi live yang hilang/invalid menggagalkan startup. Kesalahan koneksi saat runtime menghasilkan pesan aman dan mempertahankan cache; tanpa cache, API menjawab 503 dengan `data:null`, bukan array nol palsu.

## 2. Menyiapkan Google Sheets read-only

1. Buat/pilih proyek Google Cloud milik organisasi dan aktifkan **Google Sheets API**.
2. Buat service account khusus dashboard. Jangan berikan peran editor/owner proyek untuk sekadar membaca spreadsheet.
3. Buat JSON key sesuai kebijakan organisasi, simpan privat di luar folder publik. Rotasi/revoke key jika pernah terpapar.
4. Buka spreadsheet operasional dan bagikan **dokumen tersebut saja** kepada alamat `client_email` akun layanan sebagai **Viewer/Pembaca**. Jangan aktifkan "anyone with the link".
5. Isi `DATA_MODE=sheets`, ID dokumen, path JSON, secret sesi, dan allowlist pengguna. Restart server untuk mengganti konfigurasi sumber.
6. Login dengan pengguna yang disetujui, buka Status Data, lalu Perbarui Data. Cocokkan hitungan dengan sheet sebelum penggunaan operasional.

Library `google-auth-library` meminta scope tunggal:

```text
https://www.googleapis.com/auth/spreadsheets.readonly
```

Server hanya mengirim `GET` ke `spreadsheets.values.batchGet`. Tidak ada endpoint write/append/update atau perubahan sharing. Satu pembacaan mencakup empat range **seluruh tab**, tanpa batas kolom akhir:

```text
'Data Sekolah'
'Data Pic Sekolah'
'Data Tier Sekolah'
'Riwayat Kunjungan'
```

Parameter eksplisit: `majorDimension=ROWS`, `valueRenderOption=UNFORMATTED_VALUE`, dan `dateTimeRenderOption=SERIAL_NUMBER`. Kolom `Tier 2028`, `Tier 2031`, atau tahun baru berikutnya tetap ikut dibaca tanpa perubahan kode. Normalisasi bersama berada di `shared/data.mjs`; header wajib dan aturan kualitas data dijelaskan dalam `docs/DATA-RULES.md`.

Pembacaan dibatasi 8 detik per percobaan dan paling banyak 3 percobaan. Hanya 429, 5xx, timeout, atau gangguan jaringan tertentu yang dicoba ulang dengan jeda eksponensial dan jitter. Kesalahan izin 403 tidak diulang. Response body API Google, token, private key, path key, dan nomor kontak tidak dicetak ke respons kesalahan.

## 3. Membuat pengguna yang disetujui

Jalankan dari akar proyek, memakai **prompt password tersembunyi**:

```bash
node scripts/create-user.mjs --name "Nama pengguna" --email "pengguna@example.org" --role marketing
```

Role yang diterima: `marketing`, `coordinator`, `admin`. Seluruh pengguna yang disetujui dapat membaca data tim, sesuai PRD; role bukan pembatas per-sekolah. Tidak ada kredensial default atau registrasi publik.

Untuk otomasi, pipe password melalui **stdin** dari secret manager, bukan argumen shell. Contoh pola (ganti pemanggilan secret manager sesuai lingkungan, jangan tulis password literal di history):

```bash
secret-manager read dashboard-password | node scripts/create-user.mjs --name "Nama pengguna" --email "pengguna@example.org"
```

Atau gunakan `--stdin-json` dan pipe objek `{name,email,role,password}` dari secret manager. Tidak ada flag `--password`. Panjang password 12–256 karakter. Jangan mengirim password dalam chat, email, log, atau URL.

Script menolak email/ID ganda, memakai lock file, menulis atomik, dan hanya menyimpan scrypt salt+hash (N=32768, r=8, p=1), bukan password. Password/hash tidak dicetak. Jika proses mati saat lock masih ada, pastikan tidak ada proses create-user lain sebelum admin menghapus file `.lock` tersebut.

Untuk mencabut akses, hapus pengguna dari allowlist secara aman. Server membaca ulang allowlist pada request API berautentikasi; penghapusan user, perubahan password hash, atau file tidak valid mencabut sesi terkait. Rotasi `SESSION_SECRET` membatalkan seluruh sesi. Untuk mengganti email/password akun sendiri, gunakan **Pengelolaan → Pengaturan akun** dengan konfirmasi password saat ini; lihat `docs/ACCOUNT.md`. Setelah disimpan, semua sesi lama akun tersebut harus login ulang. Jika lupa password, pemulihan administratif tetap dilakukan terpisah; CLI create-user tidak menimpa akun yang sudah ada.

## 4. HTTP, cookie, dan same-origin

- Public: `GET /api/health` → `{ok:true}`; `GET /api/auth/session` → user yang disanitasi atau null dan `demoAvailable`.
- Login: `POST /api/auth/login` → `{user}`; kegagalan memakai pesan 401 generik.
- Demo lokal: `POST /api/auth/demo` hanya dalam mode demo nonproduksi, dari loopback; forwarded remote client ditolak.
- Logout: `POST /api/auth/logout` menghancurkan sesi dan menghapus cookie.
- Data: `GET /api/data` dan `POST /api/sync` wajib login. Unknown `/api/*` selalu JSON 404, bukan HTML SPA.
- Semua POST API harus `application/json`, memiliki `Origin` yang diizinkan dan Host yang tepat. Origin hilang/null/asing atau `Sec-Fetch-Site: cross-site` ditolak 403. Form POST ditolak 415. Body dibatasi 16 KiB.
- Tidak ada CORS wildcard atau CORS lintas-origin untuk data. Vite menggunakan proxy `/api` same-origin.
- Lokal: Host/origin `127.0.0.1` dan `localhost` pada port backend yang dikonfigurasi serta port Vite 5173 diterima. Jangan membuka demo lewat tunnel/reverse proxy publik atau bind ke jaringan.
- Produksi: Host/origin hanya `APP_ORIGIN`. Reverse proxy harus mempertahankan Host publik yang tepat dan menghapus/menulis ulang forwarded headers dari klien.
- Cookie sesi host-only, HttpOnly, SameSite=Strict, 8 jam idle/rolling. Login meregenerasi ID sesi; logout menghancurkannya. Produksi memakai Secure dan prefix `__Host-`.
- File sesi dinamespasi oleh mode, spreadsheet, dan signing secret. Tidak ada password atau workbook yang disimpan di cookie. File sesi menyimpan identitas autentikasi minimal.
- Login dibatasi 10 percobaan/IP/15 menit serta 10/identitas email/15 menit; demo berbagi limit IP yang sama. Verifikasi akun yang tidak ada tetap memakai scrypt dummy dan minimum delay dengan jitter. Limit sinkronisasi manual 6/IP/menit. 429 menyertakan Retry-After.
- Limit berada di memori proses. Jalankan satu instance atau gunakan store limiter/sesi bersama sebelum deployment multi-instance. Restart bukan mekanisme untuk menghindari limit.

Untuk reverse proxy HTTPS di mesin yang sama, gunakan contoh konfigurasi **bukan kredensial nyata**:

```dotenv
DATA_MODE=sheets
NODE_ENV=production
HOST=127.0.0.1
PORT=3001
APP_ORIGIN=https://marketing.example.org
TRUST_PROXY=loopback
```

Tambahkan nilai privat sebenarnya untuk secret, users file, spreadsheet, dan key file. Batasi port backend ke loopback/firewall; terminasi TLS pada proxy yang dikelola. Proxy nonloopback belum didukung konfigurasi ini dan tidak boleh diatasi dengan `trust proxy=true`.

## 5. Sinkronisasi dan last-good cache

- Server tidak membaca sumber sampai request data/sync berautentikasi pertama. Setelah itu timer server berjalan setiap **300000 ms (5 menit)**. Perubahan UI bukan bukti koneksi; periksa timestamp dan status.
- Refresh bersamaan digabung menjadi satu pembacaan sumber. GET memakai cache; pembacaan awal tanpa cache menunggu sync. Kegagalan pembacaan awal memiliki cooldown 10 detik; tombol sync tetap tunduk pada rate limit.
- Cache menyimpan **data ternormalisasi**, identitas mode+spreadsheet, versi format, dan waktu sukses. Workbook mentah tidak dipersistenkan atau dikirim ke browser.
- Penulisan menggunakan temporary file acak di direktori cache yang sama lalu atomic rename. Kegagalan download/normalisasi/persistensi tidak mengganti snapshot valid sebelumnya.
- Cache tidak dibagikan antar spreadsheet maupun antara demo dan live. Cache yang rusak atau tidak cocok identitasnya diabaikan, bukan dianggap data kosong.
- Restart dapat membaca cache tanpa jaringan; koneksi live belum diklaim connected sampai pembacaan berhasil. Sinkronisasi manual dapat langsung memverifikasi koneksi.
- Header/tab wajib hilang: pertahankan data sebelumnya, tampilkan `status.error` aman dan `status.issues` untuk sumber yang gagal. Masalah baris nonfatal tetap ada di `data.issues`.
- Dengan cache, kegagalan sync tetap 200 dengan data terakhir + status error. Tanpa cache, 503 + `data:null`. `lastSuccessAt` tidak maju pada kegagalan; `lastAttemptAt` mencatat percobaan.

Cache dan sesi mengandung data internal dan wajib diberi ACL, backup terenkripsi, kebijakan retensi, dan akses admin terbatas. Store sesi tidak menjalankan background reaper otomatis: jadwalkan maintenance untuk membersihkan sesi yang sudah expired dan namespace lama setelah memastikan tidak dipakai. Cookie expired tetap ditolak oleh store. Penghapusan cache menyebabkan sync awal baru, bukan fallback demo.

## 6. Menjalankan dan memverifikasi

Development: backend `node server/index.mjs`, frontend lewat Vite sesuai launcher proyek. Production-like: jalankan `npm run build`, lalu backend yang sama melayani `dist/` beserta `/assets` dan aset publik yang disalin Vite. Jangan menjalankan static server dari akar repo; hanya `dist/` yang boleh dipublikasikan. Server menolak path privat, dotfiles, ekstensi yang tidak diizinkan, dan symlink keluar `dist`.

```bash
node --test tests/server.test.mjs tests/sync.test.mjs
```

`createApp(options={})` mengembalikan Express app async. Test dapat menginjeksi `env` atau full trusted `config` dari `readConfig`, `workbookLoader`, `normalizer`, `cacheDir`, `sessionStore`, `now`, `distDir`, `users`, `limits`, dan `authDelayMs`; `autoSync:false` menonaktifkan timer. Ini dependency injection untuk kode test, bukan opsi HTTP. `app.locals.close()` menghentikan timer dan menunggu sync aktif; `startServer()` menyediakan shutdown server. Test memakai normalizer produksi bersama dan transport terkontrol untuk kegagalan/transient retry.

Checklist sebelum penggunaan operasional:

- [x] Akun layanan nyata berhasil membaca empat tab dengan scope read-only; peran Viewer pada dokumen tetap menjadi konfigurasi yang harus dipelihara admin.
- [x] Allowlist lokal berisi akun awal disetujui, secret kuat dipertahankan, dan ACL privat user/SYSTEM terpasang.
- [ ] TLS/reverse proxy, Host/origin, Secure cookie, logout, dan pencabutan sesi diperiksa dari browser deployment sebenarnya.
- [ ] Hitungan cocok dengan spreadsheet nyata, termasuk tahun tier baru dan baris invalid.
- [ ] Cache bertahan setelah restart dan kegagalan API; cache dataset lain tidak muncul.
- [ ] Backup, retensi, pembersihan sesi/cache lama, rotasi key, dan alert uptime diputuskan.
- [ ] Jangan mengklaim readiness operasional sebelum checklist akun/TLS nyata selesai. MFA, SSO, notifikasi, dan pembatasan per-marketing tidak termasuk versi ini.

## Referensi primer

- Google batchGet: https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/batchGet
- Google A1 notation: https://developers.google.com/workspace/sheets/api/guides/concepts#cell
- Google Auth Library: https://cloud.google.com/nodejs/docs/reference/google-auth-library/latest
- Express security: https://expressjs.com/en/advanced/best-practice-security.html
- Express sessions: https://expressjs.com/en/resources/middleware/session.html
