import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import session from 'express-session';
import { createApp } from '../../server/app.mjs';
import { hashPassword } from '../../server/services/users.mjs';
import { createDemoWorkbook } from '../../server/services/demo.mjs';

// Explicitly isolated test identities and workbook. No real .env, users or Google credentials.
const port = 3110;
const directory = await mkdtemp(path.join(process.env.TMPDIR || 'C:/Users/Acer/AppData/Local/hermes/cache/scratch', 'account-browser-fixture-'));
const usersFile = path.join(directory, 'fixture-users.json');
const passwordHash = await hashPassword('current-fixture-password-123');
const users = ['desktop', 'mobile'].flatMap(project => ['combined', 'validation', 'email-only', 'source-down'].map(scenario => ({
  id: `${project}-${scenario}`, name: 'Akun Pengujian Fiktif',
  email: `${project}-${scenario}@example.invalid`, role: 'marketing', passwordHash,
})));
await writeFile(usersFile, JSON.stringify(users), { mode: 0o600 });
const workbook = createDemoWorkbook(new Date('2026-10-23T08:00:00Z'));
const app = await createApp({
  env: {
    DATA_MODE: 'sheets', NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(port),
    APP_ORIGIN: `http://127.0.0.1:${port}`,
    SESSION_SECRET: 'isolated-account-fixture-session-secret-not-real-12345',
    GOOGLE_SPREADSHEET_ID: 'isolated-account-workbook-fixture',
    GOOGLE_SERVICE_ACCOUNT_FILE: path.join(directory, 'unused-fixture-key.json'),
    USERS_FILE: usersFile, CACHE_DIR: path.join(directory, 'cache'), SESSION_DIR: path.join(directory, 'sessions'),
  },
  workbookLoader: async () => structuredClone(workbook),
  sessionStore: new session.MemoryStore(), autoSync: false,
  limits: { loginMax: 1000, accountMax: 1000 }, authDelayMs: 0,
});
const server = app.listen(port, '127.0.0.1', () => console.log(`ISOLATED ACCOUNT TEST FIXTURE http://127.0.0.1:${port} — no real Google data or accounts`));
let closing = false;
const close = async () => {
  if (closing) return;
  closing = true;
  await new Promise(resolve => server.close(resolve));
  await app.locals.close();
  await rm(directory, { recursive: true, force: true });
};
process.once('SIGINT', close);
process.once('SIGTERM', close);
