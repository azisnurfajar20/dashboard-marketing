import { test, expect } from '@playwright/test';
import { dashboardSummary, jakartaToday } from '../../shared/selectors.mjs';

let demoCookies = null;
async function enterDemo(page) {
  if (demoCookies) await page.context().addCookies(demoCookies);
  await page.goto('/');
  if (!demoCookies) {
    await page.getByRole('button', { name: 'Masuk mode demo', exact: true }).click();
  }
  await expect(page.getByTestId('page-dashboard')).toBeVisible();
  demoCookies = await page.context().cookies();
}

async function noPageOverflow(page) {
  const size = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: document.documentElement.clientWidth,
  }));
  expect(size.scroll).toBeLessThanOrEqual(size.width + 1);
}

test('data internal ditolak sebelum login', async ({ page, request }) => {
  const response = await request.get('/api/data');
  expect(response.status()).toBe(401);
  const sync = await request.post('/api/sync', { data: {} });
  expect([401, 403]).toContain(sync.status());
  await page.goto('/#/schools');
  await expect(page.getByRole('button', { name: 'Masuk mode demo', exact: true })).toBeVisible();
  await expect(page.getByTestId('page-schools')).toHaveCount(0);
  await noPageOverflow(page);
});

test('mode demo jelas dan KPI dihitung dari API terlindungi', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await enterDemo(page);
  await expect(page.locator('.demo-banner')).toBeVisible();
  await expect(page.locator('.demo-banner')).toContainText(/data.*fiktif/i);
  const payload = await page.request.get('/api/data').then(r => r.json());
  expect(payload.status.mode).toBe('demo');
  expect(payload.status.connection).toBe('demo');
  const selectedYear = Number(await page.getByTestId('tier-year').inputValue());
  const start = await page.getByLabel('Dari tanggal', { exact: true }).inputValue();
  const end = await page.getByLabel('Sampai tanggal', { exact: true }).inputValue();
  const summary = dashboardSummary(payload.data, { year: selectedYear, start, end, today: jakartaToday() });
  await expect(page.getByTestId('kpi-schools')).toContainText(String(summary.totalSchools));
  await expect(page.getByTestId('kpi-visits')).toContainText(String(summary.visits));
  await expect(page.getByTestId('kpi-today')).toContainText(String(summary.followUpToday));
  await expect(page.getByTestId('kpi-overdue')).toContainText(String(summary.followUpOverdue));
  await noPageOverflow(page);
  expect(errors).toEqual([]);
});

test('kartu sekolah membuka daftar pendukung dan detail ID yang tepat', async ({ page }) => {
  await enterDemo(page);
  await page.getByTestId('kpi-schools').click();
  await expect(page.getByTestId('page-schools')).toBeVisible();
  const { data } = await page.request.get('/api/data').then(r => r.json());
  const school = data.schools[0];
  await page.goto('/#/schools/' + encodeURIComponent(school.id));
  const detail = page.getByTestId('page-school-detail');
  await expect(detail).toBeVisible();
  await expect(detail).toContainText(school.name);
  await expect(detail).toContainText(school.id);
  await expect(detail).toContainText(school.owner);
  await noPageOverflow(page);
});

test('seluruh halaman dapat digunakan tanpa galat browser', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await enterDemo(page);
  for (const route of ['schools', 'tiers', 'visits', 'follow-ups', 'data-status', 'dashboard']) {
    await page.goto('/#/' + route);
    await expect(page.getByTestId('page-' + route)).toBeVisible();
    await noPageOverflow(page);
  }
  expect(errors).toEqual([]);
});

test('tier tahunan dapat diganti tanpa mengubah tahun data', async ({ page }) => {
  await enterDemo(page);
  const { data } = await page.request.get('/api/data').then(r => r.json());
  const year = Math.min(...data.years);
  await page.getByTestId('tier-year').selectOption(String(year));
  await expect(page.getByTestId('tier-year')).toHaveValue(String(year));
  await page.getByTestId('kpi-schools').click();
  await expect(page.getByTestId('page-schools')).toBeVisible();
  await expect(page.getByTestId('tier-year')).toHaveValue(String(year));
});

test('refresh memperbarui sinkronisasi tanpa menyamarkan data demo', async ({ page }) => {
  await enterDemo(page);
  const before = await page.request.get('/api/data').then(r => r.json());
  const syncResponse = await page.request.post('/api/sync', {
    data: {}, headers: { Origin: new URL(page.url()).origin },
  });
  expect(syncResponse.ok()).toBe(true);
  const after = await syncResponse.json();
  expect(after.status.mode).toBe('demo');
  expect(after.status.connection).toBe('demo');
  expect(after.status.lastSuccessAt).toBeTruthy();
  expect(new Date(after.status.lastSuccessAt).getTime()).toBeGreaterThanOrEqual(new Date(before.status.lastSuccessAt).getTime());
  await page.reload();
  await expect(page.getByTestId('page-dashboard')).toBeVisible();
  await expect(page.locator('.demo-banner')).toBeVisible();
  await expect(page.locator('.demo-banner')).toContainText(/data.*fiktif/i);
});

test('status data keeps structured diagnostics when the first Google read has no cache', async ({ page }) => {
  await enterDemo(page);
  await page.route('**/api/data', route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({
      error: 'SYNC_FAILED',
      message: 'Sumber belum tersedia.',
      data: null,
      status: {
        mode: 'sheets', connection: 'error', error: 'Kolom wajib tidak ditemukan.',
        lastSuccessAt: null, lastAttemptAt: '2026-10-23T00:00:00.000Z', nextSyncAt: null,
        spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/example12345/edit',
        issues: [{ code: 'MISSING_HEADER', severity: 'error', tab: 'Data Sekolah', row: 1, column: 'ID Sekolah', message: 'Kolom wajib tidak ditemukan.' }],
      },
    }),
  }));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Data belum tersedia' })).toBeVisible();
  await page.getByRole('link', { name: 'Periksa status sumber data' }).click();
  const statusPage = page.getByTestId('page-data-status');
  await expect(statusPage).toBeVisible();
  await expect(statusPage).toContainText('Belum ada dataset tervalidasi');
  await expect(statusPage).toContainText('Gagal · belum ada dataset tersimpan');
  await expect(statusPage).toContainText('Kolom wajib tidak ditemukan.');
  await expect(statusPage).toContainText('Data Sekolah');
  await expect(statusPage).toContainText('Tidak ada data demo atau angka nol');
  await noPageOverflow(page);
});

test('pencarian ID sekolah dan keadaan kosong bekerja di direktori', async ({ page }) => {
  await enterDemo(page);
  const { data } = await page.request.get('/api/data').then(r => r.json());
  const school = data.schools[0];
  await page.goto('/#/schools');
  const search = page.getByLabel('Cari sekolah', { exact: true });
  await search.fill(school.id);
  const rows = page.locator('.directory-card tbody tr');
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText(school.name);
  if (page.viewportSize().width < 768) {
    await page.locator('.directory-card').scrollIntoViewIfNeeded();
    const mobileDetail = rows.locator('.mobile-detail-link');
    await expect(mobileDetail).toBeVisible();
    await expect(mobileDetail).toBeInViewport();
  }
  await search.fill('TIDAK-ADA-SEKOLAH-INI-000');
  await expect(page.locator('.directory-card .empty-state')).toBeVisible();
  await expect(page.locator('.directory-card tbody')).not.toContainText(school.name);
  await noPageOverflow(page);
});

test('navigasi desktop dan menu HP membuka halaman yang tepat', async ({ page }) => {
  await enterDemo(page);
  const trigger = page.getByRole('button', { name: 'Buka menu navigasi', exact: true });
  const mobile = await trigger.isVisible();
  if (mobile) {
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('dialog', { name: 'Navigasi utama' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
  }
  await page.locator('#app-sidebar').getByRole('link', { name: 'Data sekolah', exact: true }).click();
  await expect(page.getByTestId('page-schools')).toBeVisible();
  if (mobile) await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await noPageOverflow(page);
});

test('pengaturan akun demo tetap hanya-baca dan tidak mengirim perubahan kredensial', async ({ page }) => {
  await enterDemo(page);
  await page.goto('/#/account');
  const account = page.getByTestId('page-account');
  await expect(account).toBeVisible();
  await expect(account).toContainText('Akun demo bersifat hanya-baca');
  await expect(account.locator('input')).toHaveCount(0);
  await expect(account.getByRole('button', { name: 'Simpan perubahan', exact: true })).toHaveCount(0);
  await noPageOverflow(page);
});

test('keluar menghapus akses sesi sebelumnya', async ({ page }) => {
  await enterDemo(page);
  await page.getByRole('button', { name: 'Keluar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Masuk mode demo', exact: true })).toBeVisible();
  const response = await page.request.get('/api/data');
  expect(response.status()).toBe(401);
});
