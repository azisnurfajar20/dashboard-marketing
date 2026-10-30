import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import session from 'express-session';
import fileStoreFactory from 'session-file-store';
import { createApp } from '../server/app.mjs';

const FileStore = fileStoreFactory(session);
const secret = 'session-race-test-only-secret-with-at-least-48-characters';
const scratch = process.env.TMPDIR || tmpdir();
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const fileStore = (directory) => ({ path: directory, ttl: 28800, retries: 0, reapInterval: -1, logFn: () => {} });

async function fixture(t, directory, sessionStore) {
  const app = await createApp({
    env: { DATA_MODE: 'demo', NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '3001', SESSION_SECRET: secret,
      SESSION_DIR: path.join(directory, 'sessions'), USERS_FILE: path.join(directory, 'unused-users.json') },
    users: [], sessionStore, cacheDir: path.join(directory, 'cache'), autoSync: false,
  });
  t.after(() => app.locals.close());
  const get = (url, cookie) => request(app).get(url).set('Host', '127.0.0.1:3001').set('Cookie', cookie);
  const post = (url, cookie = '') => request(app).post(url).set('Host', '127.0.0.1:3001')
    .set('Origin', 'http://127.0.0.1:5173').set('Cookie', cookie).send({});
  return { app, get, post };
}

async function directoryFor(t) {
  const directory = await mkdtemp(path.join(scratch, 'marketing-session-race-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function interceptRoute(app, url, intercept) {
  const route = app.router.stack.find((layer) => layer.route?.path === url).route;
  const handler = route.stack.at(-1);
  const original = handler.handle;
  handler.handle = (req, res, next) => intercept(req, () => original(req, res, next), next);
}

function pauseRoute(app, url, mutate = false) {
  const loaded = deferred();
  const release = deferred();
  const invoked = deferred();
  interceptRoute(app, url, (req, proceed, next) => {
    if (mutate) req.session.raceMarker = true; // Force express-session's set rather than touch path.
    loaded.resolve(req);
    release.promise.then(() => { proceed(); invoked.resolve(); }).catch(next);
  });
  return { loaded: loaded.promise, release: release.resolve, invoked: invoked.promise };
}

async function assertLoggedOut(client, cookie) {
  await client.get('/api/data', cookie).expect(401);
  assert.equal((await client.get('/api/auth/session', cookie).expect(200)).body.user, null);
}

test('an in-flight response cannot set its logged-out SID again in the default FileStore, including after restart', { timeout: 10000 }, async (t) => {
  const directory = await directoryFor(t);
  const client = await fixture(t, directory);
  const login = await client.post('/api/auth/demo').expect(200);
  assert.match(login.headers['set-cookie'][0], /; HttpOnly/);
  const cookie = login.headers['set-cookie'][0].split(';')[0];
  const paused = pauseRoute(client.app, '/api/data', true);
  t.after(paused.release);
  const inFlight = client.get('/api/data', cookie).expect(200).then((response) => response);
  await paused.loaded;
  await client.post('/api/auth/logout', cookie).expect(200, { ok: true });
  paused.release();
  await inFlight;
  await assertLoggedOut(client, cookie);
  await client.app.locals.close();
  const restarted = await fixture(t, directory);
  await assertLoggedOut(restarted, cookie);
  const fresh = await restarted.post('/api/auth/demo', cookie).expect(200);
  assert.notEqual(fresh.headers['set-cookie'][0].split(';')[0], cookie);
  assert.match(fresh.headers['set-cookie'][0], /; HttpOnly/);
  await restarted.get('/api/data', fresh.headers['set-cookie'][0].split(';')[0]).expect(200);
});

// Same FileStore read/modify/atomic-write flow, with an explicit write barrier
// instead of a timing-dependent filesystem race or a mocked persistence layer.
class GatedFileStore extends FileStore {
  arm(method) {
    this.events = [];
    this.gate = { method, started: deferred(), released: deferred() };
    this.held = this.gate;
    return this.gate.started.promise;
  }

  set(sid, value, callback) {
    if (this.gate?.method === 'set') return this.delayWrite(sid, value, callback);
    return super.set(sid, value, callback);
  }

  touch(sid, value, callback) {
    if (this.gate?.method !== 'touch') return super.touch(sid, value, callback);
    super.get(sid, (error, original) => {
      if (error) return callback(error, null);
      original ||= {};
      if (value.cookie) original.cookie = value.cookie;
      this.delayWrite(sid, original, callback);
    });
  }

  delayWrite(sid, value, callback) {
    const gate = this.gate;
    this.gate = null;
    this.events.push('write-start');
    gate.started.resolve();
    gate.released.promise.then(() => super.set(sid, value, (...args) => {
      this.events.push('write-finish');
      callback(...args);
    }));
  }

  destroy(sid, callback) {
    const destroyed = deferred();
    this.destroying = destroyed.promise;
    this.events?.push('destroy-start');
    super.destroy(sid, (...args) => {
      this.events?.push('destroy-finish');
      destroyed.resolve();
      callback?.(...args);
    });
  }

  async finishWrite() {
    this.held.released.resolve();
  }
}

for (const method of ['touch', 'set']) {
  test(`logout orders an already-running FileStore ${method} before deletion and cannot resurrect auth on disk`, { timeout: 10000 }, async (t) => {
    const directory = await directoryFor(t);
    const disk = path.join(directory, 'injected-store');
    const store = new GatedFileStore(fileStore(disk));
    const client = await fixture(t, directory, store);
    const login = await client.post('/api/auth/demo').expect(200);
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    const logout = pauseRoute(client.app, '/api/auth/logout');
    t.after(logout.release);
    const loggingOut = client.post('/api/auth/logout', cookie).expect(200, { ok: true }).then((response) => response);
    await logout.loaded; // Logout and data both load the authenticated SID before any write is held.
    if (method === 'set') interceptRoute(client.app, '/api/data', (req, proceed) => {
      req.session.raceMarker = true;
      proceed();
    });
    const started = store.arm(method);
    t.after(() => store.held.released.resolve());
    const inFlight = client.get('/api/data', cookie).expect(200).then((response) => response);
    await started;
    logout.release();
    await logout.invoked; // destroy has been requested, not necessarily persisted yet.
    await store.finishWrite();
    await Promise.all([inFlight, loggingOut]);
    await assertLoggedOut(client, cookie);
    assert.ok(store.events.indexOf('write-finish') < store.events.indexOf('destroy-start'), store.events.join(', '));
    await client.app.locals.close();
    const restarted = await fixture(t, directory, new FileStore(fileStore(disk)));
    await assertLoggedOut(restarted, cookie);
  });
}

test('logout tombstones expire after the session lifetime but stay while older requests are active', async (t) => {
  const { createRevocableStore } = await import('../server/services/revocable-session-store.mjs');
  const clock = { value: 0 };
  const store = createRevocableStore(session.Store, new session.MemoryStore(), {
    revocationTtlMs: 10,
    cleanupIntervalMs: 1_000_000,
    now: () => clock.value,
  });
  t.after(() => store.close());
  const release = store.trackRequest('held-session');
  await new Promise((resolve, reject) => store.destroy('held-session', error => error ? reject(error) : resolve()));
  await new Promise(setImmediate);
  clock.value = 11;
  store.cleanup();
  assert.equal(store.revoked.has('held-session'), true, 'a request loaded before logout keeps its tombstone');
  release();
  assert.equal(store.revoked.has('held-session'), false, 'the expired tombstone is removed after the request ends');

  await new Promise((resolve, reject) => store.destroy('expired-session', error => error ? reject(error) : resolve()));
  await new Promise(setImmediate);
  clock.value = 22;
  store.cleanup();
  assert.equal(store.revoked.has('expired-session'), false, 'idle expired tombstones are reaped');
});
