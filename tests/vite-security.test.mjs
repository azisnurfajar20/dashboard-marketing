import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));

test('Vite development server blocks sensitive project files through direct and /@fs URLs', async (t) => {
  const privateRoot = path.join(root, 'server', 'private');
  const directory = path.join(privateRoot, `vite-security-${randomUUID()}`);
  await mkdir(directory, { recursive: true });
  const filename = path.join(directory, 'service-account.json');
  await writeFile(filename, '{"private_key":"fixture-only-not-a-real-key"}');
  t.after(async () => { await rm(directory, { recursive: true, force: true }); });

  const server = await createServer({
    configFile: path.join(root, 'vite.config.js'),
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  t.after(() => server.close());
  await server.listen();
  const address = server.httpServer.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const direct = await fetch(`${origin}/server/private/${path.basename(directory)}/service-account.json`);
  const filesystem = await fetch(`${origin}/@fs/${filename.replaceAll('\\', '/')}`);
  assert.notEqual(direct.status, 200, 'private files must not be served from the project root');
  assert.notEqual(filesystem.status, 200, 'private files must not be served through Vite /@fs');
  assert.equal((await direct.text()).includes('fixture-only-not-a-real-key'), false);
  assert.equal((await filesystem.text()).includes('fixture-only-not-a-real-key'), false);
});
