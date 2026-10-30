import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { normalizeWorkbook } from '../shared/data.mjs';

const loadSelectors = () => import('../shared/selectors.mjs');

function fixture() {
  return normalizeWorkbook({
    'Data Sekolah': [
      ['ID Sekolah', 'Nama Sekolah', 'Daerah', 'Negeri/Swasta', 'Koordinator', 'Status Sekolah'],
      ['S-1', 'SMK Cempaka', 'Bantul', 'Negeri', 'Rani', 'Aktif'],
      ['S-2', 'SMA Anggrek', 'Sleman', 'Swasta', 'Dewi', 'Aktif'],
      ['S-3', 'SMK Bakti', 'Bantul', 'Swasta', 'Rani', 'Nonaktif'],
      ['S-4', 'SMK Delima', 'Bantul', 'Negeri', 'Rani', 'Aktif'],
      ['S-5', 'SMK Elang', 'Sleman', 'Swasta', 'Dewi', 'Aktif'],
    ],
    'Data Pic Sekolah': [['ID PIC', 'ID Sekolah', 'Nama PIC', 'Jabatan', 'Nomor WhatsApp', 'Status Kontak']],
    'Data Tier Sekolah': [
      ['ID Sekolah', 'Tier 2024', 'Tier 2025', 'Tier 2028'],
      ['S-1', 'Tier 3', 'Tier 2', 'Tier 1'],
      ['S-2', 'Tier 1', 'Tier 2', 'Tier 3'],
      ['S-3', '', 'Tier 3', ''],
      ['S-4', 'Tier 2', 'Tier 4', 'Tier 2'],
    ],
    'Riwayat Kunjungan': [
      ['ID Visit', 'Tanggal', 'ID Sekolah', 'Marketing pelaksana', 'Kegiatan', 'PIC yang ditemui', 'Hasil', 'Next Action', 'Tanggal Follow-up', 'Status Follow-up'],
      ['V-1', '2026-10-01', 'S-1', 'Bima', 'BK; Brosur', '', '', 'Hubungi', '2026-10-23', 'Belum Selesai'],
      ['V-2', '2026-10-23', 'S-1', 'Dewi', 'Sosialisasi', '', '', 'Hubungi', '2026-10-22', 'Belum Selesai'],
      ['V-3', '2026-10-31', 'S-2', 'Bima', 'Brosur', '', '', 'Hubungi', '2026-10-23', 'Selesai'],
      ['V-4', '2026-09-01', 'S-3', 'Bima', 'BK', '', '', 'Hubungi', '2026-10-22', 'Belum Selesai'],
      ['V-5', '2026-11-01', 'S-2', 'Dewi', 'BK', '', '', 'Hubungi', '2026-10-23', 'Dibatalkan'],
    ],
  });
}

test('school filters distinguish owner, valid tier, empty tier, invalid tier and exact school IDs', async () => {
  const { filterSchools } = await loadSelectors();
  assert.equal(typeof filterSchools, 'function', 'filterSchools must be exported');
  const data = fixture();
  const before = structuredClone(data);
  const ids = (filters) => filterSchools(data, filters).map((school) => school.id).sort();
  assert.deepEqual(ids({}), ['S-1', 'S-2', 'S-3', 'S-4', 'S-5']);
  assert.deepEqual(ids({ search: 'sMk' }), ['S-1', 'S-3', 'S-4', 'S-5']);
  assert.deepEqual(ids({ search: 's-2' }), ['S-2']);
  assert.deepEqual(ids({ search: 'tidak ditemukan' }), []);
  assert.deepEqual(ids({ owner: 'Rani', region: 'Bantul', status: 'Aktif' }), ['S-1', 'S-4']);
  assert.deepEqual(ids({ owner: 'Bima' }), [], 'the visit marketer is not the school owner');
  assert.deepEqual(ids({ year: '2025', tier: 'Tier 2' }), ['S-1', 'S-2']);
  assert.deepEqual(ids({ year: 2025, tier: 'unassessed' }), ['S-5']);
  assert.deepEqual(ids({ year: 2025, tier: 'invalid' }), ['S-4']);
  assert.deepEqual(ids({ year: 2024, tier: 'Tier 3' }), ['S-1']);
  assert.deepEqual(ids({ tier: 'Tier 1' }), ['S-1'], 'the default year is the latest discovered year');
  assert.deepEqual(ids({ tier: 'unassessed' }), ['S-3', 'S-5']);
  assert.deepEqual(ids({ schoolIds: [] }), []);
  assert.deepEqual(ids({ schoolIds: ['S-1', 'S-1', 'missing'] }), ['S-1']);
  assert.deepEqual(ids({ schoolIds: ['s-1'] }), []);
  assert.deepEqual(ids({ year: 2035, tier: 'unassessed' }), ['S-1', 'S-2', 'S-3', 'S-4', 'S-5']);
  assert.deepEqual(data, before, 'filtering must not mutate the normalized cache');
});

test('school sorting is deterministic with undated schools last and never sorts the cache in place', async () => {
  const { filterSchools } = await loadSelectors();
  const data = fixture();
  const originalIds = data.schools.map((school) => school.id);
  const ids = (sort) => filterSchools(data, { sort }).map((school) => school.id);
  assert.deepEqual(ids('name-asc'), ['S-2', 'S-3', 'S-1', 'S-4', 'S-5']);
  assert.deepEqual(ids('name-desc'), ['S-5', 'S-4', 'S-1', 'S-3', 'S-2']);
  assert.deepEqual(ids('last-visit'), ['S-2', 'S-1', 'S-3', 'S-4', 'S-5']);
  assert.deepEqual(data.schools.map((school) => school.id), originalIds);
});

test('visit filters use inclusive dates, exact school joins and performing marketer rather than owner', async () => {
  const { filterVisits } = await loadSelectors();
  assert.equal(typeof filterVisits, 'function', 'filterVisits must be exported');
  const data = fixture();
  const before = structuredClone(data);
  const ids = (filters) => filterVisits(data, filters).map((visit) => visit.id).sort();
  assert.deepEqual(ids({ start: '2026-10-01', end: '2026-10-31' }), ['V-1', 'V-2', 'V-3']);
  assert.deepEqual(ids({ start: '2026-10-23', end: '2026-10-23' }), ['V-2']);
  assert.deepEqual(ids({ start: '2026-10-31' }), ['V-3', 'V-5']);
  assert.deepEqual(ids({ end: '2026-10-01' }), ['V-1', 'V-4']);
  assert.deepEqual(ids({ region: 'Bantul', marketer: 'Bima', activity: 'BK' }), ['V-1', 'V-4']);
  assert.deepEqual(ids({ schoolId: 'S-1', activity: 'Brosur' }), ['V-1']);
  assert.deepEqual(ids({ marketer: 'Rani' }), [], 'school ownership never acts as the visit-marketer filter');
  assert.deepEqual(ids({ activity: 'Bro' }), [], 'activities match complete multi-select tokens');
  assert.deepEqual(ids({ schoolIds: [] }), []);
  assert.deepEqual(ids({ schoolIds: ['S-1'], schoolId: 'S-2' }), []);
  assert.deepEqual(ids({ schoolId: 's-1' }), []);
  assert.deepEqual(ids({ start: '2026-11-01', end: '2026-10-01' }), []);
  assert.deepEqual(ids({ start: '2026-02-30' }), []);
  assert.deepEqual(data, before);
});

test('dashboard metrics deduplicate IDs and keep follow-ups independent of the activity date range', async () => {
  const { dashboardSummary } = await loadSelectors();
  assert.equal(typeof dashboardSummary, 'function', 'dashboardSummary must be exported');
  const data = fixture();
  data.visits.push(structuredClone(data.visits[0]));
  const filters = { year: 2025, start: '2026-10-01', end: '2026-10-31', today: '2026-10-23' };
  assert.deepEqual(dashboardSummary(data, filters), {
    totalSchools: 5, activeSchools: 4, tier1: 0, tier2: 2, tier3: 1, unassessed: 1, invalidTier: 1,
    visits: 3, visitedSchools: 2, followUpToday: 1, followUpOverdue: 2,
  });
  assert.deepEqual(dashboardSummary(data, { ...filters, owner: 'Rani' }), {
    totalSchools: 3, activeSchools: 2, tier1: 0, tier2: 1, tier3: 1, unassessed: 0, invalidTier: 1,
    visits: 2, visitedSchools: 1, followUpToday: 1, followUpOverdue: 2,
  });
  const narrow = dashboardSummary(data, { ...filters, owner: 'Rani', marketer: 'Bima', start: '2026-10-23', end: '2026-10-23' });
  assert.equal(narrow.visits, 0);
  assert.equal(narrow.followUpToday, 1);
  assert.equal(narrow.followUpOverdue, 1);
  const activity = dashboardSummary(data, { ...filters, owner: 'Rani', activity: 'Sosialisasi' });
  assert.equal(activity.visits, 1);
  assert.equal(activity.followUpToday, 1, 'the follow-up queue is not limited to the activity filter');
  assert.equal(activity.followUpOverdue, 2);
  assert.deepEqual(dashboardSummary(data, { schoolIds: [], today: filters.today }), {
    totalSchools: 0, activeSchools: 0, tier1: 0, tier2: 0, tier3: 0, unassessed: 0, invalidTier: 0,
    visits: 0, visitedSchools: 0, followUpToday: 0, followUpOverdue: 0,
  });
});

test('tier comparisons require two valid nonempty values and discover new comparison years', async () => {
  const { compareTiers } = await loadSelectors();
  assert.equal(typeof compareTiers, 'function', 'compareTiers must be exported');
  const data = fixture();
  const simplify = (rows) => rows.map(({ school, from, to, change }) => ({ id: school.id, from, to, change })).sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(simplify(compareTiers(data, 2024, 2025)), [
    { id: 'S-1', from: 'Tier 3', to: 'Tier 2', change: 'improved' },
    { id: 'S-2', from: 'Tier 1', to: 'Tier 2', change: 'declined' },
    { id: 'S-3', from: null, to: 'Tier 3', change: 'unassessed' },
    { id: 'S-4', from: 'Tier 2', to: null, change: 'invalid' },
    { id: 'S-5', from: null, to: null, change: 'unassessed' },
  ]);
  assert.deepEqual(simplify(compareTiers(data, '2025', '2028', { owner: 'Rani' })), [
    { id: 'S-1', from: 'Tier 2', to: 'Tier 1', change: 'improved' },
    { id: 'S-3', from: 'Tier 3', to: null, change: 'unassessed' },
    { id: 'S-4', from: null, to: 'Tier 2', change: 'invalid' },
  ]);
  assert.equal(compareTiers(data, 2024, 2024, { schoolIds: ['S-1'] })[0].change, 'unchanged');
  assert.equal(compareTiers(data, 2028, 2024, { schoolIds: ['S-1'] })[0].change, 'declined');
  assert.ok(compareTiers(data, 2024, 2035).every((row) => row.change === 'unassessed'));
  assert.deepEqual(compareTiers(data, 2024, 2025, { schoolIds: [] }), []);
  assert.deepEqual(compareTiers(data, 2024, 2025, { tier: 'invalid' }).map(({ school }) => school.id), ['S-4'], 'comparison tier filtering uses the destination year by default');
});

test('normalization and selectors process 1000 schools / 10000 visits within 3 seconds', async (t) => {
  const { filterSchools, filterVisits, dashboardSummary, compareTiers } = await loadSelectors();
  const raw = {
    'Data Sekolah': [['ID Sekolah', 'Nama Sekolah', 'Daerah', 'Negeri/Swasta', 'Koordinator', 'Status Sekolah']],
    'Data Pic Sekolah': [['ID PIC', 'ID Sekolah', 'Nama PIC', 'Jabatan', 'Nomor WhatsApp', 'Status Kontak']],
    'Data Tier Sekolah': [['ID Sekolah', 'Tier 2024', 'Tier 2025', 'Tier 2028']],
    'Riwayat Kunjungan': [['ID Visit', 'Tanggal', 'ID Sekolah', 'Marketing pelaksana', 'Kegiatan', 'PIC yang ditemui', 'Hasil', 'Next Action', 'Tanggal Follow-up', 'Status Follow-up']],
  };
  for (let i = 0; i < 1000; i++) {
    raw['Data Sekolah'].push([`S-${i}`, `SMK Uji ${i}`, i % 2 ? 'Bantul' : 'Sleman', 'Negeri', i % 2 ? 'Rani' : 'Dewi', i % 2 ? 'Aktif' : 'Nonaktif']);
    raw['Data Tier Sekolah'].push([`S-${i}`, 'Tier 3', 'Tier 2', 'Tier 1']);
  }
  for (let i = 0; i < 10000; i++) raw['Riwayat Kunjungan'].push([
    `V-${i}`, `2026-10-${String(1 + i % 28).padStart(2, '0')}`, `S-${i % 1000}`, i % 2 ? 'Bima' : 'Dewi',
    'BK; Brosur', '', 'Tercatat', 'Hubungi', i % 2 ? '2026-10-23' : '2026-10-22', 'Belum Selesai',
  ]);
  const start = performance.now();
  const data = normalizeWorkbook(raw);
  assert.deepEqual(data.issues, []);
  assert.equal(data.schools.length, 1000);
  assert.equal(data.visits.length, 10000);
  assert.equal(filterSchools(data, { owner: 'Rani', year: 2028, tier: 'Tier 1', sort: 'last-visit' }).length, 500);
  assert.equal(filterVisits(data, { start: '2026-10-01', end: '2026-10-31', marketer: 'Bima', activity: 'BK' }).length, 5000);
  assert.deepEqual(dashboardSummary(data, { year: 2028, today: '2026-10-23' }), {
    totalSchools: 1000, activeSchools: 500, tier1: 1000, tier2: 0, tier3: 0, unassessed: 0, invalidTier: 0,
    visits: 10000, visitedSchools: 1000, followUpToday: 5000, followUpOverdue: 5000,
  });
  const comparison = compareTiers(data, 2024, 2028);
  assert.equal(comparison.length, 1000);
  assert.ok(comparison.every((row) => row.change === 'improved'));
  const elapsed = performance.now() - start;
  t.diagnostic(`1000 schools / 10000 visits: ${elapsed.toFixed(1)} ms (limit 3000 ms)`);
  assert.ok(elapsed <= 3000, `normalization and all selector paths took ${elapsed.toFixed(1)} ms`);
});

test('follow-up classification applies closed, invalid and missing-status precedence before dates', async () => {
  const { classifyFollowUp } = await loadSelectors();
  assert.equal(typeof classifyFollowUp, 'function', 'classifyFollowUp must be exported');
  const open = { nextAction: 'Hubungi BK', followUpStatus: 'Belum Selesai', followUpDate: '2026-10-23' };
  const cases = [
    [{}, 'today'],
    [{ followUpDate: '2026-10-22' }, 'overdue'],
    [{ followUpDate: '2026-10-24' }, 'upcoming'],
    [{ followUpDate: null }, 'unscheduled'],
    [{ followUpStatus: 'Selesai', invalidFollowUpDate: true }, 'completed'],
    [{ followUpStatus: ' dibatalkan ', invalidFollowUpDate: true }, 'cancelled'],
    [{ followUpDate: null, invalidFollowUpDate: true }, 'invalid'],
    [{ followUpDate: '2026-02-30' }, 'invalid'],
    [{ followUpDate: 'nonsense' }, 'invalid'],
    [{ followUpStatus: '' }, 'status-missing'],
    [{ followUpStatus: 'Tidak Dikenal' }, 'status-missing'],
    [{ followUpStatus: '', followUpDate: null }, 'status-missing'],
    [{ followUpStatus: '', nextAction: '' }, 'none'],
    [{ followUpStatus: '', nextAction: '', invalidFollowUpDate: true }, 'invalid'],
    [{ nextAction: '' }, 'today'],
  ];
  for (const [changes, expected] of cases) assert.equal(classifyFollowUp({ ...open, ...changes }, '2026-10-23'), expected, JSON.stringify(changes));
  assert.equal(classifyFollowUp({}, '2026-10-23'), 'none');
});

test('Jakarta today crosses midnight at 17:00 UTC without using the host timezone', async () => {
  const { jakartaToday } = await loadSelectors();
  assert.equal(typeof jakartaToday, 'function', 'jakartaToday must be exported');
  assert.equal(jakartaToday(new Date('2026-10-22T16:59:59Z')), '2026-10-22');
  assert.equal(jakartaToday(new Date('2026-10-22T17:00:00Z')), '2026-10-23');
  assert.equal(jakartaToday(new Date('2024-02-28T17:00:00Z')), '2024-02-29');
  assert.equal(jakartaToday(new Date('2026-12-31T17:00:00Z')), '2027-01-01');
});
