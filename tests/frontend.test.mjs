import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const load = name => import(new URL(`src/utils/${name}.mjs`, root));

test('hash routing preserves filters and encodes exact school IDs', async () => {
  const { parseRoute, routeHref } = await load('routes');
  assert.deepEqual(parseRoute('#/schools/SCH%2F007?year=2028&owner=Tim+Utara'), {
    page: 'school-detail', id: 'SCH/007', filters: { year: '2028', owner: 'Tim Utara' },
  });
  assert.equal(routeHref('visits', { year: '2028', owner: 'Tim Utara', region: 'Sleman' }, { start: '2028-01-01', end: '', group: undefined }), '#/visits?year=2028&owner=Tim+Utara&region=Sleman&start=2028-01-01');
  assert.equal(parseRoute('#/not-real').page, 'not-found');
  assert.equal(parseRoute('').page, 'dashboard');
  assert.equal(parseRoute('#/schools/%E0%A4').page, 'not-found');
});

test('contact URLs only accept valid Indonesian mobile numbers; source links are Sheets only', async () => {
  const { whatsappHref, spreadsheetHref } = await load('format');
  assert.equal(whatsappHref('0812 3456 7890'), 'https://wa.me/6281234567890');
  assert.equal(whatsappHref('+62 812-3456-7890'), 'https://wa.me/6281234567890');
  for (const value of ['', '123', 'demo', 'javascript:alert(1)', '+1 202 555 0100', '081234567890 extra', '08+12 3456 7890', '++62 81234567890']) assert.equal(whatsappHref(value), null);
  assert.equal(spreadsheetHref('https://docs.google.com/spreadsheets/d/abc_123/edit'), 'https://docs.google.com/spreadsheets/d/abc_123/edit');
  for (const value of ['https://docs.google.com.evil.test/spreadsheets/d/id', 'javascript:alert(1)', 'http://docs.google.com/spreadsheets/d/id', null]) assert.equal(spreadsheetHref(value), null);
});

test('Indonesian presentation keeps missing dates explicit and uses Jakarta timestamps', async () => {
  const { formatDate, formatTimestamp, number, initials, presetRange } = await load('format');
  assert.equal(formatDate(null), 'Belum ada');
  assert.equal(formatDate('invalid'), 'Tanggal tidak valid');
  assert.equal(formatDate('2026-10-23'), '23 Okt 2026');
  assert.match(formatTimestamp('2026-10-23T17:30:00Z'), /24 Okt 2026.*00[.:]30/);
  assert.equal(number(1234), '1.234');
  assert.equal(initials('Duta Persada'), 'DP');
  assert.deepEqual(presetRange('month', '2026-10-23'), { start: '2026-10-01', end: '2026-10-23' });
  assert.deepEqual(presetRange('last30', '2026-01-02'), { start: '2025-12-04', end: '2026-01-02' });
  assert.deepEqual(presetRange('year', '2026-10-23'), { start: '2026-01-01', end: '2026-10-23' });
  assert.deepEqual(presetRange('all', '2026-10-23'), { start: '', end: '' });
});

test('API client sends same-origin credentials and recognizes authentication and real failures', async () => {
  const { createApiClient } = await import(new URL('src/services/api/client.js', root));
  const calls = [];
  const api = createApiClient(async (url, options) => {
    calls.push({ url, options });
    if (url === '/api/data') return { ok: false, status: 401, json: async () => ({ error: 'AUTH_REQUIRED', message: 'Masuk diperlukan' }) };
    if (url === '/api/sync') return { ok: false, status: 503, json: async () => ({ error: 'SYNC_FAILED', message: 'Sumber belum tersedia.', data: null, status: { mode: 'sheets', connection: 'error', error: 'Kolom wajib tidak tersedia.', lastSuccessAt: null, lastAttemptAt: '2026-10-23T00:00:00.000Z', nextSyncAt: null, spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/example12345/edit', issues: [{ code: 'MISSING_HEADER', severity: 'error', tab: 'Data Sekolah', row: 1, column: 'ID Sekolah', message: 'Kolom wajib tidak ditemukan.' }] } }) };
    return { ok: true, status: 200, json: async () => ({ user: { name: 'Uji' } }) };
  });
  await api.login('uji@example.test', 'not-a-real-password');
  assert.equal(calls[0].options.credentials, 'same-origin');
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), { email: 'uji@example.test', password: 'not-a-real-password' });
  await assert.rejects(api.data(), error => error.code === 'AUTH_REQUIRED' && error.status === 401);
  await assert.rejects(api.sync(), error => error.message === 'Sumber belum tersedia.' && error.payload?.data === null && error.payload.status.connection === 'error' && error.payload.status.issues[0].code === 'MISSING_HEADER');
});

test('chart aggregation includes every visit, fills zero months and paginates without inventing rows', async () => {
  const { countBy, monthlyVisits, paginate, tierFor, uniqueOptions } = await load('presentation');
  const visits = [{ date: '2026-01-03', marketer: 'Tim B' }, { date: '2026-03-02', marketer: 'Tim A' }, { date: '2026-03-02', marketer: 'Tim A' }];
  assert.deepEqual(countBy(visits, v => v.marketer), [{ label: 'Tim A', value: 2 }, { label: 'Tim B', value: 1 }]);
  assert.deepEqual(monthlyVisits(visits, '2026-01-01', '2026-03-31').map(x => [x.key, x.value]), [['2026-01', 1], ['2026-02', 0], ['2026-03', 2]]);
  assert.deepEqual(monthlyVisits([], '', '', '2026-10-23').map(x => x.value), [0]);
  assert.deepEqual(paginate([1, 2, 3], 99, 2), { rows: [3], page: 2, pages: 2, total: 3, from: 3, to: 3 });
  assert.deepEqual(paginate([], 1, 10), { rows: [], page: 1, pages: 1, total: 0, from: 0, to: 0 });
  assert.equal(tierFor({ tiers: [{ schoolId: 'S1', year: 2028, invalid: true, tier: null }] }, 'S1', '2028'), 'invalid');
  assert.equal(tierFor({ tiers: [] }, 'S1', 2028), 'unassessed');
  assert.deepEqual(uniqueOptions([{ owner: 'B' }, { owner: 'A' }, { owner: 'B' }, { owner: '' }], 'owner'), ['A', 'B']);
});

test('authenticated shell and login expose explicit access, mobile navigation and local theme contract', async () => {
  const app = await readFile(new URL('src/App.jsx', root), 'utf8');
  const layout = await readFile(new URL('src/components/layout/AppLayout.jsx', root), 'utf8');
  const login = await readFile(new URL('src/pages/auth/LoginPage.jsx', root), 'utf8');
  const entry = await readFile(new URL('src/main.jsx', root), 'utf8');
  assert.match(app, /AUTH_REQUIRED/);
  assert.match(app, /sessionChecked/);
  assert.match(app, /api\.session\(/);
  assert.match(layout, /aria-expanded/);
  assert.match(layout, /Escape/);
  assert.match(layout, /Ringkasan/);
  assert.match(layout, /Keluar/);
  assert.match(layout, /mobile-topbar-brand/);
  assert.match(layout, /inert=\{\(mobile && !open\) \|\| undefined\}/);
  assert.match(login, /demoAvailable/);
  assert.match(login, /Masuk mode demo/);
  assert.match(login, /autoComplete="current-password"/);
  assert.match(entry, /bootstrap\/dist\/css\/bootstrap.min.css/);
  assert.match(entry, /@fontsource\/dm-sans/);
  assert.match(entry, /styles\/theme.css/);
});

test('shared controls distinguish tier year, activity dates, responsibility and performers; charts have textual equivalents', async () => {
  const filters = await readFile(new URL('src/components/shared/Filters.jsx', root), 'utf8');
  const charts = await readFile(new URL('src/components/shared/Charts.jsx', root), 'utf8');
  const table = await readFile(new URL('src/components/shared/DataTable.jsx', root), 'utf8');
  assert.match(filters, /testId="tier-year"/);
  assert.match(filters, /data-testid=\{testId\}/);
  for (const label of ['Tahun tier', 'Tanggal aktivitas', 'Marketing penanggung jawab', 'Marketing pelaksana']) assert.ok(filters.includes(label));
  assert.match(charts, /role="img"/);
  assert.match(charts, /<title/);
  assert.match(charts, /<desc/);
  assert.match(table, /<caption/);
  assert.match(table, /scope="col"/);
});

test('dashboard derives protected API metrics and exposes all four filter-preserving drilldowns', async () => {
  const page = await readFile(new URL('src/pages/dashboard/DashboardPage.jsx', root), 'utf8');
  assert.match(page, /dashboardSummary\(data/);
  assert.match(page, /data-testid="page-dashboard"/);
  for (const name of ['kpi-schools', 'kpi-visits', 'kpi-today', 'kpi-overdue']) assert.ok(page.includes(name));
  for (const component of ['TierDonut', 'MonthlyTrend', 'HorizontalBars', 'VisitTable']) assert.ok(page.includes(component));
  assert.match(page, /classifyFollowUp/);
  assert.match(page, /Ringkasan marketing/);
});

test('school directory and exact-ID details support sorting, pages, safe contacts and history', async () => {
  const directory = await readFile(new URL('src/pages/schools/SchoolsPage.jsx', root), 'utf8');
  const detail = await readFile(new URL('src/pages/schools/SchoolDetailPage.jsx', root), 'utf8');
  assert.match(directory, /data-testid="page-schools"/);
  assert.match(directory, /filterSchools/);
  assert.match(directory, /Pagination/);
  assert.match(directory, /Urutkan sekolah/);
  assert.match(detail, /data-testid="page-school-detail"/);
  assert.match(detail, /whatsappHref/);
  assert.match(detail, /schoolId === id/);
  assert.match(detail, /Riwayat tier/);
  assert.match(detail, /PIC sekolah/);
});

test('annual tiers compare dynamic source years and keep missing and invalid assessments distinct', async () => {
  const source = await readFile(new URL('src/pages/tiers/TiersPage.jsx', root), 'utf8');
  assert.match(source, /data-testid="page-tiers"/);
  assert.match(source, /compareTiers\(data/);
  assert.match(source, /Tahun pembanding/);
  assert.match(source, /Tahun tujuan/);
  assert.match(source, /unassessed/);
  assert.match(source, /invalid/);
});

test('visit details and follow-up queues remain read-only, exact-ID and independent of activity dates', async () => {
  const visits = await readFile(new URL('src/pages/visits/VisitsPage.jsx', root), 'utf8');
  const followups = await readFile(new URL('src/pages/follow-ups/FollowUpsPage.jsx', root), 'utf8');
  assert.match(visits, /data-testid="page-visits"/);
  assert.match(visits, /filterVisits/);
  assert.match(visits, /Hasil kunjungan/);
  assert.match(followups, /data-testid="page-follow-ups"/);
  assert.match(followups, /classifyFollowUp/);
  for (const group of ['overdue', 'today', 'upcoming', 'unscheduled', 'completed', 'cancelled', 'status-missing', 'invalid']) assert.ok(followups.includes(group));
  assert.doesNotMatch(followups, /start:\s*filters\.start/);
  assert.doesNotMatch(visits + followups, /dangerouslySetInnerHTML|Tambah kunjungan|Ubah status/);
});

test('data status shows stale connection and grouped source locations without raw cell values', async () => {
  const source = await readFile(new URL('src/pages/data-status/DataStatusPage.jsx', root), 'utf8');
  assert.match(source, /data-testid="page-data-status"/);
  assert.match(source, /lastSuccessAt/);
  assert.match(source, /status\.issues/);
  for (const label of ['Tab sumber', 'Baris', 'Kolom', 'spreadsheetHref']) assert.ok(source.includes(label));
  assert.doesNotMatch(source, /issue\.(value|raw|rawValue)/);
});

test('real React rendering exercises every private page with normalized server-only demo data', async () => {
  const [{ createServer }, { default: react }, { fileURLToPath }, React, { renderToStaticMarkup }, { normalizeWorkbook }, { createDemoWorkbook }] = await Promise.all([
    import('vite'), import('@vitejs/plugin-react'), import('node:url'), import('react'), import('react-dom/server'), import('../shared/data.mjs'), import('../server/services/demo.mjs'),
  ]);
  const server = await createServer({ configFile: false, root: fileURLToPath(root), plugins: [react()], server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] } });
  const warnings = [];
  const originalError = console.error;
  console.error = (...args) => warnings.push(args.map(String).join(' '));
  try {
    const { DashboardContext } = await server.ssrLoadModule('/src/context/DashboardContext.jsx');
    const data = normalizeWorkbook(createDemoWorkbook(new Date('2026-10-23T08:00:00Z')));
    const context = { data, filters: { year: '2026', preset: 'all', start: '', end: '' }, today: '2026-10-23', href: (page, changes = {}, id) => id ? `#/schools/${id}` : `#/${page}?${new URLSearchParams(changes)}`, updateFilters() {}, sync() {}, syncing: false, status: { mode: 'demo', connection: 'demo', lastSuccessAt: '2026-10-23T08:00:00Z', lastAttemptAt: '2026-10-23T08:00:00Z', nextSyncAt: null, error: null } };
    const entries = [ ['dashboard/DashboardPage', 'page-dashboard'], ['schools/SchoolsPage', 'page-schools'], ['schools/SchoolDetailPage', 'page-school-detail'], ['tiers/TiersPage', 'page-tiers'], ['visits/VisitsPage', 'page-visits'], ['follow-ups/FollowUpsPage', 'page-follow-ups'], ['data-status/DataStatusPage', 'page-data-status'] ];
    for (const [path, testId] of entries) {
      const { default: Component } = await server.ssrLoadModule(`/src/pages/${path}.jsx`);
      const html = renderToStaticMarkup(React.createElement(DashboardContext.Provider, { value: context }, React.createElement(Component, { id: data.schools[0].id })));
      assert.ok(html.includes(`data-testid="${testId}"`), path);
      assert.ok(!html.includes('NaN'), `${path} contains no invalid numeric display`);
    }
    const { default: Dashboard } = await server.ssrLoadModule('/src/pages/dashboard/DashboardPage.jsx');
    const blank = { ...context, data: { schools: [], pics: [], tiers: [], visits: [], years: [], issues: [] }, filters: { preset: 'all' } };
    const emptyHtml = renderToStaticMarkup(React.createElement(DashboardContext.Provider, { value: blank }, React.createElement(Dashboard)));
    assert.ok(emptyHtml.includes('Belum ada kunjungan'));
    const { default: Visits } = await server.ssrLoadModule('/src/pages/visits/VisitsPage.jsx');
    const detailContext = { ...context, filters: { ...context.filters, visit: data.visits[0].id } };
    const detailHtml = renderToStaticMarkup(React.createElement(DashboardContext.Provider, { value: detailContext }, React.createElement(Visits)));
    assert.ok(detailHtml.includes('Hasil kunjungan'));
    assert.ok(detailHtml.includes(data.visits[0].id));
    const { default: Tiers } = await server.ssrLoadModule('/src/pages/tiers/TiersPage.jsx');
    const changedYearContext = { ...context, filters: { ...context.filters, year: '2024', toYear: '2026' } };
    const tierHtml = renderToStaticMarkup(React.createElement(DashboardContext.Provider, { value: changedYearContext }, React.createElement(Tiers)));
    assert.ok(tierHtml.includes('Komposisi tier 2024'), 'a newly selected global tier year overrides an older comparison destination');
    const { default: DataStatus } = await server.ssrLoadModule('/src/pages/data-status/DataStatusPage.jsx');
    const unavailableContext = { ...context, data: undefined, status: { mode: 'sheets', connection: 'error', error: 'Kolom atau tab wajib tidak tersedia.', lastSuccessAt: null, lastAttemptAt: '2026-10-23T00:00:00.000Z', nextSyncAt: null, spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/example12345/edit', issues: [{ code: 'MISSING_HEADER', severity: 'error', tab: 'Data Sekolah', row: 1, column: 'ID Sekolah', message: 'Kolom wajib tidak ditemukan.' }] } };
    const unavailableHtml = renderToStaticMarkup(React.createElement(DashboardContext.Provider, { value: unavailableContext }, React.createElement(DataStatus)));
    assert.ok(unavailableHtml.includes('Belum ada dataset tervalidasi'));
    assert.ok(unavailableHtml.includes('Kolom wajib tidak ditemukan.'));
    assert.ok(unavailableHtml.includes('Tidak ada data demo'));
    assert.deepEqual(warnings, [], 'React rendering must not emit accessibility or markup warnings');
  } finally { console.error = originalError; await server.close(); }
});
