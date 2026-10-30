# Verifikasi Pengaturan Akun

## Hasil pengujian nyata

- `npm test`: **98 tes lulus**, 0 gagal. Mencakup API akun, autentikasi/sesi, unit frontend, serta regresi domain dan Google loader terkontrol.
- `npm run build`: berhasil.
- Review independen menemukan satu race pada penyimpanan akun bersamaan dengan logout/login. Temuan diperbaiki, diuji dengan respons tertahan (sukses dan 401 serta urutan logout lebih dulu), dan pemeriksaan ulang independen menyatakan masalah yang dilaporkan sudah selesai tanpa temuan baru pada lingkup tersebut.
- `npx playwright test -c playwright.account.config.mjs --reporter=line`: **8 tes lulus** pada desktop dan mobile. Menggunakan akun/workbook fiktif dan server terisolasi; tidak mengganti kredensial pengguna nyata.
- Suite dashboard demo umum pada port 3105, workers=1: **22 tes lulus**, termasuk Pengaturan akun demo hanya-baca. Server demo uji dihentikan setelah selesai.
- Pengujian live setelah restart port 3001: login lama tetap berhasil; halaman akun tampil di desktop dan HP; tidak ada POST perubahan akun pada server live. Hash integritas file pengguna dan konfigurasi dibandingkan sebelum/sesudah deploy, hasilnya tidak berubah.
- Google Sheets nyata tetap `mode=sheets`, `connection=connected`; hasil API website dibandingkan dengan pembacaan baru keempat tab melalui loader produksi. Tidak ada perubahan pada sel, sharing, atau izin spreadsheet.

Ringkasan live aman tanpa password/key disimpan di `docs/ACCOUNT-LIVE-VERIFICATION.json`. Screenshot pemeriksaan layout disimpan di cache scratch lokal, bukan pada aset publik.

## Jalur keamanan yang diuji

- Hanya akun sendiri: body ID/role/nama palsu tidak mengubah identitas atau akun lain.
- Password saat ini wajib dan salah password tidak menulis perubahan.
- Email tidak valid, email duplikat, password lemah/panjang, konfirmasi salah, dan perubahan kosong ditolak.
- Perubahan email saja serta password saja didukung; hash selalu dirotasi sehingga sesi lama tidak berlaku lagi.
- Cookie sesi lain menjadi tidak berwenang setelah perubahan; kredensial baru dapat login dan kredensial lama ditolak.
- Request anonim, akun demo, origin/host asing, dan body form non-JSON ditolak.
- Rate limit terpisah untuk endpoint perubahan akun, berdasarkan IP dan identitas yang terautentikasi.
- Dua penulisan bersamaan tidak dapat sama-sama commit memakai fingerprint lama.
- Fingerprint yang berubah di bawah writer lock ditolak; error penyimpanan tidak mengekspos path, isi file, atau nilai password.
- Kegagalan cleanup sesi setelah commit tidak menyatakan bahwa perubahan gagal; fingerprint yang sudah dipersistenkan tetap membatalkan semua sesi lama.
- Respons data dari login sebelumnya tidak dapat mengisi ulang dataset setelah akun diganti dan login berikutnya dimulai.
- Login, logout, dan penyimpanan akun tidak dapat berjalan saling menimpa dalam App yang sama. Tombol logout/login dikunci selama respons perubahan akun belum selesai, dan respons lama (sukses maupun 401) diabaikan setelah generasi autentikasi berubah. Urutan logout lebih dulu juga diuji.
- Form tetap tersedia ketika dataset Sheets tidak dapat dimuat. Password tidak dimasukkan ke URL, localStorage, atau sessionStorage.

## Batasan

Pengujian live sengaja **tidak mengganti akun pengguna nyata**. Perubahan kredensial diuji end-to-end pada file akun fiktif terisolasi. HTTPS/deployment internet, pengiriman email verifikasi, reset lupa password, dan manajemen akun pengguna lain bukan bagian fitur ini. Server lokal tetap hanya terikat ke loopback.
