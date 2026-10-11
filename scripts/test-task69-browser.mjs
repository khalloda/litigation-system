import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { chromium } from 'playwright';
import ExcelJS from 'exceljs';
import { t } from '../src/strings.ts';
import { withTask69Fixture } from './lib/task69-runner.ts';
import { probeTask69AdminReport } from './lib/task69-admin-report-proof.ts';
import { administrativeReports } from '../src/lib/reports/administrative-reports.ts';
import { parseReportInput } from '../src/lib/reports/input.ts';
import { reportHtml, renderReportPdf } from '../src/lib/reports/pdf.ts';
import { renderReportExcel } from '../src/lib/reports/excel.ts';
import { cellText, validateReportData } from '../src/lib/reports/result.ts';
const started = new Date().toISOString();
const privateRoot = process.env.TASK69_PRIVATE_ROOT;
const output = process.env.TASK69_EVIDENCE_OUTPUT;
const evidenceRoot = dirname(output);
const out = join(evidenceRoot, 'browser-' + Date.now());
mkdirSync(out);
const operation = JSON.parse(readFileSync(join(privateRoot, 'sealed-operation.json')));
const d = JSON.parse(readFileSync(join(privateRoot, 'fixture-descriptor.json')));
const accounts = JSON.parse(readFileSync(join(privateRoot, 'fixture-logins.json')));
const admin = accounts.find((a) => a.role === 'Administrator');
const witnessed = JSON.parse(
  readFileSync(
    join(evidenceRoot, (process.env.TASK69_WITNESS_PREFIX ?? '') + 'combined-applied-state.json'),
  ),
);
assert.equal(d.database, 'litigation_task69_combined');
assert.equal(operation.operationId, witnessed.operationId);
const table = (name) => witnessed.tables['public.' + name];
const find = (name, id) => table(name).find((r) => r.id === id);
const results = [],
  errors = [],
  rejectedRequests = [];
let app,
  browser,
  context,
  base,
  appLog = '',
  auditStart;
const save = (name, value) =>
  writeFileSync(join(out, name + '.json'), JSON.stringify(value, null, 2) + '\n');
const pass = (name, detail = {}) => {
  results.push({ name, detail, at: new Date().toISOString() });
  save('progress', results);
  console.log('PASS ' + name);
};
const inspect = (work) => withTask69Fixture(operation, work);
async function start() {
  await inspect(async (db) =>
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int n FROM _migration.task69_receipt WHERE operation_id=$1 AND phase='apply'",
          [operation.operationId],
        )
      ).rows[0].n,
      3585,
    ),
  );
  auditStart = await inspect(
    async (db) => (await db.query('SELECT max(id)::text id FROM public.audit_events')).rows[0].id,
  );
  const sock = createServer();
  await new Promise((r) => sock.listen(0, '127.0.0.1', r));
  const port = sock.address().port;
  await new Promise((r) => sock.close(r));
  assert.notEqual(port, 3000);
  base = 'http://127.0.0.1:' + port;
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    AUTH_URL: base,
    AUTH_SECRET: randomBytes(48).toString('base64url'),
    AUTH_TRUST_HOST: 'true',
    REPORT_ASSET_ROOT: process.cwd(),
  };
  for (const k of ['MIGRATION_DATABASE_URL', 'POSTGRES_PASSWORD', 'NEXTAUTH_URL', 'NODE_OPTIONS'])
    delete env[k];
  assert.equal(new URL(env.DATABASE_URL).pathname, '/' + d.database);
  assert.equal(new URL(env.DATABASE_URL).port, String(d.port));
  app = spawn(
    process.execPath,
    [
      join(process.cwd(), 'node_modules/next/dist/bin/next'),
      'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    { cwd: process.cwd(), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  for (const stream of [app.stdout, app.stderr])
    stream.on('data', (b) => {
      appLog += b.toString().replace(/postgres(?:ql)?:\/\/[^\s]+/g, '[redacted connection]');
    });
  save('app-identity', {
    pid: app.pid,
    base,
    fixture: { cluster: d.cluster, database: d.database, port: d.port },
    ownerRequests: 0,
  });
  for (let i = 0; i < 150; i++) {
    assert.equal(app.exitCode, null);
    try {
      if ((await fetch(base + '/login')).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw Error('Fixture app did not become ready');
}
async function newPage(account) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'ar-EG',
  });
  await ctx.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === base || ['data:', 'blob:'].includes(url.protocol)) await route.continue();
    else {
      rejectedRequests.push(url.origin);
      await route.abort();
    }
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/login');
  await page.locator('[name=username]').fill(account.username);
  await page.locator('[name=password]').fill(account.password);
  await Promise.all([
    page.waitForURL((u) => u.pathname !== '/login'),
    page.locator('button[type=submit]').click(),
  ]);
  return { ctx, page };
}
async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
  const font = await page.locator('body').evaluate((e) => getComputedStyle(e).fontFamily);
  assert.match(font, /noto/i);
  await page.screenshot({ path: join(out, name + '.png'), fullPage: true });
  writeFileSync(join(out, name + '.txt'), await page.locator('main').innerText());
}
async function goto(page, path, screenshot) {
  assert(path.startsWith('/') && !path.startsWith('//'));
  const response = await page.goto(base + path, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200, path);
  assert.equal(new URL(page.url()).pathname, path.split('?')[0], path);
  if (screenshot) await capture(page, screenshot);
}
async function contains(page, text) {
  const actual = (await page.locator('main').innerText()).replace(/\r\n/g, '\n');
  if (!actual.includes(text.replace(/\r\n/g, '\n'))) {
    errors.push('Visible source value missing at ' + new URL(page.url()).pathname + ': ' + text);
    save('deferred-assertion-failures', errors);
  }
}

async function unchangedBrowserSave(page, path, label, tables) {
  const snapshot = () =>
    inspect(async (db) => {
      const result = {};
      for (const table of tables) {
        assert(/^[a-z_]+$/.test(table));
        result[table] = (
          await db.query('SELECT to_jsonb(t) value FROM public.' + table + ' t ORDER BY id')
        ).rows.map((r) => r.value);
      }
      return result;
    });
  const before = await snapshot();
  await Promise.all([
    page.waitForURL((u) => u.pathname === path),
    page.getByRole('button', { name: label, exact: true }).click(),
  ]);
  assert.deepEqual(
    await snapshot(),
    before,
    'Unchanged native browser submission preserves every business row/version and membership',
  );
  pass('Unchanged native browser save retains complete relationships', { path, tables });
}
async function reports(page, id, parameters, name, rowAssertions) {
  await goto(page, '/reports/' + id);
  for (const [key, value] of Object.entries(parameters))
    await page.locator('select[name="' + key + '"]').selectOption(String(value));
  const pending = page.waitForResponse(
    (r) => r.url() === base + '/reports/' + id + '/run' && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: t.reports.run, exact: true }).click();
  const response = await pending;
  assert.equal(response.status(), 200);
  const result = await response.json();
  save(name + '-preview', result);
  const rows = result.data.sections.flatMap((s) => s.groups.flatMap((g) => g.rows));
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
  await rowAssertions(result, rows);
  await page
    .getByRole('button', { name: t.reports.run, exact: true })
    .waitFor({ state: 'visible' });
  await capture(page, name + '-preview');
  const formats = {};
  for (const [format, label] of [
    ['xlsx', t.reports.xlsx],
    ['pdf', t.reports.pdf],
  ]) {
    const p = page.waitForResponse(
      (r) => r.url() === base + '/reports/' + id + '/export' && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: label, exact: true }).click();
    const exported = await p;
    if (exported.status() !== 200) {
      errors.push(name + ' ' + format + ' export HTTP ' + exported.status());
      save(name + '-' + format + '-failed-response', {
        status: exported.status(),
        body: await exported.text(),
      });
      save('deferred-assertion-failures', errors);
      continue;
    }
    const downloadLink = page.locator('a[download]');
    await downloadLink.waitFor({ state: 'visible' });
    const downloaded = page.waitForEvent('download');
    await downloadLink.click();
    const artifact = await downloaded;
    assert.equal(await artifact.failure(), null);
    assert(artifact.suggestedFilename().endsWith('.' + format));
    const artifactPath = join(out, name + '.' + format);
    await artifact.saveAs(artifactPath);
    const bytes = readFileSync(artifactPath);
    const sha = createHash('sha256').update(bytes).digest('hex');
    assert.equal(exported.headers()['x-artifact-sha256'], sha);
    formats[format] = { bytes: bytes.length, sha256: sha };
    if (format === 'pdf') assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    else {
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(bytes);
      assert(book.worksheets.every((s) => s.views.some((v) => v.rightToLeft)));
      assert.equal(book.getWorksheet(t.reports.infoSheet).getCell(3, 2).value, result.rowCount);
      const exact = new Map();
      book.getWorksheet(t.reports.exactSheet).eachRow((row, index) => {
        if (index === 1 || row.getCell(1).value === 'header') return;
        const key = String(row.getCell(1).value) + '|' + String(row.getCell(2).value);
        if (!exact.has(key)) exact.set(key, []);
        exact.get(key).push({
          type: row.getCell(3).value,
          part: Number(row.getCell(4).value),
          value: Buffer.from(String(row.getCell(5).value ?? ''), 'base64').toString('utf8'),
        });
      });
      let expectedCells = 0;
      for (const section of result.data.sections) {
        const columns = result.descriptor.sectionColumns?.[section.id] ?? result.descriptor.columns;
        for (const group of section.groups)
          for (const row of group.rows)
            for (const [i, cell] of row.cells.entries()) {
              const parts = exact.get(row.id + '|' + columns[i].key);
              assert(parts, 'Every preview cell exists in exact Excel data');
              parts.sort((a, b) => a.part - b.part);
              assert.deepEqual(
                parts.map((p) => p.part),
                parts.map((_, i) => i + 1),
              );
              assert(parts.every((p) => p.type === cell.type));
              assert.equal(
                parts.map((p) => p.value).join(''),
                cell.type === 'null' ? '' : String(cell.value),
                'Exact Excel/preview value and null/type agreement',
              );
              expectedCells++;
            }
      }
      assert.equal(exact.size, expectedCells, 'No missing, extra or duplicated data cells');

      const cells = book.worksheets.flatMap((s) => {
        const a = [];
        s.eachRow((r) => r.eachCell((c) => a.push(c.value)));
        return a;
      });
      for (const row of rows)
        for (const cell of row.cells)
          if (cell.type === 'text' || cell.type === 'identifier')
            assert(
              cells.some(
                (v) => String(v).replace(/\r\n/g, '\n') === cellText(cell).replace(/\r\n/g, '\n'),
              ),
              'Excel preserves full preview text',
            );
    }
    await page
      .getByRole('button', { name: t.reports.run, exact: true })
      .waitFor({ state: 'visible' });
  }
  const repeatedPreview = page.waitForResponse(
    (r) => r.url() === base + '/reports/' + id + '/run' && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: t.reports.run, exact: true }).click();
  const repeat = await repeatedPreview;
  assert.equal(repeat.status(), 200);
  const after = await repeat.json();
  assert.deepEqual(after.data, result.data, 'Stable data around both export requests');
  pass(
    name +
      (Object.keys(formats).length === 2
        ? ' real preview/Excel/Chromium PDF'
        : ' diagnostic partial exports — overall failure retained'),
    {
      id,
      rowCount: result.rowCount,
      previewRows: rows.length,
      formats,
    },
  );
}
async function main() {
  await start();
  browser = await chromium.launch({ headless: true });
  const created = await newPage(admin);
  context = created.ctx;
  const page = created.page;
  const task = table('admin_tasks').find((r) => r.legacy_id === 8971);
  assert(task);
  await goto(page, '/admin-works/' + task.id, 'multi-assignee-task');
  for (const id of [1, 22]) await contains(page, find('people', id).name_ar);
  await contains(page, task.required_work);
  await goto(page, '/admin-works/' + task.id + '/edit', 'multi-assignee-edit');
  assert.equal(await page.locator('input[type=checkbox]:checked').count(), 2);
  await unchangedBrowserSave(page, '/admin-works/' + task.id, t.common.save, [
    'admin_tasks',
    'admin_task_assignees',
    'task_actions',
  ]);
  for (const person of [1, 22]) {
    await goto(page, '/admin-works?person=' + person + '&q=8971', 'task-filter-' + person);
    assert.equal(await page.locator('[data-admin-id]').count(), 1);
    assert.equal(
      await page.locator('[data-admin-id]').getAttribute('data-admin-id'),
      String(task.id),
    );
    await contains(page, task.required_work);
  }
  pass('One task, two assignees, preserved NULL status, both filters and editable membership', {
    taskId: task.id,
  });
  // Independent expected pages are derived from the captured full table, not the query under test.
  const currentTasks = table('admin_tasks')
    .filter((r) => !r.is_archived)
    .sort((a, b) => {
      if (a.task_created_date === b.task_created_date) return b.id - a.id;
      if (a.task_created_date === null) return 1;
      if (b.task_created_date === null) return -1;
      return String(b.task_created_date).localeCompare(String(a.task_created_date));
    });
  const currentDocuments = table('documents')
    .filter((r) => !r.is_archived)
    .sort((a, b) => b.id - a.id);
  for (const [kind, records] of [
    ['admin-works', currentTasks],
    ['documents', currentDocuments],
  ]) {
    const pages = Math.max(1, Math.ceil(records.length / 25));
    const observed = [];
    for (const number of new Set([1, Math.min(2, pages), pages])) {
      await goto(page, '/' + kind + '?page=' + number, kind + '-page-' + number);
      const ids =
        kind === 'admin-works'
          ? await page
              .locator('[data-admin-id]')
              .evaluateAll((nodes) => nodes.map((n) => Number(n.dataset.adminId)))
          : await page
              .locator('main article h3 a')
              .evaluateAll((nodes) =>
                nodes.map((n) => Number(new URL(n.href).pathname.split('/').pop())),
              );
      assert.deepEqual(
        ids,
        records.slice((number - 1) * 25, number * 25).map((r) => r.id),
      );
      assert.equal(new Set(ids).size, ids.length);
      if (kind === 'admin-works') await contains(page, t.adminWorks.results(records.length));
      else await contains(page, t.documentsModule.results + ' · ' + records.length);
      observed.push({ page: number, ids });
    }
    assert.equal(
      new Set(observed.flatMap((x) => x.ids)).size,
      observed.flatMap((x) => x.ids).length,
    );
    pass(kind + ' distinct global count and exact first/second/final page identities', {
      total: records.length,
      pages,
      observed,
    });
  }
  const unassigned = table('task_actions')
    .filter((r) => r.task_id === null)
    .sort((a, b) => a.id - b.id);
  assert.equal(unassigned.length, 39);
  const seenUnassigned = [];
  for (let n = 1; n <= Math.ceil(unassigned.length / 25); n++) {
    await goto(page, '/admin-works/unassigned-steps?page=' + n, 'unassigned-steps-page-' + n);
    await contains(page, t.adminWorks.stepCount(unassigned.length));
    const headings = await page.locator('main ol li h2').allTextContents();
    assert.deepEqual(
      headings,
      unassigned.slice((n - 1) * 25, n * 25).map((r) => t.adminWorks.stepIdentity(r.id)),
    );
    seenUnassigned.push(...headings);
  }
  assert.equal(new Set(seenUnassigned).size, 39);
  pass('All 39 genuine NULL-parent steps remain distinct across both browser pages');
  const peopleGroups = Map.groupBy(
    table('document_responsible_people').filter((r) => !r.is_retired),
    (r) => r.document_id,
  );
  const matterGroups = Map.groupBy(
    table('document_matters').filter((r) => !r.is_retired),
    (r) => r.document_id,
  );
  const multiPeople = [...peopleGroups].find(([, a]) => a.length > 1)[0];
  const multiMatters = [...matterGroups].find(([, a]) => a.length > 1)[0];
  for (const id of new Set([multiPeople, multiMatters, 109, 173, 185])) {
    await goto(page, '/documents/' + id, 'document-' + id);
    for (const m of peopleGroups.get(id) ?? [])
      await contains(page, find('people', m.person_id).name_ar);
    for (const m of matterGroups.get(id) ?? [])
      await contains(page, find('matters', m.matter_id).case_number_ar ?? String(m.matter_id));
    await goto(page, '/documents/' + id + '/edit', 'document-edit-' + id);
    if (id === multiPeople || id === multiMatters)
      await unchangedBrowserSave(page, '/documents/' + id, t.documentsModule.save, [
        'documents',
        'document_matters',
        'document_responsible_people',
      ]);
  }
  async function checkDocumentFilter(key, value, target) {
    const memberships = table(
      key === 'person' ? 'document_responsible_people' : 'document_matters',
    );
    const field = key === 'person' ? 'person_id' : 'matter_id';
    const memberIds = new Set(
      memberships.filter((m) => !m.is_retired && m[field] === value).map((m) => m.document_id),
    );
    const expected = currentDocuments.filter((d) => memberIds.has(d.id)).map((d) => d.id);
    const seen = [];
    for (let n = 1; n <= Math.max(1, Math.ceil(expected.length / 25)); n++) {
      await goto(page, '/documents?' + key + '=' + value + '&page=' + n);
      await contains(page, t.documentsModule.results + ' · ' + expected.length);
      const ids = await page
        .locator('main article h3 a')
        .evaluateAll((nodes) =>
          nodes.map((n) => Number(new URL(n.href).pathname.split('/').pop())),
        );
      assert.deepEqual(ids, expected.slice((n - 1) * 25, n * 25));
      seen.push(...ids);
    }
    assert.deepEqual(seen, expected);
    assert.equal(new Set(seen).size, seen.length);
    assert.equal(seen.filter((id) => id === target).length, 1);
    pass('Document ' + key + ' filter exact full pagination and unique target', {
      value,
      total: seen.length,
      target,
    });
  }
  for (const m of peopleGroups.get(multiPeople))
    await checkDocumentFilter('person', m.person_id, multiPeople);
  for (const m of matterGroups.get(multiMatters))
    await checkDocumentFilter('matter', m.matter_id, multiMatters);
  pass('Multi-person and multi-matter document detail/edit/filter retain one document each', {
    multiPeople,
    multiMatters,
  });
  for (const id of [2003, 2085]) {
    await goto(page, '/matters/' + id, 'qualified-parties-' + id);
    await goto(page, '/matters/' + id + '/edit', 'qualified-parties-edit-' + id);
  }
  for (const id of [2003, 2085]) {
    const matter = find('matters', id);
    const expectedParties = table('matter_parties').filter(
      (p) => p.matter_id === id && !p.is_retired,
    );
    await reports(
      page,
      'client-status',
      { client: String(matter.client_id), extra_mode: 'all', extra_status: 'all' },
      'qualified-party-report-' + id,
      async (result, rows) => {
        const match = rows.find((r) => r.id === 'matter:' + id);
        assert(match, 'Protected matter is in actual all-status preview');
        const visible = match.cells.map(cellText).join('\n');
        for (const party of expectedParties) {
          assert(visible.includes(party.party_name));
          if (party.explanatory_text) assert(visible.includes(party.explanatory_text));
          for (const role of table('matter_party_roles').filter(
            (r) => r.party_id === party.id && !r.is_retired,
          )) {
            if (role.display_label) assert(visible.includes(role.display_label));
            if (role.qualifier) assert(visible.includes(role.qualifier));
          }
        }
      },
    );
  }
  for (const [fee, matter] of [
    [93, 1765],
    [286, 2347],
  ]) {
    const scope = table('fee_letter_matter_scopes').find((s) =>
      table('fee_letter_matters').some(
        (m) => m.id === s.id && m.fee_letter_id === fee && m.matter_id === matter,
      ),
    );
    assert(scope);
    for (const path of [
      '/fee-letters/' + fee,
      '/fee-letters/' + fee + '/covered',
      '/fee-letters?covered=' + matter,
      '/matters/' + matter,
    ]) {
      await goto(page, path, 'scope-' + fee + '-' + encodeURIComponent(path).replaceAll('%', ''));
      await contains(page, scope.covered_proceeding);
      await contains(page, t.feeScope.limitation);
    }
    // The letter field editor edits original wording; the covered-link editor above consumes forward scope.
    await goto(page, '/fee-letters/' + fee + '/edit', 'fee-wording-edit-' + fee);
    const wording = find('fee_letters', fee).contract_details;
    const editorValues = await page
      .locator('textarea')
      .evaluateAll((nodes) => nodes.map((n) => n.value));
    assert(
      editorValues.some((v) => v.replace(/\r\n/g, '\n') === wording.replace(/\r\n/g, '\n')),
      'Original engagement wording is editable without losing lines',
    );
    await reports(
      page,
      'fee-letter-engagements',
      { matter: String(matter), client: '' },
      'fee-scope-' + fee,
      async (r, rows) => {
        const record = rows.find((r) => r.id === 'fee-letter:' + fee);
        assert(record);
        const text = record.cells.map(cellText).join('\n');
        assert(text.includes(scope.original_work));
        assert(text.includes(scope.covered_proceeding));
        assert(text.includes(scope.excluded_stages));
      },
    );
  }
  for (const id of new Set([multiPeople, multiMatters]))
    await reports(
      page,
      'document-movement-card',
      { document: String(id) },
      'document-report-' + id,
      async (r, rows) => {
        assert.equal(r.rowCount, 1);
        assert.equal(rows[0].id, 'document:' + id);
        for (const m of peopleGroups.get(id) ?? [])
          assert(
            rows[0].cells.map(cellText).join('\n').includes(find('people', m.person_id).name_ar),
          );
        for (const m of matterGroups.get(id) ?? [])
          assert(
            rows[0].cells
              .map(cellText)
              .join('\n')
              .includes(find('matters', m.matter_id).case_number_ar),
          );
      },
    );
  await reports(
    page,
    'administrative-by-destination',
    { destination: String(task.destination_id) },
    'administrative-empty-selection',
    async (r, rows) => {
      assert.equal(r.rowCount, 0);
      assert.equal(rows.length, 0);
    },
  );
  // Actual native workflow inside a rolled-back transaction exercises the full multi-assignee report.
  const proof = await inspect(async (db) => {
    await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    try {
      return await probeTask69AdminReport(db, admin.claims, task.id);
    } finally {
      await db.query('ROLLBACK');
    }
  });
  const descriptor = administrativeReports.find(
    (x) => x.descriptor.id === 'administrative-by-destination',
  ).descriptor;
  const parameters = parseReportInput(
    descriptor,
    new URLSearchParams({ format: 'preview', destination: String(task.destination_id) }),
  ).parameters;
  const result = {
    descriptor,
    parameters,
    filterLabels: [],
    data: proof.selectedData,
    generatedAt: new Date().toISOString(),
    operationId: randomUUID(),
    rowCount: validateReportData(descriptor, proof.selectedData),
  };
  const session = {
    user: { ...admin.claims, id: String(admin.claims.userId) },
    expires: new Date(admin.claims.absoluteExpiresAt).toISOString(),
  };
  const html = await reportHtml(result, session);
  const rendered = await context.newPage();
  await rendered.setContent(html.html);
  await rendered.evaluate(() => document.fonts.ready);
  await rendered.screenshot({
    path: join(out, 'multi-assignee-transaction-report.png'),
    fullPage: true,
  });
  await rendered.close();
  writeFileSync(
    join(out, 'multi-assignee-transaction-report.pdf'),
    await renderReportPdf(result, session),
  );
  writeFileSync(
    join(out, 'multi-assignee-transaction-report.xlsx'),
    await renderReportExcel(result),
  );
  save('multi-assignee-transaction-report', {
    result,
    scope:
      'Production query/native gateways inside rolled-back fixture transaction; source NULL status and empty selections restored',
    proof,
  });
  pass(
    'Multi-assignee report and both export renderers use exact native gateway result; original status/selection rolled back',
  );
  const browserAudit = await inspect(
    async (db) =>
      (
        await db.query(
          'SELECT id::text,occurred_at,action,outcome,entity_table,entity_key,actor_id,request_id,audit_session_id,resource_identifier FROM public.audit_events WHERE id>$1 ORDER BY id',
          [auditStart],
        )
      ).rows,
  );
  save('fixture-browser-audit', {
    afterId: auditStart,
    events: browserAudit,
    scope:
      'Genuine fixture sign-in, no-change editor submissions and exact browser/report requests; owner actions NOT_APPLIED',
  });
  assert.equal(rejectedRequests.length, 0);
  assert.deepEqual(errors, []);
  const final = {
    status: 'PASS',
    started,
    completed: new Date().toISOString(),
    operationId: operation.operationId,
    base,
    fixture: { database: d.database, cluster: d.cluster, port: d.port },
    results,
    errors,
    rejectedRequests,
    ownerActions: 'NOT_APPLIED',
    pdfCopying: 'Accepted limitation; no copying/search diagnosis',
    output: out,
  };
  writeFileSync(output, JSON.stringify(final, null, 2) + '\n');
}
main()
  .catch((e) => {
    save('failure', { at: new Date().toISOString(), message: e.message, stack: e.stack, results });
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await context?.close();
    await browser?.close();
    if (app && app.exitCode === null && app.signalCode === null) {
      const closed = new Promise((resolve) => app.once('close', resolve));
      app.kill();
      await closed;
    }
    save('app-cleanup', {
      pid: app?.pid,
      base,
      closed: !app || app.exitCode !== null || app.signalCode !== null,
      exitCode: app?.exitCode,
      signalCode: app?.signalCode,
      at: new Date().toISOString(),
      scope: 'Only the task-owned candidate app and its Playwright browser',
    });
    writeFileSync(join(out, 'app.log'), appLog);
  });
