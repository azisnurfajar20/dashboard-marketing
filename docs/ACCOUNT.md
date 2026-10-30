# Pengaturan akun dashboard

## Penggunaan

1. Masuk ke website menggunakan akun dashboard yang berlaku.
2. Buka **Pengelolaan → Pengaturan akun** (`#/account`). Di HP, buka menu navigasi terlebih dahulu.
3. Ubah **Email login**, **Kata sandi baru**, atau keduanya. Kosongkan dua kolom kata sandi baru jika hanya mengganti email.
4. Isi **Kata sandi saat ini** untuk mengonfirmasi identitas. Kata sandi baru harus 12–256 karakter dan sama dengan kolom konfirmasinya.
5. Klik **Simpan perubahan**. Jika berhasil, semua sesi lama akun tersebut tidak berlaku dan pengguna diminta masuk kembali menggunakan kredensial yang baru.

Perubahan ini hanya untuk **login dashboard**, bukan email/password akun Google, alamat service account, JSON key, atau izin Google Sheets. Tidak ada email verifikasi atau pemulihan yang dikirim. Data sekolah dan kunjungan tetap hanya diubah melalui Google Sheets.

`akses-dashboard.txt` adalah catatan kredensial awal, bukan konfigurasi akun aktif. File tersebut tidak diperbarui otomatis setelah pengguna mengganti akun lewat website. Simpan kredensial baru di pengelola password; jangan mengirim password, file catatan login, atau JSON key ke chat.

## Batasan dan keamanan

- Pengguna hanya dapat mengubah akun miliknya sendiri. ID akun, nama tampilan, role, serta akun pengguna lain tidak berubah.
- Kata sandi saat ini wajib diverifikasi untuk perubahan email maupun password.
- Email disimpan konsisten dalam huruf kecil dan tidak boleh digunakan oleh akun lain.
- Kata sandi disimpan sebagai hash scrypt dengan salt, bukan teks biasa. Request memuat password hanya dalam body JSON; tidak di URL, log aplikasi, localStorage, atau respons API.
- Perubahan email saja tetap memperbarui fingerprint kredensial agar sesi lama tidak bisa digunakan lagi.
- Penyimpanan memakai lock file, pembacaan ulang keadaan terbaru, temporary file, dan atomic rename. Sesi yang sudah kedaluwarsa/berubah tidak dapat menimpa perubahan baru secara diam-diam.
- Request wajib berasal dari origin dashboard yang diizinkan, berformat JSON, sudah login sebagai pengguna approved, dan tunduk pada pembatasan frekuensi.
- Identitas demo fiktif tidak dapat mengubah kredensial. Akses ke Pengaturan akun tidak bergantung pada keberhasilan membaca dataset Google Sheets.
- Website lokal tetap menggunakan loopback. Sebelum deployment jaringan/internet, wajib gunakan HTTPS dan konfigurasi produksi yang sesuai. Fitur ini bukan reset password bagi pengguna yang lupa password; pemulihan administratif dilakukan terpisah.

## Pengujian

Tes tidak boleh mengubah akun pengguna nyata atau file privat konfigurasi live.

```bash
node --test tests/account.test.mjs tests/account-frontend.test.mjs
npm run build
npx playwright test -c playwright.account.config.mjs
```

Konfigurasi Playwright khusus memakai server fixture di `127.0.0.1:3110`, akun `.invalid`, password fiktif, dan workbook sintetis yang jelas berlabel pengujian. Bukan koneksi Google nyata dan tidak boleh dianggap laporan operasional. Suite demo umum mengecualikan file tes mutasi akun tersebut. Website live port 3001 tidak digunakan untuk tes perubahan kredensial.
