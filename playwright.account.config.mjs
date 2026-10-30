import { defineConfig, devices } from '@playwright/test';

// Only the isolated fixture may run these credential-changing browser tests.
process.env.ACCOUNT_E2E_FIXTURE = '1';
export default defineConfig({
  testDir: './tests/e2e', testMatch: 'account.spec.mjs',
  fullyParallel: false, workers: 1, timeout: 30000,
  expect: { timeout: 10000 }, reporter: [['list']],
  outputDir: 'test-results/account',
  use: {
    baseURL: 'http://127.0.0.1:3110', timezoneId: 'Asia/Jakarta',
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node tests/fixtures/account-server.mjs',
    url: 'http://127.0.0.1:3110/api/health', reuseExistingServer: false, timeout: 30000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
});
