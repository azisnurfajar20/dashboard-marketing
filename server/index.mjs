import path from 'node:path';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { createApp } from './app.mjs';
import { ROOT } from './config/env.mjs';

dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });

export async function startServer(options = {}) {
  const app = await createApp(options);
  const { host, port, mode } = app.locals.config;
  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(port, host, () => resolve(instance));
    instance.once('error', reject);
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.keepAliveTimeout = 5000;
  const close = async () => {
    await new Promise((resolve) => server.close(resolve));
    await app.locals.close();
  };
  return { app, server, close, mode };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const running = await startServer();
    const { appOrigin, mode } = running.app.locals.config;
    console.log(`Marketing dashboard: ${appOrigin} — ${mode === 'demo' ? 'DEMO / data sepenuhnya fiktif' : 'Google Sheets / akses baca saja'}`);
    let stopping = false;
    const shutdown = async () => {
      if (stopping) return;
      stopping = true;
      const deadline = setTimeout(() => process.exit(1), 10000);
      deadline.unref();
      await running.close();
      clearTimeout(deadline);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  } catch {
    console.error('Server tidak dapat dimulai. Periksa konfigurasi mode, HOST/PORT, APP_ORIGIN, secret, allowlist pengguna, dan berkas kredensial privat.');
    process.exitCode = 1;
  }
}
