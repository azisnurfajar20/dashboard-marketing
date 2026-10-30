import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve('D:/marketing-dashboard');
const scratch = process.env.TMPDIR || tmpdir();
const secret = 'test-only-secret-with-at-least-48-characters-never-real';

async function makeApp(t, options = {}) {
  const [{ default: request }, { default: session }, { createApp }] = await Promise.all([
    import('supertest'), import('express-session'), import('../server/app.mjs'),
  ]);
  const directory = await mkdtemp(path.join(scratch, 'marketing-backend-'));
  const app = await createApp({
    env: { DATA_MODE: 'demo', NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '3001', SESSION_SECRET: secret },
    cacheDir: path.join(directory, 'cache'), sessionStore: new session.MemoryStore(), autoSync: false,
    ...options,
  });
  t.after(async () => { await app.locals.close?.(); await rm(directory, { recursive: true, force: true }); });
  const client = request.agent(app);
  return { app, directory, client, get: (url) => client.get(url).set('Host', '127.0.0.1:3001'), post: (url, value = {}) => client.post(url).set('Host', '127.0.0.1:3001').set('Origin', 'http://127.0.0.1:5173').send(value) };
}

test('public health and session expose no data while protected API denies anonymous access', async (t) => {
  const { get, post } = await makeApp(t);
  assert.deepEqual((await get('/api/health').expect(200)).body, { ok: true });
  assert.deepEqual((await get('/api/auth/session').expect(200)).body, { user: null, demoAvailable: true });
  await get('/api/data').expect(401);
  await post('/api/sync').expect(401);
  const unknown = await get('/api/unknown').expect(404);
  assert.match(unknown.headers['content-type'], /json/);
  assert.equal(JSON.stringify(unknown.body).includes('password'), false);
});

test('demo authentication rotates its httpOnly session and logout invalidates the old cookie', async (t) => {
  const { app, get, post } = await makeApp(t);
  const first = await post('/api/auth/demo').expect(200);
  assert.equal(first.body.user.id, 'demo-user');
  assert.match(first.body.user.name, /DEMO/);
  const cookie1 = first.headers['set-cookie'][0];
  assert.match(cookie1, /HttpOnly/i);
  assert.match(cookie1, /SameSite=Strict/i);
  assert.equal(/passwordHash|secret/i.test(JSON.stringify(first.body)), false);
  assert.equal((await get('/api/auth/session').expect(200)).body.user.id, 'demo-user');
  const second = await post('/api/auth/demo').expect(200);
  assert.notEqual(second.headers['set-cookie'][0].split(';')[0], cookie1.split(';')[0]);
  const { default: request } = await import('supertest');
  await request(app).get('/api/data').set('Host', '127.0.0.1:3001').set('Cookie', cookie1.split(';')[0]).expect(401);
  await post('/api/auth/logout').expect(200, { ok: true });
  assert.equal((await get('/api/auth/session')).body.user, null);
  await get('/api/data').expect(401);
});

test('host and same-origin JSON guards reject DNS rebinding, cross-site and malformed requests', async (t) => {
  const { app, get } = await makeApp(t);
  const { default: request } = await import('supertest');
  await request(app).get('/api/health').set('Host', 'attacker.example:3001').expect(403);
  await request(app).post('/api/auth/demo').set('Host', '127.0.0.1:3001').send({}).expect(403);
  await request(app).post('/api/auth/demo').set('Host', '127.0.0.1:3001').set('Origin', 'https://attacker.example').send({}).expect(403);
  await request(app).post('/API/auth/demo').set('Host', '127.0.0.1:3001').set('Origin', 'https://attacker.example').send({}).expect(403);
  await request(app).post('/Api/auth/logout').set('Host', '127.0.0.1:3001').set('Origin', 'https://attacker.example').send({}).expect(403);
  await request(app).post('/API/sync').set('Host', '127.0.0.1:3001').set('Origin', 'https://attacker.example').send({}).expect(403);
  await request(app).post('/api/auth/demo').set('Host', '127.0.0.1:3001').set('Origin', 'null').send({}).expect(403);
  await request(app).post('/api/auth/demo').set('Host', '127.0.0.1:3001').set('Origin', 'http://127.0.0.1:5173').set('Sec-Fetch-Site', 'cross-site').send({}).expect(403);
  await request(app).post('/api/auth/demo').set('Host', '127.0.0.1:5173').set('Origin', 'http://127.0.0.1:5173').send({}).expect(200);
  await request(app).post('/api/auth/demo').set('Host', '127.0.0.1:3001').set('Origin', 'http://127.0.0.1:5173').type('form').send({}).expect(415);
  const malformed = await request(app).post('/api/auth/demo').set('Host', '127.0.0.1:3001').set('Origin', 'http://127.0.0.1:5173').type('json').send('{sensitive-invalid-json').expect(400);
  assert.equal(JSON.stringify(malformed.body).includes('sensitive'), false);
  const response = await get('/api/health');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['x-frame-options'], 'DENY');
  assert.equal(response.headers['access-control-allow-origin'], undefined);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-powered-by'], undefined);
});

test('allowlisted login uses generic failures, rate limits and rechecks revoked users', async (t) => {
  const { hashPassword } = await import('../server/services/users.mjs');
  const directory = await mkdtemp(path.join(scratch, 'marketing-users-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const usersFile = path.join(directory, 'approved.json');
  const password = 'approved-fixture-password-123';
  await writeFile(usersFile, JSON.stringify([{ id: 'approved-1', name: 'Approved Fixture', email: 'approved@example.invalid', role: 'admin', passwordHash: await hashPassword(password) }]));
  const { post, get } = await makeApp(t, { env: { DATA_MODE: 'demo', NODE_ENV: 'test', SESSION_SECRET: secret, USERS_FILE: usersFile }, limits: { loginMax: 3 }, authDelayMs: 100 });
  const unknown = await post('/api/auth/login', { email: 'unknown@example.invalid', password }).expect(401);
  const wrong = await post('/api/auth/login', { email: 'approved@example.invalid', password: 'wrong-password' }).expect(401);
  assert.deepEqual(unknown.body, wrong.body);
  assert.equal(JSON.stringify(unknown.body).includes('unknown'), false);
  const loggedIn = await post('/api/auth/login', { email: 'APPROVED@example.invalid', password }).expect(200);
  assert.deepEqual(loggedIn.body.user, { id: 'approved-1', name: 'Approved Fixture', email: 'approved@example.invalid', role: 'admin' });
  const limited = await post('/api/auth/login', { email: 'approved@example.invalid', password }).expect(429);
  assert.ok(limited.headers['retry-after']);
  assert.equal((await get('/api/auth/session')).body.user.id, 'approved-1');
  await writeFile(usersFile, '[]');
  assert.equal((await get('/api/auth/session')).body.user, null);
  await get('/api/data').expect(401);
});

test('authenticated demo loads rich fictional workbook only on demand and refreshes protected data', async (t) => {
  const { get, post } = await makeApp(t);
  await post('/api/auth/demo').expect(200);
  const response = await get('/api/data').expect(200);
  assert.equal(response.body.status.mode, 'demo');
  assert.equal(response.body.status.connection, 'demo');
  assert.equal(response.body.status.spreadsheetUrl, null);
  assert.ok(response.body.status.lastSuccessAt);
  const data = response.body.data;
  assert.ok(data.schools.length >= 48 && data.schools.length <= 52);
  assert.equal(new Set(data.schools.map((s) => s.region)).size, 5);
  assert.ok(data.schools.every((s) => /DEMO/.test(s.name)));
  assert.ok(data.pics.length > data.schools.length);
  assert.ok(data.pics.every((p) => !p.whatsapp));
  assert.deepEqual(data.years, [2024, 2025, 2026]);
  assert.ok(data.visits.length > 100);
  assert.ok(data.issues.some((issue) => issue.code === 'INVALID_TIER'));
  assert.ok(data.issues.some((issue) => issue.code === 'DUPLICATE_VISIT_ID'));
  const { classifyFollowUp, jakartaToday } = await import('../shared/selectors.mjs');
  const categories = new Set(data.visits.map((visit) => classifyFollowUp(visit, jakartaToday())));
  for (const expected of ['today', 'overdue', 'upcoming', 'unscheduled', 'status-missing', 'completed', 'cancelled']) assert.ok(categories.has(expected), expected);
  assert.ok(data.visits.every((visit) => visit.date <= jakartaToday()));
  const refreshed = await post('/api/sync').expect(200);
  assert.equal(refreshed.body.status.error, null);
  assert.equal(refreshed.body.data.schools.length, data.schools.length);
});

test('built static assets are served without exposing server files or turning API errors into HTML', async (t) => {
  const directory = await mkdtemp(path.join(scratch, 'marketing-dist-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, 'assets'), { recursive: true });
  await writeFile(path.join(directory, 'index.html'), '<!doctype html><title>Fixture Dashboard</title>');
  await writeFile(path.join(directory, 'assets', 'app.js'), 'console.log("fixture")');
  await writeFile(path.join(directory, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  const { get } = await makeApp(t, { distDir: directory });
  assert.match((await get('/').expect(200)).text, /Fixture Dashboard/);
  await get('/assets/app.js').expect(200);
  await get('/favicon.svg').expect(200);
  await get('/assets/not-present.js').expect(404);
  await get('/server/config/users.json').expect(404);
  await get('/server/app.mjs').expect(404);
  await get('/.env').expect(404);
  const api = await get('/api/not-present').expect(404);
  assert.match(api.headers['content-type'], /json/);
  const { startServer } = await import('../server/index.mjs');
  assert.equal(typeof startServer, 'function');
});

test('live data fails without cache, never enables demo, and preserves last-good data across source and header failures', async (t) => {
  const { hashPassword } = await import('../server/services/users.mjs');
  const { createDemoWorkbook } = await import('../server/services/demo.mjs');
  let fail = true;
  let calls = 0;
  const workbook = createDemoWorkbook(new Date('2026-10-23T05:00:00Z'));
  const { post, get } = await makeApp(t, {
    env: { DATA_MODE: 'sheets', NODE_ENV: 'test', SESSION_SECRET: secret, GOOGLE_SPREADSHEET_ID: 'fixture-source-12345', GOOGLE_SERVICE_ACCOUNT_FILE: 'server/private/test-only.json' },
    users: [{ id: 'live-test', name: 'Live Fixture', email: 'fixture@example.invalid', role: 'coordinator', passwordHash: await hashPassword('live-fixture-password-123') }],
    workbookLoader: async () => { calls++; if (fail) throw new Error('PRIVATE_KEY credential +6281234567890'); return structuredClone(workbook); },
    limits: { syncMax: 20 },
  });
  assert.equal((await get('/api/auth/session')).body.demoAvailable, false);
  await post('/api/auth/demo').expect(403);
  await get('/api/data').expect(401);
  assert.equal(calls, 0);
  await post('/api/auth/login', { email: 'fixture@example.invalid', password: 'live-fixture-password-123' }).expect(200);
  const unavailable = await get('/api/data').expect(503);
  assert.equal(unavailable.body.data, null);
  assert.equal(unavailable.body.status.mode, 'sheets');
  assert.equal(/PRIVATE_KEY|credential|6281234567890/.test(JSON.stringify(unavailable.body)), false);
  const failedCalls = calls;
  await get('/api/data').expect(503);
  assert.equal(calls, failedCalls, 'failed initial reads should be cooled down, not hammer Sheets');
  fail = false;
  const first = await post('/api/sync').expect(200);
  const originalCount = first.body.data.schools.length;
  workbook['Data Sekolah'][1][1] = 'Controlled Source Changed';
  workbook['Data Tier Sekolah'][0].push('Tier 2031');
  for (const row of workbook['Data Tier Sekolah'].slice(1)) row.push('Tier 2');
  const changed = await post('/api/sync').expect(200);
  assert.equal(changed.body.data.schools[0].name, 'Controlled Source Changed');
  assert.ok(changed.body.data.years.includes(2031));
  fail = true;
  const stale = await post('/api/sync').expect(200);
  assert.equal(stale.body.status.connection, 'error');
  assert.equal(stale.body.status.lastSuccessAt, changed.body.status.lastSuccessAt);
  assert.equal(stale.body.data.schools.length, originalCount);
  assert.equal(stale.body.data.schools[0].name, 'Controlled Source Changed');
  fail = false;
  workbook['Data Sekolah'][0][1] = 'Removed mandatory name';
  const fatal = await post('/api/sync').expect(200);
  assert.equal(fatal.body.data.schools[0].name, 'Controlled Source Changed');
  assert.ok(fatal.body.status.issues.some((issue) => issue.code === 'MISSING_HEADER'));
  assert.equal(fatal.body.status.lastSuccessAt, changed.body.status.lastSuccessAt);
});

test('create-user accepts secret stdin, atomically writes scrypt allowlist and never prints passwords', async (t) => {
  const { addApprovedUser } = await import('../scripts/create-user.mjs');
  const directory = await mkdtemp(path.join(scratch, 'marketing-user-script-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'users.json');
  const password = 'fixture-stdin-password-not-a-real-account';
  const user = await addApprovedUser({ file, name: 'Fixture User', email: 'fixture@example.invalid', password, role: 'marketing' });
  assert.deepEqual(Object.keys(user).sort(), ['email', 'id', 'name', 'role']);
  const saved = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(saved.length, 1);
  assert.match(saved[0].passwordHash, /^scrypt\$/);
  assert.equal(JSON.stringify(saved).includes(password), false);
  await assert.rejects(addApprovedUser({ file, name: 'Duplicate', email: 'fixture@example.invalid', password, role: 'admin' }), /already|sudah/i);
  const { spawnSync } = await import('node:child_process');
  const run = spawnSync(process.execPath, ['scripts/create-user.mjs', '--name', 'Second Fixture', '--email', 'second@example.invalid', '--file', file], { cwd: root, input: `${password}\n`, encoding: 'utf8', timeout: 15000 });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(`${run.stdout}${run.stderr}`.includes(password), false);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).length, 2);
  const unsafe = spawnSync(process.execPath, ['scripts/create-user.mjs', '--password', 'never-use-this-flag'], { cwd: root, input: '', encoding: 'utf8', timeout: 5000 });
  assert.notEqual(unsafe.status, 0);
  assert.equal(`${unsafe.stdout}${unsafe.stderr}`.includes('never-use-this-flag'), false);
});

test('demo refuses forwarded remote clients and private config paths cannot be public build inputs', async (t) => {
  const { app } = await makeApp(t);
  const { default: request } = await import('supertest');
  const session = await request(app).get('/api/auth/session').set('Host', '127.0.0.1:3001').set('X-Forwarded-For', '203.0.113.9').expect(200);
  assert.equal(session.body.demoAvailable, false);
  await request(app).post('/api/auth/demo').set('Host', '127.0.0.1:3001').set('Origin', 'http://127.0.0.1:5173').set('X-Forwarded-For', '203.0.113.9').send({}).expect(403);
  const { readConfig } = await import('../server/config/env.mjs');
  for (const field of ['CACHE_DIR', 'SESSION_DIR', 'USERS_FILE']) {
    for (const folder of ['public', 'dist', 'src']) assert.throws(() => readConfig({ [field]: `${folder}/unsafe-private` }, root), /private|outside/i);
  }
});

test('live startup rejects missing or non-service-account credentials instead of silently initializing demo', async (t) => {
  const { createApp } = await import('../server/app.mjs');
  const { hashPassword } = await import('../server/services/users.mjs');
  const directory = await mkdtemp(path.join(scratch, 'marketing-live-config-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const credentials = path.join(directory, 'service-account.json');
  const options = {
    env: { DATA_MODE: 'sheets', NODE_ENV: 'test', SESSION_SECRET: secret, GOOGLE_SPREADSHEET_ID: 'fixture-source-12345', GOOGLE_SERVICE_ACCOUNT_FILE: credentials, CACHE_DIR: path.join(directory, 'cache'), SESSION_DIR: path.join(directory, 'sessions') },
    users: [{ id: 'test-live-config', name: 'Fixture', email: 'fixture@example.invalid', role: 'admin', passwordHash: await hashPassword('config-fixture-password-123') }],
    autoSync: false,
  };
  await assert.rejects(createApp(options), /service.account|credential/i);
  await writeFile(credentials, JSON.stringify({ type: 'external_account', executable: { command: 'not-permitted' } }));
  await assert.rejects(createApp(options), /service.account|credential/i);
});

test('file-backed sessions survive app restart, are signed, and production cookie requires HTTPS', async (t) => {
  const directory = await mkdtemp(path.join(scratch, 'marketing-session-files-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const env = { DATA_MODE: 'demo', NODE_ENV: 'test', SESSION_SECRET: secret, SESSION_DIR: path.join(directory, 'sessions') };
  const first = await makeApp(t, { env, sessionStore: undefined });
  const login = await first.post('/api/auth/demo').expect(200);
  const cookie = login.headers['set-cookie'][0].split(';')[0];
  assert.match(cookie, /s%3A/);
  await first.app.locals.close();
  const second = await makeApp(t, { env, sessionStore: undefined });
  const { default: request } = await import('supertest');
  const resumed = await request(second.app).get('/api/auth/session').set('Host', '127.0.0.1:3001').set('Cookie', cookie).expect(200);
  assert.equal(resumed.body.user.id, 'demo-user');
  const tampered = `${cookie.slice(0, -3)}bad`;
  await request(second.app).get('/api/data').set('Host', '127.0.0.1:3001').set('Cookie', tampered).expect(401);
  const { hashPassword } = await import('../server/services/users.mjs');
  const production = await makeApp(t, {
    env: { DATA_MODE: 'sheets', NODE_ENV: 'production', HOST: '127.0.0.1', APP_ORIGIN: 'https://dashboard.example.invalid', TRUST_PROXY: 'loopback', SESSION_SECRET: secret, GOOGLE_SPREADSHEET_ID: 'fixture-production-id', GOOGLE_SERVICE_ACCOUNT_FILE: 'server/private/unused-test.json' },
    users: [{ id: 'prod-fixture', name: 'Production Fixture', email: 'prod@example.invalid', role: 'admin', passwordHash: await hashPassword('production-fixture-password') }],
    workbookLoader: async () => { throw new Error('not-used'); },
  });
  const secure = await request(production.app).post('/api/auth/login').set('Host', 'dashboard.example.invalid').set('Origin', 'https://dashboard.example.invalid').set('X-Forwarded-Proto', 'https').send({ email: 'prod@example.invalid', password: 'production-fixture-password' }).expect(200);
  const productionCookie = secure.headers['set-cookie'][0];
  assert.match(productionCookie, /^__Host-marketing.sid=/);
  assert.match(productionCookie, /; Secure/);
  assert.match(productionCookie, /; HttpOnly/);
  assert.match(productionCookie, /; SameSite=Strict/);
  assert.ok(secure.headers['strict-transport-security']);
  await request(production.app).post('/api/auth/demo').set('Host', 'dashboard.example.invalid').set('Origin', 'http://127.0.0.1:5173').send({}).expect(403);
});

test('create-user rejects symlinks into public build inputs before writing an allowlist', async (t) => {
  const { addApprovedUser } = await import('../scripts/create-user.mjs');
  const { symlink } = await import('node:fs/promises');
  const directory = await mkdtemp(path.join(scratch, 'marketing-private-boundary-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const publicDir = path.join(directory, 'public');
  await mkdir(publicDir);
  const alias = path.join(directory, 'private-alias');
  await symlink(publicDir, alias, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(addApprovedUser({ root: directory, file: path.join(alias, 'users.json'), name: 'Fixture', email: 'fixture@example.invalid', role: 'marketing', password: 'private-boundary-fixture-password' }), /private|outside/i);
});

// Each behavior was added and executed RED before its implementation.
test('approved users use salted scrypt and reject bad passwords without exposing hashes', async () => {
  const { hashPassword, verifyPassword, validateUser, publicUser } = await import('../server/services/users.mjs');
  const password = 'test-fixture-password-not-used-outside-tests';
  const one = await hashPassword(password);
  const two = await hashPassword(password);
  assert.notEqual(one, two);
  assert.match(one, /^scrypt\$/);
  assert.equal(await verifyPassword(password, one), true);
  assert.equal(await verifyPassword('incorrect-password', one), false);
  assert.equal(await verifyPassword(password, 'scrypt$9999999999$8$1$bad$bad'), false);
  await assert.rejects(hashPassword('short'), /12/);
  const user = validateUser({ id: 'u-1', name: 'Approved Test User', email: 'APPROVED@example.invalid', role: 'marketing', passwordHash: one });
  assert.equal(user.email, 'approved@example.invalid');
  assert.deepEqual(Object.keys(publicUser(user)).sort(), ['email', 'id', 'name', 'role']);
  assert.throws(() => validateUser({ ...user, passwordHash: password }), /passwordHash/);
});
test('configuration fails closed for public/production demo and incomplete live mode', async () => {
  const { readConfig } = await import('../server/config/env.mjs');
  assert.equal(readConfig({}, root).mode, 'demo');
  assert.throws(() => readConfig({ DATA_MODE: 'demo', NODE_ENV: 'production' }, root), /demo/i);
  assert.throws(() => readConfig({ DATA_MODE: 'demo', HOST: '0.0.0.0' }, root), /loopback/i);
  assert.throws(() => readConfig({ DATA_MODE: 'sheets' }, root), /SESSION_SECRET/);
  assert.throws(() => readConfig({ DATA_MODE: 'mystery' }, root), /DATA_MODE/);
  assert.throws(() => readConfig({ NODE_ENV: 'production' }, root), /DATA_MODE/);
});
