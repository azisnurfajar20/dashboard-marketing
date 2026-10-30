# Panduan mengedit kode marketing-dashboard sendiri

Folder proyek: `D:\marketing-dashboard`.

## Kenapa perubahan belum muncul?

Proyek ini mempunyai dua cara menjalankan tampilan:

| Mode | Alamat browser | Apa yang ditampilkan |
| --- | --- | --- |
| Edit / development | `http://127.0.0.1:5173` | Source terbaru, melalui Vite |
| Pemakaian biasa / hasil build | `http://127.0.0.1:3001` | Berkas hasil build dalam `dist` |

`Jalankan Dashboard.cmd` hanya menjalankan `npm run build` jika `dist\index.html` belum ada. Jadi, setelah Anda mengubah source, membuka launcher biasa lagi belum tentu memperbarui tampilan.

Alurnya:

```text
Saat mengedit: src / index.html / public -> npm run dev -> browser port 5173
Saat memakai hasil akhir: source -> npm run build -> dist -> npm start -> browser port 3001
```

**Edit source, bukan folder `dist`.** Isi `dist` merupakan hasil otomatis dan dapat ditimpa ketika build ulang.

## 1. Membuka proyek

1. Buka editor kode, misalnya VS Code.
2. Pilih **File -> Open Folder**, lalu buka `D:\marketing-dashboard`.
3. Pastikan Anda membuka folder yang benar, bukan folder salinan atau hanya folder `dist`.
4. Sebelum perubahan besar, buat cadangan file source yang hendak diubah.

## 2. Menyalakan mode edit

Jika dashboard sebelumnya sedang berjalan di terminal lain, hentikan terminal dashboard tersebut dengan **Ctrl+C**. Jangan menjalankan dua server API pada port 3001 bersamaan.

Di VS Code, buka terminal **Command Prompt / cmd**, lalu jalankan:

```bat
cd /d D:\marketing-dashboard
npm run dev
```

Jika terminal Anda menggunakan **PowerShell**, gunakan:

```powershell
Set-Location 'D:\marketing-dashboard'
npm.cmd run dev
```

Tunggu sampai Vite siap. Buka alamat ini di browser:

```text
http://127.0.0.1:5173
```

- **Gunakan port 5173 untuk melihat perubahan selama mengedit.**
- Port 3001 tetap dipakai API; halaman pada port itu masih merupakan hasil build.
- Biarkan terminal mode edit tetap terbuka.
- Gunakan akun login dashboard yang sudah ada. Tidak perlu membuat akun atau key Google baru.

## 3. Mengubah kode dan melihat hasilnya

1. Buka file source yang ingin Anda ubah.
2. Ubah sedikit dahulu agar mudah mengetahui efeknya.
3. Simpan dengan **Ctrl+S**.
4. Lihat browser pada port **5173**. Perubahan frontend biasanya diperbarui otomatis oleh Vite.
5. Jika belum terlihat, periksa error di terminal dan browser sebelum mencoba perubahan lain.

### File yang biasanya diedit

| Ingin mengubah | File / folder |
| --- | --- |
| Warna, font, dan CSS utama | `src/styles/theme.css` |
| Tampilan pengaturan akun | `src/pages/account/AccountPage.jsx` dan `src/styles/account.css` |
| Sidebar dan kerangka halaman | `src/components/layout/AppLayout.jsx` |
| Logo / identitas pada layout | `src/components/layout/Brand.jsx` |
| Halaman ringkasan dashboard | `src/pages/dashboard/DashboardPage.jsx` |
| Halaman data sekolah | `src/pages/schools/SchoolsPage.jsx` |
| Halaman detail sekolah | `src/pages/schools/SchoolDetailPage.jsx` |
| Halaman login | `src/pages/auth/LoginPage.jsx` |
| Halaman kunjungan | `src/pages/visits/VisitsPage.jsx` |
| Halaman follow-up | `src/pages/follow-ups/FollowUpsPage.jsx` |
| Judul tab browser dan metadata HTML | `index.html` di root proyek |
| File gambar / logo | `public/assets/images/logo/` |
| API dan proses backend | `server/` |

Contoh: jika ingin mengganti tulisan pada sidebar, cari tulisan tersebut di `src/components/layout/AppLayout.jsx`, ubah, simpan, lalu lihat port 5173. Jangan mengubah berkas JavaScript bernama `index-....js` di `dist/assets`.

Mode `npm run dev` juga menjalankan backend dengan `node --watch`. Mengubah file backend yang dipantau dapat menyebabkan restart. Mengubah `.env` memerlukan penghentian dan penyalaan ulang; jangan menganggap hot reload frontend akan menerapkan perubahan konfigurasi server.

## 4. Menyiapkan hasil edit untuk pemakaian biasa

Setelah selesai mengedit:

1. Di terminal mode edit, tekan **Ctrl+C** dan tunggu proses berhenti. Jika Command Prompt menanyakan penghentian batch, konfirmasikan.
2. Dari folder proyek, jalankan:

```bat
npm test
npm run build
npm start
```

Jalankan perintah berikutnya hanya jika perintah sebelumnya berhasil. Jika tes gagal karena label atau perilaku memang sengaja Anda ubah, tinjau kodenya dan sesuaikan tes dengan perilaku yang benar; jangan mengabaikan kegagalan tanpa diperiksa.

3. Buka `http://127.0.0.1:3001`.
4. Jika browser masih menampilkan tampilan lama, lakukan refresh paksa dengan **Ctrl+F5**.
5. Biarkan terminal `npm start` terbuka selama dashboard dipakai.

Tidak perlu build setiap kali menyimpan file ketika bekerja di mode edit port 5173. Build diperlukan agar hasil edit masuk ke tampilan biasa di port 3001.

## Jika ada masalah

| Gejala | Periksa / lakukan |
| --- | --- |
| Sudah save tetapi tampilan tetap lama | Pastikan browser memakai port 5173 saat mengedit; pastikan file berada di folder source yang benar |
| Port 3001 masih tampak lama | Jalankan `npm run build`; perubahan backend juga perlu restart server |
| Port 3001 sudah digunakan / EADDRINUSE | Hentikan instance dashboard sebelumnya dari terminalnya; jangan menutup proses aplikasi lain secara acak |
| Port 5173 sudah digunakan | Periksa terminal mode edit lain yang mungkin masih berjalan |
| Halaman putih atau ada overlay error | Baca pesan error pertama di browser dan terminal; perbaiki kesalahan JSX/import/sintaks |
| `npm.ps1` tidak boleh dijalankan | Gunakan `npm.cmd` di PowerShell atau pilih terminal Command Prompt; tidak perlu mengubah kebijakan keamanan PowerShell |
| Terminal sudah ditutup | Jalankan kembali `npm run dev` sebelum membuka port 5173 |
| Perubahan `.env` belum diterapkan | Hentikan dan jalankan ulang server |

### Catatan launcher biasa setelah mengganti judul website

Pada versi launcher yang diperiksa, `scripts/launch.mjs` masih memakai teks `Monitor Marketing` untuk mengenali halaman dashboard. Jika judul/teks tersebut Anda ganti, launcher dapat salah menganggap dashboard belum siap. Gunakan **`npm start`** untuk menjalankan hasil build tanpa pemeriksaan judul launcher tersebut. Panduan ini tidak mengubah judul atau kode launcher Anda.

## Batas keamanan

- Input data sekolah, PIC, tier, dan kunjungan tetap dilakukan di **Google Sheets**. Panduan ini untuk mengedit kode website, bukan mengubah sumber data lewat website.
- Jangan menaruh password, token, JSON key, `.env`, file pengguna, cache, atau sesi dalam `src`, `public`, atau `dist`.
- Jangan mengubah email/password pengguna nyata hanya untuk mencoba kode. Tes perubahan akun harus memakai fixture terisolasi yang sudah tersedia.
- Jangan menghapus `.env` atau mengganti konfigurasi Google hanya karena perubahan tampilan belum muncul.

## Verifikasi panduan

Perintah `npm run dev` telah dijalankan pada proyek ini: frontend port 5173 memuat source dan client Vite, proxy API menjawab sehat, halaman login tampil di browser headless, dan tidak ada page error. Proses uji dihentikan setelah verifikasi. Kode aplikasi, kredensial, dan konfigurasi Google tidak diubah untuk pengujian ini.

Rujukan konsep development/build: `https://vite.dev/guide/` dan `https://vite.dev/guide/static-deploy.html`.
