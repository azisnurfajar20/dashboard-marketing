import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { createServer as createHttpServer } from 'node:http';
import { chromium } from 'playwright';

const root = new URL('../', import.meta.url);
let server;
let httpServer;
let browser;
let origin;
before(async () => {
  server = await createServer({ configFile: false, root: fileURLToPath(root), plugins: [react()], server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'react/jsx-dev-runtime'] } });
  httpServer = createHttpServer((request, response) => {
    if (request.url === '/') {
      server.transformIndexHtml('/', '<!doctype html><html lang="id"><head><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>').then(html => { response.setHeader('Content-Type', 'text/html'); response.end(html); }).catch(error => { response.statusCode = 500; response.end(error.message); });
    } else server.middlewares(request, response, () => { response.statusCode = 404; response.end(); });
  });
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${httpServer.address().port}`;
});
after(async () => {
  try { await browser?.close(); }
  finally { await server?.close(); if (httpServer) await new Promise(resolve => { httpServer.close(resolve); httpServer.closeAllConnections(); }); }
});

const approvedUser = { id: 'account-frontend-fixture', name: 'Tim Uji', email: 'uji@example.test', role: 'coordinator' };
const unavailable = { error: 'SHEETS_UNAVAILABLE', message: 'Sumber belum tersedia.', status: { mode: 'sheets', connection: 'error', issues: [], lastSuccessAt: null } };
const fulfillJson = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
async function openApp(t, { user = approvedUser, handlers = {}, viewport = { width: 1280, height: 1000 } } = {}) {
  browser ||= await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport });
  t.after(() => context.close());
  const page = await context.newPage();
  const requests = [];
  await context.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith('/api/')) return route.continue();
    requests.push(path);
    if (handlers[path]) return handlers[path](route);
    if (path === '/api/auth/session') return fulfillJson(route, { user, demoAvailable: true });
    if (path === '/api/data' || path === '/api/sync') return fulfillJson(route, unavailable, 503);
    return fulfillJson(route, { message: 'Permintaan fixture tidak diizinkan.' }, 400);
  });
  await page.goto(`${origin}/#/account`, { waitUntil: 'domcontentloaded' });
  return { page, requests, context };
}
async function renderWithContext(path, context = {}, props = {}) {
  const [{ DashboardContext }, { default: Component }] = await Promise.all([
    server.ssrLoadModule('/src/context/DashboardContext.jsx'), server.ssrLoadModule(path),
  ]);
  const warnings = [];
  const originalError = console.error;
  console.error = (...args) => warnings.push(args.map(String).join(' '));
  try {
    const html = renderToStaticMarkup(React.createElement(DashboardContext.Provider, { value: { user: approvedUser, filters: {}, href: page => `#/${page}`, ...context } }, React.createElement(Component, props)));
    assert.deepEqual(warnings, [], 'real React rendering emits no markup or accessibility warnings');
    return html;
  } finally { console.error = originalError; }
}

test('account update sends only the explicit same-origin JSON credentials', async () => {
  const { createApiClient } = await import('../src/services/api/client.js');
  const calls = [];
  const response = { ok: true, reauthenticate: true, message: 'Akun berhasil diperbarui. Silakan masuk kembali.' };
  const api = createApiClient(async (url, options) => { calls.push({ url, options }); return { ok: true, status: 200, json: async () => response }; });
  const payload = { email: 'baru@example.test', currentPassword: 'fixture-current-only', newPassword: '', confirmPassword: '' };
  assert.deepEqual(await api.updateAccount(payload), response);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/auth/account');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.credentials, 'same-origin');
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.deepEqual(JSON.parse(calls[0].options.body), payload);
});

test('account API preserves safe server messages and identifies session expiry', async () => {
  const { createApiClient } = await import('../src/services/api/client.js');
  for (const [status, message] of [[400, 'Email tidak valid.'], [403, 'Kata sandi saat ini tidak sesuai.'], [409, 'Email tidak dapat digunakan.'], [429, 'Terlalu banyak percobaan. Coba lagi nanti.'], [401, 'Sesi berakhir.']]) {
    const api = createApiClient(async () => ({ ok: false, status, json: async () => ({ error: 'ACCOUNT_UPDATE_FAILED', message }) }));
    await assert.rejects(api.updateAccount({ email: approvedUser.email, currentPassword: '', newPassword: '', confirmPassword: '' }), error => error.message === message && error.status === status && error.code === (status === 401 ? 'AUTH_REQUIRED' : 'ACCOUNT_UPDATE_FAILED'));
  }
});

test('approved account renders accessible login fields without any dataset', async () => {
  const html = await renderWithContext('/src/pages/account/AccountPage.jsx', { data: undefined, status: { mode: 'demo', connection: 'error' } });
  assert.match(html, /data-testid="page-account"/);
  for (const [id, label] of [['account-email', 'Email login'], ['account-current-password', 'Kata sandi saat ini'], ['account-new-password', 'Kata sandi baru'], ['account-confirm-password', 'Konfirmasi kata sandi baru']]) {
    assert.ok(html.includes(`<label class="form-label" for="${id}">${label}</label>`), `exact accessible label: ${label}`);
    assert.match(html, new RegExp(`<input[^>]*id="${id}"`));
  }
  const input = id => html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))[0];
  assert.match(input('account-email'), /type="email"/);
  assert.match(input('account-email'), /value="uji@example.test"/);
  assert.match(input('account-email'), /maxLength="254"/);
  assert.match(input('account-email'), /autoComplete="username"/);
  assert.match(input('account-email'), /required/);
  assert.match(input('account-current-password'), /required/);
  assert.match(input('account-current-password'), /autoComplete="current-password"/);
  for (const id of ['account-new-password', 'account-confirm-password']) {
    assert.match(input(id), /autoComplete="new-password"/);
    assert.doesNotMatch(input(id), /required/);
  }
  assert.match(input('account-new-password'), /minLength="12"/);
  assert.match(input('account-new-password'), /maxLength="256"/);
  assert.match(html, /12–256 karakter/);
  assert.match(html, /Kosongkan jika tidak ingin mengubah kata sandi/);
  assert.match(html, /Simpan perubahan/);
  assert.match(html, /login dashboard/i);
  assert.match(html, /akun Google|izin Google Sheets/i);
  assert.match(html, /login-awal.*tidak.*otomatis/i);
  for (const id of ['account-current-password', 'account-new-password', 'account-confirm-password']) {
    assert.match(html, new RegExp(`<button[^>]*type="button"[^>]*aria-controls="${id}"[^>]*aria-pressed="false"`));
  }
});

test('built-in demo identity gets a read-only account explanation even without source status', async () => {
  const html = await renderWithContext('/src/pages/account/AccountPage.jsx', { user: { id: 'demo-user', email: 'demo@example.invalid', name: 'Pengguna Demo' }, data: undefined, status: undefined });
  assert.match(html, /data-testid="page-account"/);
  assert.match(html, /Akun demo bersifat hanya-baca/);
  assert.match(html, /akun yang disetujui admin/);
  assert.doesNotMatch(html, /<form|<input|Simpan perubahan/);
});

test('account validation requires the current password and prevents an unchanged submission', async () => {
  const { validateAccountUpdate } = await import('../src/utils/account.mjs');
  const unchanged = { email: ' UJI@EXAMPLE.TEST ', currentPassword: 'fixture-current-only', newPassword: '', confirmPassword: '' };
  assert.deepEqual(validateAccountUpdate(unchanged, approvedUser.email), { form: 'Ubah email atau isi kata sandi baru sebelum menyimpan.' });
  assert.deepEqual(validateAccountUpdate({ ...unchanged, email: 'baru@example.test', currentPassword: '' }, approvedUser.email), { currentPassword: 'Masukkan kata sandi saat ini.' });
  assert.deepEqual(validateAccountUpdate({ ...unchanged, email: 'baru@example.test' }, approvedUser.email), {});
});

test('account validation bounds email and optional new-password confirmation without echoing values', async () => {
  const { validateAccountUpdate } = await import('../src/utils/account.mjs');
  const valid = { email: 'baru@example.test', currentPassword: 'fixture-current-only', newPassword: '', confirmPassword: '' };
  for (const email of ['', 'not-email', 'name@domain', 'name@@example.test', 'white space@example.test', `${'a'.repeat(243)}@example.test`]) {
    assert.ok(validateAccountUpdate({ ...valid, email }, approvedUser.email).email, 'invalid or oversized email is rejected');
  }
  assert.deepEqual(validateAccountUpdate({ ...valid, email: `${'a'.repeat(241)}@example.test` }, approvedUser.email), {}, '254-character email is accepted');
  assert.ok(validateAccountUpdate({ ...valid, currentPassword: 'a'.repeat(257) }, approvedUser.email).currentPassword);
  for (const length of [1, 11, 257]) {
    const secret = 'a'.repeat(length);
    const errors = validateAccountUpdate({ ...valid, newPassword: secret, confirmPassword: secret }, approvedUser.email);
    assert.equal(errors.newPassword, 'Kata sandi baru harus 12–256 karakter.');
  }
  for (const length of [12, 256]) {
    const secret = 'a'.repeat(length);
    assert.deepEqual(validateAccountUpdate({ ...valid, newPassword: secret, confirmPassword: secret }, approvedUser.email), {});
  }
  assert.equal(validateAccountUpdate({ ...valid, newPassword: 'fixture-new-only', confirmPassword: 'fixture-other-only' }, approvedUser.email).confirmPassword, 'Konfirmasi kata sandi baru harus sama.');
  assert.equal(validateAccountUpdate({ ...valid, confirmPassword: 'fixture-only-confirmation' }, approvedUser.email).confirmPassword, 'Isi kata sandi baru sebelum mengonfirmasi.');
});

test('account hash route has an active link under management navigation', async () => {
  const { parseRoute, routeHref } = await import('../src/utils/routes.mjs');
  assert.deepEqual(parseRoute('#/account'), { page: 'account', filters: {} });
  assert.equal(routeHref('account'), '#/account');
  const html = await renderWithContext('/src/components/layout/AppLayout.jsx', {}, { page: 'account', user: approvedUser });
  assert.match(html, /PENGELOLAAN/);
  assert.match(html, /<a[^>]*href="#\/account"[^>]*aria-current="page"[^>]*>.*?Pengaturan akun/s);
});

test('account form validates locally, announces errors and focuses the invalid field', async t => {
  const { page, requests } = await openApp(t);
  await page.getByLabel('Email login', { exact: true }).fill('baru@example.test');
  await page.getByRole('button', { name: 'Simpan perubahan', exact: true }).click();
  const alert = page.getByRole('alert');
  await alert.waitFor({ state: 'visible', timeout: 5000 });
  assert.match(await alert.innerText(), /Masukkan kata sandi saat ini/);
  const current = page.getByLabel('Kata sandi saat ini', { exact: true });
  assert.equal(await current.getAttribute('aria-invalid'), 'true');
  assert.ok((await current.getAttribute('aria-describedby')).includes('account-current-password-error'));
  assert.equal(await current.evaluate(input => input === document.activeElement), true);
  await current.fill('fixture-current-only');
  await page.getByLabel('Email login', { exact: true }).fill(approvedUser.email);
  await page.getByRole('button', { name: 'Simpan perubahan', exact: true }).click();
  await page.getByText('Ubah email atau isi kata sandi baru sebelum menyimpan.', { exact: true }).waitFor();
  assert.equal(await alert.evaluate(element => element === document.activeElement), true);
  assert.equal(requests.filter(path => path === '/api/auth/account').length, 0);
  assert.equal(new URL(page.url()).hash, '#/account');
});

test('an account save cannot start while logout is already awaiting a response', async t => {
  let held;
  let notifyStarted;
  const started = new Promise(resolve => { notifyStarted = resolve; });
  let activeUser = approvedUser;
  let accountRequests = 0;
  const { page } = await openApp(t, { handlers: {
    '/api/auth/session': route => fulfillJson(route, { user: activeUser, demoAvailable: false }),
    '/api/auth/logout': route => { held = route; notifyStarted(); },
    '/api/auth/account': route => { accountRequests++; return fulfillJson(route, { ok: true, reauthenticate: true }); },
  } });
  await page.getByLabel('Email login', { exact: true }).fill('pending@example.test');
  await page.getByLabel('Kata sandi saat ini', { exact: true }).fill('fixture-current-only');
  await page.getByRole('button', { name: 'Keluar', exact: true }).click();
  await started;
  try {
    await page.getByRole('button', { name: 'Simpan perubahan', exact: true }).click();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(accountRequests, 0, 'logout and account changes must be mutually exclusive');
  } finally { activeUser = null; await fulfillJson(held, { ok: true }); }
});

test('logout is disabled until the account-update response has completed', async t => {
  let held;
  let notifyStarted;
  const started = new Promise(resolve => { notifyStarted = resolve; });
  const { page } = await openApp(t, { handlers: {
    '/api/auth/account': route => { held = route; notifyStarted(); },
  } });
  await page.getByLabel('Email login', { exact: true }).fill('pending@example.test');
  await page.getByLabel('Kata sandi saat ini', { exact: true }).fill('fixture-current-only');
  await page.getByRole('button', { name: 'Simpan perubahan', exact: true }).click();
  await started;
  try {
    assert.equal(await page.getByRole('button', { name: 'Keluar', exact: true }).isDisabled(), true);
  } finally {
    await fulfillJson(held, { ok: true, reauthenticate: true });
  }
});

for (const responseStatus of [200, 401]) {
test(`a late account update cannot reset a newer authentication state after session expiry (${responseStatus})`, async t => {
  let held;
  let notifyStarted;
  const started = new Promise(resolve => { notifyStarted = resolve; });
  let expiring = false;
  let activeUser = approvedUser;
  let loginCalls = 0;
  const { page } = await openApp(t, { handlers: {
    '/api/auth/session': route => fulfillJson(route, { user: activeUser, demoAvailable: false }),
    '/api/auth/account': route => { held = route; notifyStarted(); },
    '/api/data': route => fulfillJson(route, expiring ? { message: 'Sesi fixture berakhir.' } : unavailable, expiring ? 401 : 503),
    '/api/auth/login': route => { loginCalls++; activeUser = { ...approvedUser, email: 'next@example.test' }; return fulfillJson(route, { user: activeUser }); },
  } });
  await page.getByLabel('Email login', { exact: true }).fill('pending@example.test');
  await page.getByLabel('Kata sandi saat ini', { exact: true }).fill('fixture-current-only');
  await page.getByRole('button', { name: 'Simpan perubahan', exact: true }).click();
  await started;
  expiring = true;
  await page.locator('#app-sidebar').getByRole('link', { name: 'Data sekolah', exact: true }).click();
  await page.getByRole('button', { name: 'Coba muat lagi', exact: true }).click();
  await page.getByRole('button', { name: 'Masuk ke ruang kerja', exact: true }).waitFor();
  try {
    assert.equal(await page.getByRole('button', { name: 'Masuk ke ruang kerja', exact: true }).isDisabled(), true);
    await page.locator('form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(loginCalls, 0, 'new login cannot race a response that still changes authentication cookies');
  } finally { await fulfillJson(held, responseStatus === 200 ? { ok: true, reauthenticate: true } : { message: 'Sesi fixture berakhir.' }, responseStatus); }
  await page.getByRole('button', { name: 'Masuk ke ruang kerja', exact: true }).waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('button.login-submit').disabled);
  assert.equal(await page.getByText('Akun berhasil diperbarui. Silakan masuk kembali.', { exact: true }).count(), 0, 'stale success must not overwrite newer login state');
  assert.equal(await page.getByLabel('Email kerja', { exact: true }).inputValue(), '');
});
}

test('successful account save clears access and returns to login with the updated email', async t => {
  let activeUser = approvedUser;
  let submitted;
  const { page } = await openApp(t, { handlers: {
    '/api/auth/session': route => fulfillJson(route, { user: activeUser, demoAvailable: false }),
    '/api/auth/account': route => {
      submitted = route.request().postDataJSON(); activeUser = null;
      return fulfillJson(route, { ok: true, reauthenticate: true, message: 'Akun berhasil diperbarui. Silakan masuk kembali.' });
    },
  } });
  await page.getByLabel('Email login', { exact: true }).fill('changed@example.test');
  await page.getByLabel('Kata sandi saat ini', { exact: true }).fill('fixture-current-only');
  await page.getByRole('button', { name: 'Simpan perubahan', exact: true }).click();
  await page.getByRole('button', { name: 'Masuk ke ruang kerja', exact: true }).waitFor({ timeout: 5000 });
  assert.deepEqual(submitted, { email: 'changed@example.test', currentPassword: 'fixture-current-only', newPassword: '', confirmPassword: '' });
  assert.equal(await page.getByLabel('Email kerja', { exact: true }).inputValue(), 'changed@example.test');
  assert.equal(await page.getByLabel('Kata sandi', { exact: true }).inputValue(), '');
  assert.equal(await page.getByText('Akun berhasil diperbarui. Silakan masuk kembali.', { exact: true }).isVisible(), true);
  assert.equal(new URL(page.url()).hash, '#/login');
  assert.equal(await page.getByTestId('page-account').count(), 0);
});

test('an older authenticated data response cannot repopulate the next login after an account change', async t => {
  const [{ normalizeWorkbook }, { createDemoWorkbook }] = await Promise.all([import('../shared/data.mjs'), import('../server/services/demo.mjs')]);
  const staleData = normalizeWorkbook(createDemoWorkbook(new Date('2026-10-23T08:00:00Z')));
  let activeUser = approvedUser;
  let holdOldRequests = true;
  const pending = [];
  const { page } = await openApp(t, { handlers: {
    '/api/auth/session': route => fulfillJson(route, { user: activeUser, demoAvailable: false }),
    '/api/data': route => { if (holdOldRequests) { pending.push(route); return; } return fulfillJson(route, unavailable, 503); },
    '/api/auth/account': route => { activeUser = null; holdOldRequests = false; return fulfillJson(route, { ok: true, reauthenticate: true }); },
    '/api/auth/login': route => { activeUser = { ...approvedUser, email: 'fresh@example.test' }; return fulfillJson(route, { user: activeUser }); },
  } });
  await page.getByLabel('Email login', { exact: true }).fill('fresh@example.test');
  await page.getByLabel('Kata sandi saat ini', { exact: true }).fill('fixture-current-only');
  assert.ok(pending.length > 0);
  await page.getByRole('button', { name: 'Simpan perubahan', exact: true }).click();
  await page.getByLabel('Kata sandi', { exact: true }).fill('fixture-current-only');
  await page.getByRole('button', { name: 'Masuk ke ruang kerja', exact: true }).click();
  await page.getByRole('heading', { name: 'Data belum tersedia', exact: true }).waitFor();
  for (const route of pending) {
    await fulfillJson(route, { data: staleData, status: { mode: 'sheets', connection: 'connected', issues: [] } });
    await (await route.request().response()).finished();
  }
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.getByTestId('page-dashboard').count(), 0, 'prior-login dataset must not become the new login dataset');
  assert.equal(await page.getByRole('heading', { name: 'Data belum tersedia', exact: true }).isVisible(), true);
});

test('App account route remains usable while the Sheets dataset is absent', async t => {
  const { page, requests } = await openApp(t);
  await page.getByTestId('page-account').waitFor({ state: 'visible', timeout: 8000 }).catch(async error => { throw new Error(`${error.message}\nRequests: ${requests.join(', ')}\nRendered text: ${await page.locator('body').innerText()}`); });
  assert.equal(await page.getByLabel('Email login', { exact: true }).inputValue(), approvedUser.email);
  assert.equal(await page.getByRole('button', { name: 'Simpan perubahan', exact: true }).isEnabled(), true);
  assert.ok(requests.includes('/api/data'), 'source loading was attempted but its failure does not hide account settings');
  assert.equal(new URL(page.url()).hash, '#/account');
});
