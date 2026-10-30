import test from 'node:test';
import assert from 'node:assert/strict';

const loadDomain = () => import('../shared/data.mjs');

function workbook() {
  return {
    'Data Sekolah': [
      ['ID Sekolah', 'Nama Sekolah', 'Daerah', 'Negeri/Swasta', 'Koordinator/Marketing Penanggung Jawab', 'Status Sekolah'],
      ['S-001', 'SMK Harapan', 'Bantul', 'Swasta', 'Rani', 'Aktif'],
    ],
    'Data Pic Sekolah': [['ID PIC', 'ID Sekolah', 'Nama PIC', 'Jabatan', 'Nomor WhatsApp', 'Status Kontak']],
    'Data Tier Sekolah': [['ID Sekolah', 'Tier 2024', 'Tier 2025']],
    'Riwayat Kunjungan': [['ID Visit', 'Tanggal', 'ID Sekolah', 'Marketing pelaksana', 'Kegiatan', 'PIC yang ditemui', 'Hasil', 'Next Action', 'Tanggal Follow-up', 'Status Follow-up']],
  };
}

test('normalizes the PRD school headers into exact-ID school records', async () => {
  const { normalizeWorkbook } = await loadDomain();
  assert.equal(typeof normalizeWorkbook, 'function', 'normalizeWorkbook must be exported');
  const raw = workbook();
  const before = structuredClone(raw);
  const data = normalizeWorkbook(raw);
  assert.deepEqual(data.schools, [{
    id: 'S-001', name: 'SMK Harapan', region: 'Bantul', ownership: 'Swasta',
    owner: 'Rani', status: 'Aktif', lastVisitDate: null, source: { tab: 'Data Sekolah', row: 2 },
  }]);
  assert.deepEqual(data.pics, []);
  assert.deepEqual(data.tiers, []);
  assert.deepEqual(data.visits, []);
  assert.deepEqual(data.issues, []);
  assert.equal(data.hasFatalIssues, false);
  assert.deepEqual(raw, before, 'normalization must not mutate source rows');
});

test('normalizes related PICs, dynamic tier years and visits without conflating the two marketers', async () => {
  const { normalizeWorkbook } = await loadDomain();
  for (const nextActionHeader of ['Next Action', 'Tindak Lanjut']) {
    const raw = workbook();
    raw['Data Pic Sekolah'].push(['P-01', 'S-001', 'Ibu Guru', 'BK', '081234567890', 'Aktif']);
    raw['Data Tier Sekolah'][0].push('Tier 2028', 'Tier 28', 'Tier 20290', 'Not Tier 2027');
    raw['Data Tier Sekolah'].push(['S-001', 'Tier 3', 'Tier 2', 'Tier 1']);
    raw['Riwayat Kunjungan'][0][7] = nextActionHeader;
    raw['Riwayat Kunjungan'].push(
      ['V-02', '2026-10-23', 'S-001', 'Bima', 'Silaturahmi BK; Titip brosur, Sosialisasi\nTitip brosur', 'Ibu Guru', 'Diizinkan', 'Hubungi BK', '2026-10-24', 'Belum Selesai'],
      ['V-01', '2026-10-20', 'S-001', 'Dewi', 'Silaturahmi BK', '', 'Tercatat', '', '', ''],
    );
    const data = normalizeWorkbook(raw);
    assert.deepEqual(data.issues, []);
    assert.deepEqual(data.years, [2024, 2025, 2028]);
    assert.deepEqual(data.pics, [{ id: 'P-01', schoolId: 'S-001', name: 'Ibu Guru', position: 'BK', whatsapp: '081234567890', status: 'Aktif', source: { tab: 'Data Pic Sekolah', row: 2 } }]);
    assert.deepEqual(data.tiers, [
      { schoolId: 'S-001', year: 2024, tier: 'Tier 3', source: { tab: 'Data Tier Sekolah', row: 2 } },
      { schoolId: 'S-001', year: 2025, tier: 'Tier 2', source: { tab: 'Data Tier Sekolah', row: 2 } },
      { schoolId: 'S-001', year: 2028, tier: 'Tier 1', source: { tab: 'Data Tier Sekolah', row: 2 } },
    ]);
    assert.deepEqual(data.visits[0], {
      id: 'V-02', date: '2026-10-23', schoolId: 'S-001', marketer: 'Bima',
      activities: ['Silaturahmi BK', 'Titip brosur', 'Sosialisasi'], pic: 'Ibu Guru', result: 'Diizinkan',
      nextAction: 'Hubungi BK', followUpDate: '2026-10-24', followUpStatus: 'Belum Selesai',
      source: { tab: 'Riwayat Kunjungan', row: 2 },
    });
    assert.equal(data.schools[0].owner, 'Rani');
    assert.equal(data.schools[0].lastVisitDate, '2026-10-23');
    assert.equal(data.visits[1].followUpDate, null);
  }
});

test('accepts the observed PIC header spellings without inferring a school relationship', async () => {
  const { normalizeWorkbook } = await loadDomain();
  const raw = workbook();
  raw['Data Pic Sekolah'] = [
    ['ID PIC', 'ID Sekolah', 'Nama PIC', 'Jabatan', 'Nomer WhatsApp', 'Statusm Kontak'],
    ['P-01', 'S-001', 'Guru Contoh', 'BK', '001234567890', 'Aktif'],
  ];
  const before = structuredClone(raw);
  const data = normalizeWorkbook(raw);
  assert.equal(data.hasFatalIssues, false);
  assert.deepEqual(data.issues, []);
  assert.equal(data.pics.length, 1);
  assert.equal(data.pics[0].schoolId, 'S-001');
  assert.equal(data.pics[0].whatsapp, '001234567890');
  assert.equal(data.pics[0].status, 'Aktif');
  assert.deepEqual(raw, before);

  for (const alias of ['Nomor WhatsApp', 'Status Kontak']) {
    const ambiguous = structuredClone(raw);
    ambiguous['Data Pic Sekolah'][0].push(alias);
    const rejected = normalizeWorkbook(ambiguous);
    assert.equal(rejected.hasFatalIssues, true);
    assert.ok(rejected.issues.some((issue) => issue.code === 'AMBIGUOUS_HEADER' && issue.tab === 'Data Pic Sekolah'));
  }

  raw['Data Pic Sekolah'][0][1] = 'Nama Sekolah';
  const missingId = normalizeWorkbook(raw);
  assert.equal(missingId.hasFatalIssues, true);
  assert.ok(missingId.issues.some((issue) => issue.code === 'MISSING_HEADER' && issue.column === 'ID Sekolah'));
  assert.deepEqual(missingId.pics, []);
});

test('excludes every ambiguous school copy and dangling exact-ID reference with source rows', async () => {
  const { normalizeWorkbook } = await loadDomain();
  const raw = workbook();
  raw['Data Sekolah'].push(
    ['S-001', 'Duplikat', 'Sleman', 'Negeri', 'Dewi', 'Aktif'],
    ['S-002', 'SMK Sah', 'Bantul', 'Swasta', 'Rani', 'Nonaktif'],
    ['', 'Tanpa identitas', '', '', '', ''],
    ['S-003', '', '', '', '', ''],
    [],
  );
  raw['Data Pic Sekolah'].push(
    ['P-1', 'S-001', 'Guru', 'BK', '081234567890', 'Aktif'],
    ['P-2', 'SMK Sah', 'Guru', 'BK', '089999999999', 'Aktif'],
    ['P-3', 's-002', 'Guru', 'BK', '088888888888', 'Aktif'],
    ['P-4', 'S-002', 'Guru', 'BK', '087777777777', 'Aktif'],
  );
  raw['Data Tier Sekolah'].push(['S-001', 'Tier 1', 'Tier 2'], ['S-002', 'Tier 3', 'Tier 2']);
  raw['Riwayat Kunjungan'].push(
    ['V-1', '2026-10-23', 'S-001', 'Bima', 'BK', '', '', '', '', ''],
    ['V-2', '2026-10-22', 'SMK Sah', 'Bima', 'BK', '', '', '', '', ''],
    ['V-3', '2026-10-21', 'S-002', 'Bima', 'BK', '', '', '', '', ''],
  );
  const data = normalizeWorkbook(raw);
  assert.deepEqual(data.schools.map((school) => school.id), ['S-002']);
  assert.deepEqual(data.pics.map((pic) => pic.id), ['P-4']);
  assert.deepEqual(data.tiers.map((tier) => tier.schoolId), ['S-002', 'S-002']);
  assert.deepEqual(data.visits.map((visit) => visit.id), ['V-3']);
  assert.equal(data.schools[0].lastVisitDate, '2026-10-21');
  assert.deepEqual(data.issues.filter((issue) => issue.code === 'DUPLICATE_SCHOOL_ID').map((issue) => issue.row), [2, 3]);
  assert.ok(data.issues.some((issue) => issue.tab === 'Data Sekolah' && issue.row === 5 && issue.column === 'ID Sekolah'));
  assert.ok(data.issues.some((issue) => issue.tab === 'Data Sekolah' && issue.row === 6 && issue.column === 'Nama Sekolah'));
  for (const [tab, row] of [['Data Pic Sekolah', 2], ['Data Pic Sekolah', 3], ['Data Pic Sekolah', 4], ['Data Tier Sekolah', 2], ['Riwayat Kunjungan', 2], ['Riwayat Kunjungan', 3]]) {
    assert.ok(data.issues.some((issue) => issue.tab === tab && issue.row === row && issue.column === 'ID Sekolah'), `${tab}:${row}`);
  }
  assert.equal(data.hasFatalIssues, false, 'row-level issues do not invalidate the schema');
  assert.ok(!JSON.stringify(data.issues).match(/081234567890|089999999999|SMK Sah|S-001/));
  for (const issue of data.issues) {
    assert.deepEqual(Object.keys(issue).sort(), ['code', 'column', 'message', 'row', 'severity', 'tab']);
    assert.ok(['error', 'warning'].includes(issue.severity));
  }
});

test('strictly parses calendar dates and Sheets serials while excluding invalid visit dates', async () => {
  const { normalizeWorkbook } = await loadDomain();
  const raw = workbook();
  const valid = [
    ['2024-02-29', '2024-02-29'], ['29/2/2024', '2024-02-29'], ['23-10-2026', '2026-10-23'],
    [45351, '2024-02-29'], ['46318', '2026-10-23'], [36585, '2000-02-29'],
  ];
  const invalid = ['2023-02-29', '1900-02-29', '2100-02-29', '31/04/2026', '2026-13-01', '2026-00-01', '2026-01-00', '2026-04-31', '02/29/2024', '2026-2-9', '23/10/26', '2026-10-23T00:00:00Z', 'October 23, 2026', '', '081234567890', -1, NaN, Infinity, true, null];
  for (const [index, [date]] of valid.entries()) raw['Riwayat Kunjungan'].push([`valid-${index}`, date, 'S-001', 'Bima', 'BK', '', '', '', '', '']);
  for (const [index, date] of invalid.entries()) raw['Riwayat Kunjungan'].push([`bad-${index}`, date, 'S-001', 'Bima', 'BK', '', '', '', '', '']);
  const data = normalizeWorkbook(raw);
  assert.deepEqual(data.visits.map((visit) => visit.date), valid.map(([, expected]) => expected));
  assert.equal(data.issues.filter((issue) => issue.code === 'INVALID_VISIT_DATE').length, invalid.length);
  assert.equal(data.schools[0].lastVisitDate, '2026-10-23');
  assert.ok(data.issues.filter((issue) => issue.code === 'INVALID_VISIT_DATE').every((issue) => issue.column === 'Tanggal' && issue.row >= 8));
  assert.ok(!JSON.stringify(data.issues).includes('081234567890'));
});

test('invalid follow-up dates stay explicit and do not become unscheduled', async () => {
  const { normalizeWorkbook } = await loadDomain();
  const raw = workbook();
  raw['Riwayat Kunjungan'].push(
    ['F-1', '2026-10-23', 'S-001', 'Bima', 'BK', '', '', 'Hubungi', '31/02/2026', 'Belum Selesai'],
    ['F-2', '2026-10-23', 'S-001', 'Bima', 'BK', '', '', 'Hubungi', '', 'Belum Selesai'],
    ['F-3', '2026-10-23', 'S-001', 'Bima', 'BK', '', '', 'Hubungi', 46318, 'Belum Selesai'],
  );
  const data = normalizeWorkbook(raw);
  assert.equal(data.visits.length, 3);
  assert.equal(data.visits[0].followUpDate, null);
  assert.equal(data.visits[0].invalidFollowUpDate, true);
  assert.equal(data.visits[1].followUpDate, null);
  assert.notEqual(data.visits[1].invalidFollowUpDate, true);
  assert.equal(data.visits[2].followUpDate, '2026-10-23');
  assert.deepEqual(data.issues.filter((issue) => issue.code === 'INVALID_FOLLOW_UP_DATE').map(({ row, column }) => ({ row, column })), [{ row: 2, column: 'Tanggal Follow-up' }]);
});

test('duplicate visit IDs keep the first valid visit and never inflate last-visit dates', async () => {
  const { normalizeWorkbook } = await loadDomain();
  const raw = workbook();
  raw['Riwayat Kunjungan'].push(
    ['V-SAME', '2026-02-30', 'S-001', 'Bima', 'BK', '', '', '', '', ''],
    ['V-SAME', '2026-10-20', 'S-001', 'Bima', 'BK', '', '', '', '', ''],
    ['V-SAME', '2026-12-31', 'S-001', 'Dewi', 'Brosur', '', '', '', '', ''],
    ['', '2026-10-21', 'S-001', 'Bima', 'BK', '', '', '', '', ''],
    ['v-same', '2026-10-22', 'S-001', 'Dewi', 'BK', '', '', '', '', ''],
    [],
  );
  const data = normalizeWorkbook(raw);
  assert.deepEqual(data.visits.map(({ id, date, source }) => ({ id, date, row: source.row })), [
    { id: 'V-SAME', date: '2026-10-20', row: 3 }, { id: 'v-same', date: '2026-10-22', row: 6 },
  ]);
  assert.equal(data.schools[0].lastVisitDate, '2026-10-22');
  assert.deepEqual(data.issues.filter((issue) => issue.code === 'DUPLICATE_VISIT_ID').map((issue) => issue.row), [2, 3, 4]);
  assert.ok(data.issues.some((issue) => issue.row === 5 && issue.column === 'ID Visit' && issue.code === 'MISSING_REQUIRED_FIELD'));
});

test('invalid tier values are explicit invalid records rather than unassessed or leaked values', async () => {
  const { normalizeWorkbook } = await loadDomain();
  const raw = workbook();
  raw['Data Tier Sekolah'][0] = ['ID Sekolah', 'Tier 2028', 'Tier 2024', 'Tier 2025', 'Tier 2026', 'Tier 2027', 'Tier 2029', 'Tier 2030'];
  raw['Data Tier Sekolah'].push(['S-001', 'Tier 1', '', 'Tier 4', 1, '081234567890', false, 0]);
  const data = normalizeWorkbook(raw);
  assert.deepEqual(data.years, [2024, 2025, 2026, 2027, 2028, 2029, 2030]);
  assert.deepEqual(data.tiers.map(({ year, tier, invalid }) => ({ year, tier, invalid: invalid === true })), [
    { year: 2024, tier: null, invalid: false },
    { year: 2025, tier: null, invalid: true },
    { year: 2026, tier: null, invalid: true },
    { year: 2027, tier: null, invalid: true },
    { year: 2028, tier: 'Tier 1', invalid: false },
    { year: 2029, tier: null, invalid: true },
    { year: 2030, tier: null, invalid: true },
  ]);
  assert.deepEqual(data.issues.filter((issue) => issue.code === 'INVALID_TIER').map((issue) => issue.column), ['Tier 2025', 'Tier 2026', 'Tier 2027', 'Tier 2029', 'Tier 2030']);
  assert.ok(!JSON.stringify(data.issues).includes('081234567890'));
});

test('follow-up status gaps remain visible as safe source issues instead of silently completed work', async () => {
  const { normalizeWorkbook } = await loadDomain();
  const raw = workbook();
  raw['Riwayat Kunjungan'].push(
    ['F-1', '2026-10-23', 'S-001', 'Bima', 'BK', '', '', 'Hubungi', '2026-10-24', ''],
    ['F-2', '2026-10-23', 'S-001', 'Bima', 'BK', '', '', 'Hubungi', '', '081234567890'],
    ['F-3', '2026-10-23', 'S-001', 'Bima', 'BK', '', '', '', '', ''],
    ['F-4', '2026-10-23', 'S-001', 'Bima', 'BK', '', '', 'Hubungi', '', ' selesai '],
  );
  const data = normalizeWorkbook(raw);
  assert.equal(data.visits.length, 4);
  assert.equal(data.visits[0].followUpStatus, '');
  assert.equal(data.visits[1].followUpStatus, '081234567890');
  assert.equal(data.visits[3].followUpStatus, 'Selesai');
  assert.deepEqual(data.issues.map(({ code, row, column, severity }) => ({ code, row, column, severity })), [
    { code: 'MISSING_FOLLOW_UP_STATUS', row: 2, column: 'Status Follow-up', severity: 'warning' },
    { code: 'UNKNOWN_FOLLOW_UP_STATUS', row: 3, column: 'Status Follow-up', severity: 'warning' },
  ]);
  assert.ok(!JSON.stringify(data.issues).includes('081234567890'));
});

test('ambiguous tier rows stay invalid instead of selecting a conflicting year value', async () => {
  const { normalizeWorkbook } = await loadDomain();
  const raw = workbook();
  raw['Data Tier Sekolah'].push(['S-001', 'Tier 1', 'Tier 2'], ['S-001', 'Tier 3', '']);
  const data = normalizeWorkbook(raw);
  assert.equal(data.tiers.length, 2);
  assert.ok(data.tiers.every((entry) => entry.invalid === true && entry.tier === null));
  assert.deepEqual(data.issues.filter((issue) => issue.code === 'DUPLICATE_TIER_ROW').map((issue) => issue.row), [2, 3]);
  assert.equal(data.hasFatalIssues, false);
});

test('duplicate mandatory aliases or year columns are fatal rather than silently choosing a column', async () => {
  const { normalizeWorkbook } = await loadDomain();
  for (const [tab, header] of [['Data Sekolah', 'Koordinator'], ['Data Pic Sekolah', 'ID PIC'], ['Data Tier Sekolah', 'Tier 2025'], ['Riwayat Kunjungan', 'Tindak Lanjut']]) {
    const raw = workbook();
    raw[tab][0].push(header);
    const data = normalizeWorkbook(raw);
    assert.equal(data.hasFatalIssues, true, `${tab}: ${header}`);
    assert.ok(data.issues.some((issue) => issue.code === 'AMBIGUOUS_HEADER' && issue.tab === tab && issue.row === 1));
    assert.deepEqual(data.schools, [], 'fatal schemas must not return a partially trusted dataset');
  }
});

test('PIC identity gaps and duplicate IDs are excluded without exposing contacts in issues', async () => {
  const { normalizeWorkbook } = await loadDomain();
  const raw = workbook();
  raw['Data Pic Sekolah'].push(
    ['P-DUP', 'S-001', 'Guru Satu', 'BK', '081234567890', 'Aktif'],
    ['P-DUP', 'S-001', 'Guru Dua', 'BK', '089999999999', 'Aktif'],
    ['', 'S-001', 'Guru Tiga', 'BK', '088888888888', 'Aktif'],
    ['P-NAME', 'S-001', '', 'BK', '087777777777', 'Aktif'],
    ['P-GOOD', 'S-001', 'Guru Empat', 'BK', '001234567890', 'Aktif'],
    [],
  );
  const data = normalizeWorkbook(raw);
  assert.deepEqual(data.pics.map(({ id, whatsapp }) => ({ id, whatsapp })), [{ id: 'P-GOOD', whatsapp: '001234567890' }]);
  assert.deepEqual(data.issues.filter((issue) => issue.code === 'DUPLICATE_PIC_ID').map((issue) => issue.row), [2, 3]);
  assert.ok(data.issues.some((issue) => issue.row === 4 && issue.column === 'ID PIC'));
  assert.ok(data.issues.some((issue) => issue.row === 5 && issue.column === 'Nama PIC'));
  assert.ok(!JSON.stringify(data.issues).match(/081234567890|089999999999|088888888888|087777777777/));
});

test('missing mandatory headers or tabs are fatal with source-only safe issues', async () => {
  const { normalizeWorkbook } = await loadDomain();
  const base = workbook();
  for (const [tab, rows] of Object.entries(base)) {
    const headers = tab === 'Data Tier Sekolah' ? ['ID Sekolah', 'Tier 2024', 'Tier 2025'] : rows[0];
    for (const header of headers) {
      const raw = structuredClone(base);
      if (tab === 'Data Tier Sekolah' && header.startsWith('Tier ')) {
        raw[tab][0] = ['ID Sekolah', '081234567890'];
      } else {
        raw[tab][0] = raw[tab][0].filter((value) => value !== header);
      }
      const data = normalizeWorkbook(raw);
      assert.equal(data.hasFatalIssues, true, `${tab}: ${header}`);
      assert.ok(data.issues.some((issue) => issue.code === 'MISSING_HEADER' && issue.tab === tab && issue.row === 1 && issue.severity === 'error'));
      assert.ok(!JSON.stringify(data.issues).includes('081234567890'));
    }
    const raw = structuredClone(base);
    delete raw[tab];
    const data = normalizeWorkbook(raw);
    assert.equal(data.hasFatalIssues, true, tab);
    assert.ok(data.issues.some((issue) => issue.code === 'MISSING_TAB' && issue.tab === tab && issue.row === 1));
  }
});

test('maps reordered school columns and the PRD responsible-marketer aliases', async () => {
  const { normalizeWorkbook } = await loadDomain();
  for (const ownerHeader of ['Koordinator', 'Marketing Penanggung Jawab', 'Koordinator atau marketing penanggung jawab', 'Koordinator / Marketing Penanggung Jawab']) {
    const raw = workbook();
    raw['Data Sekolah'] = [
      [' status sekolah ', ownerHeader, 'Nama Sekolah', 'ID Sekolah', 'Negeri / Swasta', ' DAERAH '],
      ['Aktif', 'Dewi', 'SMK Alias', 'EXACT-01', 'Negeri', 'Sleman'],
    ];
    const data = normalizeWorkbook(raw);
    assert.deepEqual(data.schools.map(({ id, name, owner, region, ownership }) => ({ id, name, owner, region, ownership })), [
      { id: 'EXACT-01', name: 'SMK Alias', owner: 'Dewi', region: 'Sleman', ownership: 'Negeri' },
    ], ownerHeader);
  }
});
