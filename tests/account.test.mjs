import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, stat } from 'node:fs/promises';
import request from 'supertest';
import session from 'express-session';
import { createApp } from '../server/app.mjs';
import { hashPassword, verifyPassword } from '../server/services/users.mjs';

const scratch = process.env.TMPDIR;
assert.ok(scratch && path.isAbsolute(scratch), 'Account tests require an absolute process.env.TMPDIR.');
const CURRENT = 'account-fixture-current-passphrase-123';
const NEXT = '  account fixture NEW passphrase 456  ';
const EMAIL = 'owner@example.invalid';
const SUCCESS = { ok: true, reauthenticate: true, message: 'Akun berhasil diperbarui. Silakan masuk kembali.' };
const fixtureHash = hashPassword(CURRENT);

async function fixture(t, options = {}) {
  await mkdir(scratch, { recursive: true });
  const directory = await mkdtemp(path.join(scratch, 'marketing-account-'));
  const usersFile = path.join(directory, 'users.json');
  const users = [
    { id: 'owner-fixture', name: 'Owner Fixture', email: EMAIL, role: 'marketing', passwordHash: await fixtureHash },
    { id: 'other-fixture', name: 'Other Fixture', email: 'other@example.invalid', role: 'admin', passwordHash: await fixtureHash },
  ];
  await writeFile(usersFile, `${JSON.stringify(users, null, 2)}\n`, { mode: 0o600 });
  let app;
  t.after(async () => { await app?.locals.close(); await rm(directory, { recursive: true, force: true }); });
  app = await createApp({
    env: { DATA_MODE: 'demo', NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '3001',
      SESSION_SECRET: 'account-tests-only-secret-at-least-48-characters-never-real', USERS_FILE: usersFile,
      SESSION_DIR: path.join(directory, 'sessions'), CACHE_DIR: path.join(directory, 'cache') },
    sessionStore: new session.MemoryStore(), autoSync: false, authDelayMs: 0,
    limits: { loginMax: 1000, accountMax: 1000 },
    ...options,
  });
  const post = (url, body = {}, cookie = '') => request(app).post(url).set('Host', '127.0.0.1:3001')
    .set('Origin', 'http://127.0.0.1:5173').set('Cookie', cookie).send(body);
  const get = (url, cookie = '') => request(app).get(url).set('Host', '127.0.0.1:3001').set('Cookie', cookie);
  const login = async (email = EMAIL, password = CURRENT) => {
    const response = await post('/api/auth/login', { email, password }).expect(200);
    return response.headers['set-cookie'][0].split(';')[0];
  };
  const account = (cookie, body) => post('/api/auth/account', body, cookie);
  const saved = async () => JSON.parse(await readFile(usersFile, 'utf8'));
  return { app, directory, usersFile, users, post, get, login, account, saved };
}

test('password-only updates ignore forged identity and role fields', async (t) => {
  const f = await fixture(t);
  const cookie = await f.login();
  await f.account(cookie, { email: EMAIL, currentPassword: CURRENT, newPassword: NEXT, confirmPassword: NEXT,
    id: f.users[1].id, role: 'admin', name: 'Forged Name' }).expect(200, SUCCESS);
  const saved = await f.saved();
  assert.equal(saved[0].id, f.users[0].id);
  assert.equal(saved[0].role, 'marketing');
  assert.equal(saved[0].name, f.users[0].name);
  assert.equal(await verifyPassword(NEXT, saved[0].passwordHash), true);
  assert.deepEqual(saved[1], f.users[1]);
  await f.login(EMAIL, NEXT);
});

test('account mutation keeps the existing origin, JSON and host protections', async (t) => {
  const f = await fixture(t);
  const cookie = await f.login();
  const before = await readFile(f.usersFile, 'utf8');
  const body = { email: 'blocked@example.invalid', currentPassword: CURRENT };
  await f.account(cookie, body).set('Origin', 'https://attacker.invalid').expect(403);
  await f.account(cookie, body).set('Host', 'attacker.invalid').expect(403);
  await request(f.app).post('/api/auth/account').set('Host', '127.0.0.1:3001').set('Cookie', cookie)
    .set('Origin', 'http://127.0.0.1:5173').type('form').send(body).expect(415);
  assert.equal(await readFile(f.usersFile, 'utf8'), before);
});

test('the account limit follows authenticated identity across different client addresses', async (t) => {
  const f = await fixture(t, { limits: { loginMax: 100, accountMax: 2 } });
  f.app.set('trust proxy', 'loopback');
  const cookie = await f.login();
  for (const address of ['192.0.2.1', '192.0.2.2']) {
    await f.account(cookie, { email: 'blocked@example.invalid', currentPassword: 'incorrect-fixture-password' }).set('X-Forwarded-For', address).expect(400);
  }
  await f.account(cookie, { email: 'blocked@example.invalid', currentPassword: CURRENT }).set('X-Forwarded-For', '192.0.2.3').expect(429);
});

test('service errors and stale fingerprints fail safely and release their writer lock', async (t) => {
  const { updateAccount, AccountError } = await import('../server/services/account.mjs');
  const f = await fixture(t);
  const before = await readFile(f.usersFile, 'utf8');
  await assert.rejects(updateAccount({ file: f.usersFile, id: f.users[0].id, expectedFingerprint: 'stale-fixture',
    email: 'stale@example.invalid', currentPassword: CURRENT }), error => error instanceof AccountError && error.status === 401);
  await assert.rejects(updateAccount({ file: f.directory, id: f.users[0].id, expectedFingerprint: 'stale-fixture',
    email: 'safe@example.invalid', currentPassword: CURRENT }), error => error instanceof AccountError && error.status === 503 && !error.message.includes(f.directory));
  assert.equal(await readFile(f.usersFile, 'utf8'), before);
  assert.deepEqual((await readdir(f.directory)).sort(), ['cache', 'users.json']);
});

test('a committed change still reports success when session-store cleanup fails', async (t) => {
  class FailingDestroyStore extends session.MemoryStore {
    destroy(sid, callback) {
      if (this.failDestroy) return callback(new Error('fixture-private-store-error'));
      return super.destroy(sid, callback);
    }
  }
  const store = new FailingDestroyStore();
  const f = await fixture(t, { sessionStore: store });
  const cookie = await f.login();
  store.failDestroy = true;
  const response = await f.account(cookie, { email: 'committed@example.invalid', currentPassword: CURRENT }).expect(200, SUCCESS);
  assert.match(response.headers['set-cookie'][0], /^marketing\.sid=;/);
  assert.equal((await f.saved())[0].email, 'committed@example.invalid');
  await f.get('/api/data', cookie).expect(401);
  store.failDestroy = false;
  await f.login('committed@example.invalid');
});

test('account changes have independent per-account attempt limits without consuming login limits', async (t) => {
  const f = await fixture(t, { limits: { loginMax: 100, accountMax: 2 } });
  const cookie = await f.login();
  const before = await readFile(f.usersFile, 'utf8');
  for (let index = 0; index < 2; index++) {
    await f.account(cookie, { email: `attempt-${index}@example.invalid`, currentPassword: 'wrong-fixture-password' }).expect(400);
  }
  const limited = await f.account(cookie, { email: 'third@example.invalid', currentPassword: CURRENT }).expect(429);
  assert.ok(limited.headers['retry-after']);
  assert.equal(typeof limited.body.message, 'string');
  assert.equal(await readFile(f.usersFile, 'utf8'), before);
  await f.login();
});

test('concurrent account updates cannot both commit against the same credentials', async (t) => {
  const f = await fixture(t);
  const cookies = [await f.login(), await f.login()];
  const results = await Promise.all(cookies.map((cookie, index) => f.account(cookie, {
    email: `concurrent-${index}@example.invalid`, currentPassword: CURRENT,
  })));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  const winner = results.findIndex(result => result.status === 200);
  assert.equal((await f.saved())[0].email, `concurrent-${winner}@example.invalid`);
  assert.deepEqual((await readdir(f.directory)).sort(), ['cache', 'users.json']);
});

// Vertical slice 10: a normalized same-email request with no password change is not an update.
test('same-email no-op with absent or empty new password is rejected without rotating credentials', async (t) => {
  const f = await fixture(t);
  const cookie = await f.login();
  const before = await readFile(f.usersFile, 'utf8');
  for (const fields of [{}, { newPassword: '' }]) {
    const response = await f.account(cookie, { email: '  OWNER@EXAMPLE.INVALID ', currentPassword: CURRENT, ...fields }).expect(400);
    assert.equal(response.body.message, 'Tidak ada perubahan akun.');
    assert.equal(await readFile(f.usersFile, 'utf8'), before);
    assert.equal((await f.get('/api/auth/session', cookie)).body.user.id, f.users[0].id);
  }
});

// Vertical slice 9: normalized email uniqueness is enforced against every other account.
test('duplicate normalized email is rejected after current-password verification without writes', async (t) => {
  const f = await fixture(t);
  const cookie = await f.login();
  const before = await readFile(f.usersFile, 'utf8');
  const body = { email: '  OTHER@EXAMPLE.INVALID ', currentPassword: 'wrong-fixture-passphrase' };
  await f.account(cookie, body).expect(400);
  const response = await f.account(cookie, { ...body, currentPassword: CURRENT }).expect(409);
  assert.equal(response.body.message, 'Alamat email tidak dapat digunakan.');
  assert.equal(await readFile(f.usersFile, 'utf8'), before);
  assert.equal((await f.get('/api/auth/session', cookie)).body.user.id, f.users[0].id);
});

// Vertical slice 8: confirmation is mandatory and exact for a supplied password.
test('missing or mismatched confirmation cannot write a supplied new password', async (t) => {
  const f = await fixture(t);
  const cookie = await f.login();
  const before = await readFile(f.usersFile, 'utf8');
  for (const confirmPassword of ['different-fixture-passphrase', undefined, '', null, {}, NEXT.trim()]) {
    const response = await f.account(cookie, { email: EMAIL, currentPassword: CURRENT,
      newPassword: NEXT, confirmPassword }).expect(400);
    assert.equal(response.body.message, 'Konfirmasi kata sandi baru tidak cocok.');
    assert.equal(await readFile(f.usersFile, 'utf8'), before);
  }
});

// Vertical slice 7: supplied passwords must fit the supported hash input contract.
test('malformed or weak new passwords return safe validation errors without writes', async (t) => {
  const f = await fixture(t);
  const cookie = await f.login();
  const before = await readFile(f.usersFile, 'utf8');
  for (const newPassword of ['short', 'x'.repeat(257), `valid-length\u0000fixture`, null, 12345, true, {}, []]) {
    const response = await f.account(cookie, { email: 'valid@example.invalid', currentPassword: CURRENT,
      newPassword, confirmPassword: newPassword }).expect(400);
    assert.equal(response.body.message, 'Kata sandi baru harus berisi 12–256 karakter.');
    assert.equal(await readFile(f.usersFile, 'utf8'), before);
  }
});

// Vertical slice 6: account email is required and validated before writing.
test('missing or malformed email returns safe validation errors without writes', async (t) => {
  const f = await fixture(t);
  const cookie = await f.login();
  const before = await readFile(f.usersFile, 'utf8');
  for (const email of ['not-an-email', undefined, '', '   ', null, 12, {}, 'a@b', 'a@@example.invalid',
    'bad\n@example.invalid', 'bad\u0000@example.invalid', `${'x'.repeat(240)}@example.invalid`]) {
    const response = await f.account(cookie, { email, currentPassword: CURRENT, newPassword: NEXT, confirmPassword: NEXT }).expect(400);
    assert.equal(response.body.message, 'Masukkan alamat email yang valid.');
    assert.equal(await readFile(f.usersFile, 'utf8'), before);
  }
  for (const body of [[], { currentPassword: CURRENT }]) {
    const response = await f.account(cookie, body).expect(400);
    assert.equal(typeof response.body.message, 'string');
    assert.equal(await readFile(f.usersFile, 'utf8'), before);
  }
});

// Vertical slice 5: injected allowlists are deliberately read-only.
test('injected options.users fixtures reject updates without touching the fixture or users file', async (t) => {
  const injected = Object.freeze([Object.freeze({ id: 'owner-fixture', name: 'Injected Owner', email: EMAIL,
    role: 'marketing', passwordHash: await fixtureHash })]);
  const original = JSON.stringify(injected);
  const f = await fixture(t, { users: injected });
  const cookie = await f.login();
  const before = await readFile(f.usersFile, 'utf8');
  const response = await f.account(cookie, { email: 'fixture-unchanged@example.invalid', currentPassword: CURRENT,
    newPassword: NEXT, confirmPassword: NEXT }).expect(403);
  assert.equal(typeof response.body.message, 'string');
  assert.equal(await readFile(f.usersFile, 'utf8'), before);
  assert.equal(JSON.stringify(injected), original);
});

// Vertical slice 4: only an authenticated approved identity may change an account.
test('anonymous and built-in demo identities cannot update any approved account', async (t) => {
  const f = await fixture(t);
  const before = await readFile(f.usersFile, 'utf8');
  const body = { email: 'forbidden@example.invalid', currentPassword: CURRENT, newPassword: NEXT, confirmPassword: NEXT };
  const anonymous = await f.account('', body).expect(401);
  assert.equal(typeof anonymous.body.message, 'string');
  const demo = await f.post('/api/auth/demo').expect(200);
  const demoCookie = demo.headers['set-cookie'][0].split(';')[0];
  const response = await f.account(demoCookie, body).expect(403);
  assert.equal(typeof response.body.message, 'string');
  assert.equal(await readFile(f.usersFile, 'utf8'), before);
});

// Vertical slice 3: retaining the password still rotates its hash and revokes all old sessions.
test('email-only updates with absent or empty new password revoke both account cookies but not other users', async (t) => {
  for (const newPassword of [undefined, '']) {
    await t.test(newPassword === undefined ? 'absent password' : 'empty password', async (t) => {
      const f = await fixture(t);
      const first = await f.login();
      const second = await f.login();
      const other = await f.login(f.users[1].email);
      const fields = newPassword === undefined ? {} : { newPassword, confirmPassword: 'ignored without new password' };
      await f.account(first, { email: 'email-only@example.invalid', currentPassword: CURRENT, ...fields }).expect(200, SUCCESS);
      const saved = await f.saved();
      assert.notEqual(saved[0].passwordHash, f.users[0].passwordHash);
      assert.equal(await verifyPassword(CURRENT, saved[0].passwordHash), true);
      assert.deepEqual(saved[1], f.users[1]);
      for (const cookie of [first, second]) {
        assert.equal((await f.get('/api/auth/session', cookie)).body.user, null);
        await f.get('/api/data', cookie).expect(401);
      }
      assert.equal((await f.get('/api/auth/session', other)).body.user.id, f.users[1].id);
      await f.post('/api/auth/login', { email: EMAIL, password: CURRENT }).expect(401);
      await f.login('email-only@example.invalid');
    });
  }
});

// Vertical slice 2: current credentials are required before any persistent change.
test('wrong current password cannot write either an email-only or combined update', async (t) => {
  const f = await fixture(t);
  const cookie = await f.login();
  const before = await readFile(f.usersFile, 'utf8');
  for (const fields of [{ newPassword: NEXT, confirmPassword: NEXT }, {}]) {
    const response = await f.account(cookie, { email: 'changed@example.invalid', currentPassword: 'wrong-fixture-passphrase', ...fields }).expect(400);
    assert.equal(response.body.message, 'Kata sandi saat ini tidak valid.');
    assert.equal(await readFile(f.usersFile, 'utf8'), before);
  }
  assert.equal((await f.get('/api/auth/session', cookie)).body.user.id, f.users[0].id);
});

// Vertical slice 1: a real own-account update, persistent credentials, forced reauthentication.
test('combined update persists only own normalized email and password and forces reauthentication', async (t) => {
  const f = await fixture(t);
  const cookie = await f.login();
  const response = await f.account(cookie, { email: '  UPDATED@EXAMPLE.INVALID ', currentPassword: CURRENT,
    newPassword: NEXT, confirmPassword: NEXT }).expect(200);
  assert.deepEqual(response.body, SUCCESS);
  assert.match(response.headers['set-cookie'][0], /^marketing\.sid=;/);
  assert.match(response.headers['set-cookie'][0], /Expires=Thu, 01 Jan 1970/);
  const saved = await f.saved();
  assert.equal(saved[0].email, 'updated@example.invalid');
  assert.equal(saved[0].id, f.users[0].id);
  assert.equal(saved[0].role, f.users[0].role);
  assert.equal(saved[0].name, f.users[0].name);
  assert.notEqual(saved[0].passwordHash, f.users[0].passwordHash);
  assert.equal(await verifyPassword(NEXT, saved[0].passwordHash), true);
  assert.equal(await verifyPassword(CURRENT, saved[0].passwordHash), false);
  assert.deepEqual(saved[1], f.users[1]);
  assert.equal((await f.get('/api/auth/session', cookie).expect(200)).body.user, null);
  await f.post('/api/auth/login', { email: EMAIL, password: CURRENT }).expect(401);
  await f.post('/api/auth/login', { email: 'updated@example.invalid', password: CURRENT }).expect(401);
  const fresh = await f.login('updated@example.invalid', NEXT);
  assert.equal((await f.get('/api/auth/session', fresh).expect(200)).body.user.id, f.users[0].id);
  assert.deepEqual((await readdir(f.directory)).sort(), ['cache', 'users.json']);
  if (process.platform !== 'win32') assert.equal((await stat(f.usersFile)).mode & 0o777, 0o600);
});
