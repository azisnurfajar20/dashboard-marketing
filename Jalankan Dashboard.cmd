@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.12 atau lebih baru belum tersedia. Pasang Node.js, lalu coba kembali.
  pause
  exit /b 1
)
if not exist "node_modules" (
  call npm ci
  if errorlevel 1 goto :failed
)
if not exist "dist\index.html" (
  call npm run build
  if errorlevel 1 goto :failed
)
echo.
echo Dashboard Marketing LPK Duta Persada
echo Buka http://127.0.0.1:3001 di browser.
echo Biarkan jendela ini tetap terbuka. Tekan Ctrl+C untuk menghentikan.
echo Jika dashboard sudah berjalan, browser dibuka tanpa menjalankan server kedua.
echo.
node scripts/launch.mjs
if errorlevel 1 goto :failed
exit /b 0
:failed
echo.
echo Dashboard belum dapat dijalankan. Periksa pesan kesalahan di atas dan README.md.
pause
exit /b 1
