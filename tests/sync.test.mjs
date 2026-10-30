import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

const scratch = process.env.TMPDIR || tmpdir();
const normalized = (name = 'Fixture School', year = 2026) => ({ schools: [{ id: 'school-1', name, region: 'Fixture Region', ownership: 'Swasta', owner: 'Fixture Marketer', status: 'Aktif', lastVisitDate: null, source: { tab: 'Data Sekolah', row: 2 } }], pics: [], tiers: [], visits: [], years: [year], issues: [], hasFatalIssues: false });

async function temporary(t) {
  const directory = await mkdtemp(path.join(scratch, 'marketing-sync-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('sync coalesces concurrent refreshes and atomically persists only normalized successful data', async (t) => {
  const { createSyncService } = await import('../server/services/sync.mjs');
  const cacheDir = await temporary(t);
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const service = await createSyncService({ mode: 'sheets', spreadsheetId: 'fixture-spreadsheet-1', cacheDir, workbookLoader: async () => { calls++; await gate; return { privateRaw: 'never-persist-this' }; }, normalizer: () => normalized() });
  t.after(() => service.stop());
  assert.equal(service.snapshot().data, null);
  const first = service.sync();
  const second = service.sync();
  release();
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(service.snapshot().status.connection, 'connected');
  assert.equal(service.snapshot().data.schools[0].name, 'Fixture School');
  const files = await readdir(cacheDir);
  assert.equal(files.length, 1);
  assert.equal(files[0].endsWith('.json'), true);
  const cache = await readFile(path.join(cacheDir, files[0]), 'utf8');
  assert.equal(cache.includes('never-persist-this'), false);
  assert.equal(JSON.parse(cache).identity.spreadsheetId, 'fixture-spreadsheet-1');
});

test('Google Sheets loader requests exactly four whole tabs with read-only scope and serial dates', async () => {
  const { createGoogleSheetsLoader, SHEETS_SCOPE } = await import('../server/services/google-sheets/loader.mjs');
  const requests = [];
  const tabs = ['Data Sekolah', 'Data Pic Sekolah', 'Data Tier Sekolah', 'Riwayat Kunjungan'];
  const loader = createGoogleSheetsLoader({ spreadsheetId: 'fixture-spreadsheet-1', serviceAccountFile: 'private-fixture.json' }, { auth: { getClient: async () => ({ request: async (request) => { requests.push(request); return { data: { valueRanges: tabs.map((tab) => ({ range: `'${tab}'!A1:ZZ2`, values: [['Header', 'Tier 2099'], ['fixture', 'Tier 1']] })) } }; } }) }, sleep: async () => {} });
  const data = await loader();
  assert.deepEqual(Object.keys(data), tabs);
  assert.equal(SHEETS_SCOPE, 'https://www.googleapis.com/auth/spreadsheets.readonly');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'GET');
  const url = new URL(requests[0].url);
  assert.equal(url.hostname, 'sheets.googleapis.com');
  assert.equal(url.pathname, '/v4/spreadsheets/fixture-spreadsheet-1/values:batchGet');
  assert.deepEqual(url.searchParams.getAll('ranges'), tabs.map((tab) => `'${tab}'`));
  assert.equal(url.searchParams.get('valueRenderOption'), 'UNFORMATTED_VALUE');
  assert.equal(url.searchParams.get('dateTimeRenderOption'), 'SERIAL_NUMBER');
  assert.ok(requests[0].timeout > 0 && requests[0].timeout <= 15000);
  assert.deepEqual(data['Data Tier Sekolah'][0], ['Header', 'Tier 2099']);
});

test('Google loader retries transient read failures only and bounds even a hung request safely', async () => {
  const { createGoogleSheetsLoader } = await import('../server/services/google-sheets/loader.mjs');
  const config = { spreadsheetId: 'fixture-spreadsheet-1', serviceAccountFile: 'private-fixture.json' };
  let attempts = 0;
  const sleeps = [];
  const auth = { getClient: async () => ({ request: async () => {
    attempts++;
    if (attempts < 3) throw Object.assign(new Error('private_key SECRET +6281234567890'), { response: { status: 503 } });
    return { data: { valueRanges: Array.from({ length: 4 }, () => ({ values: [['fixture']] })) } };
  } }) };
  const loader = createGoogleSheetsLoader(config, { auth, sleep: async (ms) => { sleeps.push(ms); }, timeoutMs: 100 });
  await loader();
  assert.equal(attempts, 3);
  assert.equal(sleeps.length, 2);
  let forbiddenAttempts = 0;
  const forbidden = createGoogleSheetsLoader(config, { auth: { getClient: async () => ({ request: async () => { forbiddenAttempts++; throw Object.assign(new Error('secret-do-not-echo'), { response: { status: 403 } }); } }) }, sleep: async () => {}, timeoutMs: 30 });
  await assert.rejects(forbidden(), (error) => !/secret-do-not-echo/.test(error.message));
  assert.equal(forbiddenAttempts, 1);
  const hung = createGoogleSheetsLoader(config, { auth: { getClient: async () => ({ request: () => new Promise(() => {}) }) }, sleep: async () => {}, timeoutMs: 15, maxAttempts: 1 });
  const started = Date.now();
  await assert.rejects(hung(), /Google Sheets/);
  assert.ok(Date.now() - started < 500);
});

test('last-good cache survives restart and cannot cross spreadsheet or mode boundaries', async (t) => {
  const { createSyncService } = await import('../server/services/sync.mjs');
  const cacheDir = await temporary(t);
  const options = { mode: 'sheets', spreadsheetId: 'fixture-cache-source-A', cacheDir, workbookLoader: async () => ({}), normalizer: () => normalized('Persisted Fixture') };
  const first = await createSyncService(options);
  await first.sync();
  await first.stop();
  const before = await readFile(path.join(cacheDir, (await readdir(cacheDir))[0]), 'utf8');
  const resumed = await createSyncService({ ...options, workbookLoader: async () => { throw new Error('Authorization Bearer private-secret'); } });
  t.after(() => resumed.stop());
  assert.equal(resumed.snapshot().data.schools[0].name, 'Persisted Fixture');
  const lastSuccess = resumed.snapshot().status.lastSuccessAt;
  const failed = await resumed.sync();
  assert.equal(failed.data.schools[0].name, 'Persisted Fixture');
  assert.equal(failed.status.lastSuccessAt, lastSuccess);
  assert.equal(failed.status.connection, 'error');
  assert.equal(JSON.stringify(failed).includes('private-secret'), false);
  assert.equal(await readFile(path.join(cacheDir, (await readdir(cacheDir))[0]), 'utf8'), before);
  for (const variant of [{ ...options, spreadsheetId: 'fixture-cache-source-B' }, { ...options, mode: 'demo' }]) {
    const isolated = await createSyncService(variant);
    assert.equal(isolated.snapshot().data, null);
    await isolated.stop();
  }
});

test('automatic sync runs on the configured five-minute schedule and stop cancels it', async (t) => {
  const { createSyncService } = await import('../server/services/sync.mjs');
  const { setTimeout: delay } = await import('node:timers/promises');
  const cacheDir = await temporary(t);
  let calls = 0;
  const service = await createSyncService({ mode: 'sheets', spreadsheetId: 'fixture-timer-source', cacheDir, intervalMs: 30, workbookLoader: async () => { calls++; return {}; }, normalizer: () => normalized(`Revision ${calls}`) });
  t.after(() => service.stop());
  service.start();
  assert.ok(service.snapshot().status.nextSyncAt);
  const deadline = Date.now() + 2000;
  while (calls < 2 && Date.now() < deadline) await delay(10);
  assert.ok(calls >= 2);
  await service.stop();
  const stoppedCalls = calls;
  await delay(70);
  assert.equal(calls, stoppedCalls);
  assert.equal(service.snapshot().status.nextSyncAt, null);
  const { readConfig } = await import('../server/config/env.mjs');
  assert.equal(readConfig({}).syncIntervalMs, 300000);
});

test('manual refresh reports the actual next automatic tick instead of shifting the displayed schedule', async (t) => {
  const { createSyncService } = await import('../server/services/sync.mjs');
  const cacheDir = await temporary(t);
  let clock = new Date('2026-10-23T05:00:00Z');
  const service = await createSyncService({ mode: 'sheets', spreadsheetId: 'fixture-schedule-source', cacheDir, workbookLoader: async () => ({}), normalizer: () => normalized(), now: () => clock });
  t.after(() => service.stop());
  service.start();
  const scheduled = service.snapshot().status.nextSyncAt;
  clock = new Date('2026-10-23T05:01:00Z');
  await service.sync();
  assert.equal(service.snapshot().status.nextSyncAt, scheduled);
});
