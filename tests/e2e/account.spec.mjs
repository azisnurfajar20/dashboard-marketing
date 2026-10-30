import { test, expect, request } from '@playwright/test';

const currentPassword = 'current-fixture-password-123';
const nextPassword = 'next-fixture-password-456';
const emailFor = (project, scenario) => `${project}-${scenario}@example.invalid`;
test.skip(process.env.ACCOUNT_E2E_FIXTURE !== '1', 'Credential mutation tests require the explicit isolated account fixture configuration.');

async function login(page, email, password = currentPassword) {
  await page.goto('/');
  await page.getByLabel('Email kerja', { exact: true }).fill(email);
  await page.getByLabel('Kata sandi', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Masuk ke ruang kerja', exact: true }).click();
}
async function account(page) {
  const menu = page.getByRole('button', { name: 'Buka menu navigasi', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator('#app-sidebar').getByRole('link', { name: 'Pengaturan akun', exact: true }).click();
  await expect(page.getByTestId('page-account')).toBeVisible();
}
async function fillChange(page, { email, oldPassword = currentPassword, password = nextPassword, confirmation = password }) {
  if (email !== undefined) await page.getByLabel('Email login', { exact: true }).fill(email);
  await page.getByLabel('Kata sandi saat ini', { exact: true }).fill(oldPassword);
  await page.getByLabel('Kata sandi baru', { exact: true }).fill(password);
  await page.getByLabel('Konfirmasi kata sandi baru', { exact: true }).fill(confirmation);
}
async function noOverflow(page) {
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1);
}

test.beforeEach(async ({ baseURL }) => {
  expect(baseURL).toBe('http://127.0.0.1:3110');
});

test('changes only the signed-in account and requires re-login with new credentials', async ({ page, baseURL }, testInfo) => {
  const email = emailFor(testInfo.project.name, 'combined');
  const updatedEmail = `${testInfo.project.name}-updated@example.invalid`;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const sibling = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
  try {
    expect((await sibling.post('/api/auth/login', { data: { email, password: currentPassword } })).status()).toBe(200);
    await login(page, email);
    await expect(page.getByTestId('page-dashboard')).toBeVisible();
    await account(page);
    await expect(page.getByLabel('Email login', { exact: true })).toHaveValue(email);
    await expect(page.getByLabel('Kata sandi saat ini', { exact: true })).toHaveAttribute('autocomplete', 'current-password');
    await expect(page.getByLabel('Kata sandi baru', { exact: true })).toHaveAttribute('autocomplete', 'new-password');
    await noOverflow(page);

    await fillChange(page, { email: updatedEmail, oldPassword: 'incorrect-fixture-password-123' });
    await page.getByRole('button', { name: 'Simpan perubahan', exact: true }).click();
    await expect(page.getByTestId('page-account').getByRole('alert')).toContainText(/kata sandi|password/i);
    expect((await (await sibling.get('/api/auth/session')).json()).user.email).toBe(email);

    await fillChange(page, { email: updatedEmail });
    await page.getByRole('button', { name: 'Simpan perubahan', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Masuk ke ruang kerja', exact: true })).toBeVisible();
    await expect(page.getByText('Akun berhasil diperbarui. Silakan masuk kembali.', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Email kerja', { exact: true })).toHaveValue(updatedEmail);
    await expect(page.getByLabel('Kata sandi', { exact: true })).toHaveValue('');
    expect((await sibling.get('/api/data')).status()).toBe(401);
    expect((await sibling.post('/api/auth/login', { data: { email, password: currentPassword } })).status()).toBe(401);
    expect((await sibling.post('/api/auth/login', { data: { email: updatedEmail, password: currentPassword } })).status()).toBe(401);

    await page.getByLabel('Kata sandi', { exact: true }).fill(nextPassword);
    await page.getByRole('button', { name: 'Masuk ke ruang kerja', exact: true }).click();
    await expect(page.getByTestId('page-dashboard')).toBeVisible();
    const session = await (await page.request.get('/api/auth/session')).json();
    expect(session.user.email).toBe(updatedEmail);
    await account(page);
    await expect(page.getByLabel('Email login', { exact: true })).toHaveValue(updatedEmail);
    await expect(page.getByLabel('Kata sandi saat ini', { exact: true })).toHaveValue('');
    await noOverflow(page);
    expect(errors).toEqual([]);
  } finally { await sibling.dispose(); }
});

test('client mismatch validation does not send a credential update or expose passwords', async ({ page }, testInfo) => {
  const email = emailFor(testInfo.project.name, 'validation');
  let mutations = 0;
  page.on('request', r => { if (new URL(r.url()).pathname === '/api/auth/account' && r.method() === 'POST') mutations++; });
  await login(page, email);
  await expect(page.getByTestId('page-dashboard')).toBeVisible();
  await account(page);
  await fillChange(page, { password: nextPassword, confirmation: 'mismatching-fixture-password-789' });
  await page.getByRole('button', { name: 'Simpan perubahan', exact: true }).click();
  await expect(page.getByTestId('page-account').getByRole('alert')).toContainText(/sama|cocok/i);
  expect(mutations).toBe(0);
  expect(page.url()).not.toContain(currentPassword);
  expect(page.url()).not.toContain(nextPassword);
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(storage).not.toContain(currentPassword);
  expect(storage).not.toContain(nextPassword);
  await noOverflow(page);
});

test('email-only changes invalidate older sessions but keep the password', async ({ page, baseURL }, testInfo) => {
  const email = emailFor(testInfo.project.name, 'email-only');
  const updatedEmail = `${testInfo.project.name}-emailonly-updated@example.invalid`;
  const sibling = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
  try {
    expect((await sibling.post('/api/auth/login', { data: { email, password: currentPassword } })).status()).toBe(200);
    await login(page, email);
    await expect(page.getByTestId('page-dashboard')).toBeVisible();
    await account(page);
    await fillChange(page, { email: updatedEmail, password: '', confirmation: '' });
    await page.getByRole('button', { name: 'Simpan perubahan', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Masuk ke ruang kerja', exact: true })).toBeVisible();
    await expect(page.getByLabel('Email kerja', { exact: true })).toHaveValue(updatedEmail);
    expect((await sibling.get('/api/data')).status()).toBe(401);
    await page.getByLabel('Kata sandi', { exact: true }).fill(currentPassword);
    await page.getByRole('button', { name: 'Masuk ke ruang kerja', exact: true }).click();
    await expect(page.getByTestId('page-dashboard')).toBeVisible();
    await expect(page.getByText('Akun berhasil diperbarui. Silakan masuk kembali.', { exact: true })).toHaveCount(0);
  } finally { await sibling.dispose(); }
});

test('account settings remain usable when the dataset cannot load', async ({ page }, testInfo) => {
  const email = emailFor(testInfo.project.name, 'source-down');
  await page.route('**/api/data', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Sumber fixture tidak tersedia.', data: null, status: { mode: 'sheets', connection: 'error', error: 'Sumber fixture tidak tersedia.' } }) }));
  await login(page, email);
  await expect(page.getByRole('heading', { name: 'Data belum tersedia', exact: true })).toBeVisible();
  await account(page);
  await expect(page.getByLabel('Email login', { exact: true })).toHaveValue(email);
  await expect(page.getByRole('button', { name: 'Simpan perubahan', exact: true })).toBeVisible();
  await noOverflow(page);
});
