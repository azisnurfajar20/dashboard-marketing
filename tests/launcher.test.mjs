import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

async function localServer(handler, fn) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('launcher reuses only an existing Duta Persada dashboard, not an unrelated service', async () => {
  const { isDashboardRunning } = await import('../scripts/launch.mjs');
  await localServer((req, res) => {
    if (req.url === '/api/health') { res.setHeader('Content-Type', 'application/json'); res.end('{"ok":true}'); }
    else res.end('<!doctype html><title>Monitor Marketing — LPK Duta Persada</title>');
  }, async origin => assert.equal(await isDashboardRunning(origin), true));
  await localServer((req, res) => res.end('Another application'), async origin => assert.equal(await isDashboardRunning(origin), false));
});

test('launcher avoids duplicate listeners and opens the verified local dashboard', async () => {
  const { launchDashboard } = await import('../scripts/launch.mjs');
  const opened = [];
  let starts = 0;
  const result = await launchDashboard({
    origin: 'http://127.0.0.1:3001',
    probe: async () => true,
    start: async () => { starts++; },
    open: url => opened.push(url),
    log: () => {},
  });
  assert.equal(result.reused, true);
  assert.equal(starts, 0);
  assert.deepEqual(opened, ['http://127.0.0.1:3001']);
});
