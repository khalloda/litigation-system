import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { createDatabaseClient } from '../src/lib/db.ts';
import {
  readBilling,
  readBillingRecord,
  parseBillingFilters,
  BillingFilterError,
} from '../src/lib/billing-query.ts';
import { prepareHearingLifecycleActors } from './lib/hearing-lifecycle-actors.ts';
import { withApprovedMigrationClient } from './lib/migration-principal.ts';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture.ts';
import { setMaintenanceAuditContext } from './lib/audit-maintenance-context.ts';
import { billingStructureFailures } from './lib/billing-structure.ts';
import { hasPermission } from '../src/lib/auth/permissions.ts';
import { setFixtureStaffActive } from './lib/staff-roster-test-adapter.ts';
import { hashPassword } from '../src/lib/auth/password.ts';
import { changeOwnPassword } from '../src/lib/auth/service.ts';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata.ts';

// Independent oracle: fetch base tables separately; join in memory by identity.
// No production builder/projection/normalizer is imported into this derivation.
export async function billingOracle(db) {
  const fetch = async (sql) => (await db.query(sql)).rows;
  const invoices = await fetch(
    'SELECT id,legacy_id,invoice_no,fee_letter_id,currency,amount::text,invoice_date::text,status_id,type_id,details FROM invoices ORDER BY id DESC',
  );
  const payments = await fetch(
    'SELECT id,legacy_id,invoice_id,currency,credit::text,debit::text,payment_date::text,details FROM payments ORDER BY id DESC',
  );
  const fees = new Map(
    (await fetch('SELECT id,client_id,contract_id::text,is_archived FROM fee_letters')).map((r) => [
      r.id,
      r,
    ]),
  );
  const clients = new Map(
    (await fetch('SELECT id,name_ar,name_en,is_archived FROM clients')).map((r) => [r.id, r]),
  );
  const statuses = new Map(
    (await fetch('SELECT id,label_ar FROM lookup_invoice_status')).map((r) => [r.id, r.label_ar]),
  );
  const types = new Map(
    (await fetch('SELECT id,label_ar FROM lookup_invoice_type')).map((r) => [r.id, r.label_ar]),
  );
  const people = new Map(
    (await fetch('SELECT id,name_ar,is_active FROM people')).map((r) => [r.id, r]),
  );
  const roles = new Map(
    (await fetch('SELECT id,label_ar FROM lookup_lawyer_share_role')).map((r) => [
      r.id,
      r.label_ar,
    ]),
  );
  const allocationSource = await fetch(
    'SELECT id,invoice_id,person_id,lawyer_role_id,share::text FROM invoice_allocations ORDER BY id DESC',
  );
  const byInvoice = new Map(invoices.map((r) => [r.id, r]));
  const view = (r, kind) => {
    const i = kind === 'invoices' ? r : byInvoice.get(r.invoice_id);
    const f = fees.get(i?.fee_letter_id),
      c = clients.get(f?.client_id);
    return {
      id: r.id,
      legacyId: r.legacy_id,
      invoiceId: i?.id ?? null,
      invoiceNo: i?.invoice_no ?? null,
      feeId: f?.id ?? null,
      contractId: f?.contract_id ?? null,
      clientId: c?.id ?? null,
      clientName: c?.name_ar ?? null,
      clientArchived: c?.is_archived ?? null,
      feeArchived: f?.is_archived ?? null,
      date: kind === 'invoices' ? r.invoice_date : r.payment_date,
      currency: r.currency,
      amount: kind === 'invoices' ? r.amount : null,
      credit: kind === 'payments' ? r.credit : null,
      debit: kind === 'payments' ? r.debit : null,
      status: statuses.get(i?.status_id) ?? null,
      type: types.get(i?.type_id) ?? null,
      details: r.details,
    };
  };
  return {
    invoices: invoices.map((r) => view(r, 'invoices')),
    payments: payments.map((r) => view(r, 'payments')),
    allocations: allocationSource.map((r) => ({
      invoiceId: r.invoice_id,
      record: {
        id: r.id,
        personId: r.person_id,
        personName: people.get(r.person_id)?.name_ar ?? null,
        active: people.get(r.person_id)?.is_active ?? null,
        role: roles.get(r.lawyer_role_id) ?? null,
        share: r.share,
      },
    })),
    source: {
      invoices,
      payments,
      fees: [...fees.values()],
      clients: [...clients.values()],
      statuses: [...statuses],
      types: [...types],
      people: [...people.values()],
      roles: [...roles],
      allocations: allocationSource,
    },
  };
}
export async function proveBillingReadOnly(fixture, output, capture) {
  const save = (name, data) =>
    writeFileSync(join(output, name + '.json'), JSON.stringify(data, null, 2) + '\n');
  const runtime = createDatabaseClient(fixture.runtimeUrl);
  const evidence = [];
  const inspect = (work) =>
    withApprovedMigrationClient(work, { databaseUrl: fixture.migrationUrl });
  const mark = (name, data = {}) => {
    evidence.push({ name, ...data });
    save('service-results', evidence);
  };
  try {
    await inspect((db) =>
      assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment),
    );
    await prepareHearingLifecycleActors(fixture, runtime);
    const accounts = await runtime.userAccount.findMany({
      select: {
        id: true,
        username: true,
        personId: true,
        roleCode: true,
        sessionVersion: true,
        mustChangePassword: true,
      },
    });
    assert.equal(accounts.length, 4);
    assert.equal(new Set(accounts.map((a) => a.roleCode)).size, 4);
    const sessions = accounts.map((a) => ({
      user: {
        id: String(a.id),
        personId: a.personId,
        role: a.roleCode,
        sessionVersion: a.sessionVersion,
        mustChangePassword: false,
        name: 'TEST ONLY',
        username: a.username,
      },
      expires: '2099-01-01T00:00:00Z',
    }));
    const original = await inspect(billingOracle);
    save('historical-oracle', original);
    assert.equal(original.invoices.length, 543);
    assert.equal(original.payments.length, 597);
    assert.equal(original.allocations.length, 47);
    const readBefore = await capture(fixture.migrationUrl);
    save('reads-before', readBefore);
    for (const session of sessions) {
      for (const kind of ['invoices', 'payments']) {
        const expected = original[kind];
        const got = [];
        for (let page = 1; page <= Math.ceil(expected.length / 25); page++) {
          const result = await readBilling(session, kind, { page: String(page) }, runtime);
          assert.deepEqual(result.rows, expected.slice((page - 1) * 25, page * 25));
          assert.equal(result.total, expected.length);
          got.push(...result.rows.map((r) => r.id));
        }
        assert.deepEqual(
          got,
          expected.map((r) => r.id),
        );
        for (const record of expected) {
          const detail = await readBillingRecord(session, kind, String(record.id), runtime);
          assert.deepEqual(detail.record, record);
          if (kind === 'invoices') {
            assert.deepEqual(
              detail.payments,
              original.payments.filter((p) => p.invoiceId === record.id).slice(0, 25),
            );
            assert.deepEqual(
              detail.allocations,
              original.allocations
                .filter((a) => a.invoiceId === record.id)
                .map((a) => a.record)
                .slice(0, 25),
            );
          }
        }
        mark(session.user.role + ' complete ' + kind, {
          orderedIds: got,
          details: expected.length,
        });
      }
      for (const action of ['create', 'update', 'delete', 'archive', 'restore'])
        assert.equal(hasPermission(session.user.role, 'billing', action), false);
    }
    const session = sessions[0];
    const expectedQueries = [];
    await inspect(async (db) => {
      for (const kind of ['invoices', 'payments']) {
        const p = kind === 'invoices' ? 'i' : 'p',
          date = kind === 'invoices' ? 'invoice_date' : 'payment_date';
        const joins =
          kind === 'invoices'
            ? 'invoices i LEFT JOIN fee_letters f ON f.id=i.fee_letter_id LEFT JOIN clients c ON c.id=f.client_id'
            : 'payments p LEFT JOIN invoices i ON i.id=p.invoice_id LEFT JOIN fee_letters f ON f.id=i.fee_letter_id LEFT JOIN clients c ON c.id=f.client_id';
        const cases = [
          { params: {}, sql: 'TRUE', values: [] },
          { params: { date: 'missing' }, sql: `${p}.${date} IS NULL`, values: [] },
          { params: { date: 'present' }, sql: `${p}.${date} IS NOT NULL`, values: [] },
          {
            params: { from: '2015-01-01', to: '2021-12-31' },
            sql: `${p}.${date} BETWEEN $1::date AND $2::date`,
            values: ['2015-01-01', '2021-12-31'],
          },
        ];
        const columns = {
          client: 'c.id',
          fee: 'f.id',
          currency: `${p}.currency`,
          ...(kind === 'invoices'
            ? { status: 'i.status_id', type: 'i.type_id' }
            : { invoice: 'i.id' }),
        };
        for (const [key, column] of Object.entries(columns)) {
          cases.push({ params: { [key]: 'missing' }, sql: `${column} IS NULL`, values: [] });
          const values = (
            await db.query(
              `SELECT DISTINCT ${column} v FROM ${joins} WHERE ${column} IS NOT NULL ORDER BY 1`,
            )
          ).rows;
          for (const { v } of values)
            cases.push({
              params: { [key]: key === 'currency' ? 'v:' + v : String(v) },
              sql: `${column}=$1`,
              values: [v],
            });
        }
        const i = original.invoices.find((r) => r.clientId && r.feeId && r.currency);
        cases.push({
          params: {
            client: String(i.clientId),
            fee: String(i.feeId),
            currency: 'v:' + i.currency,
            from: '0001-01-01',
            to: '9999-12-31',
          },
          sql: `c.id=$1 AND f.id=$2 AND ${p}.currency=$3 AND ${p}.${date} BETWEEN $4::date AND $5::date`,
          values: [i.clientId, i.feeId, i.currency, '0001-01-01', '9999-12-31'],
        });
        for (const q of [
          'أحمد',
          'احمد',
          'أَحـمد',
          '%',
          '_',
          '\\',
          '140J',
          '140ق',
          '21819',
          '٢١٨١٩',
          '218',
          '021819',
          '21819x',
          '21352',
        ]) {
          cases.push({
            params: { q },
            sql: `(${p}.id::text=ar_normalise($1) OR ${p}.legacy_id::text=ar_normalise($1) OR strpos(ar_normalise(concat_ws(' ',i.invoice_no,f.contract_id,c.name_ar,c.name_en,${p}.details)),ar_normalise($1))>0)`,
            values: [q],
          });
        }
        for (const c of cases) {
          const expected = (
            await db.query(
              `SELECT ${p}.id FROM ${joins} WHERE ${c.sql} ORDER BY ${p}.id DESC`,
              c.values,
            )
          ).rows.map((r) => r.id);
          const all = [];
          for (let page = 1; page <= Math.max(1, Math.ceil(expected.length / 25)); page++) {
            const got = await readBilling(
              session,
              kind,
              { ...c.params, page: String(page) },
              runtime,
            );
            assert.equal(got.total, expected.length);
            all.push(...got.rows.map((r) => r.id));
          }
          assert.deepEqual(all, expected, JSON.stringify(c.params));
          expectedQueries.push({
            kind,
            params: c.params,
            sql: c.sql,
            values: c.values,
            orderedIds: expected,
          });
        }
      }
    });
    save('filter-oracle', expectedQueries);
    mark('Independent filters and intersections', { cases: expectedQueries.length });
    for (const kind of ['invoices', 'payments']) {
      for (const params of [
        { q: ['x', 'y'] },
        { foreign: 'x' },
        { page: '0' },
        { page: '1.2' },
        { page: '1e2' },
        { page: '9'.repeat(30) },
        { client: '-1' },
        { client: '01' },
        { client: '9999999999' },
        { q: 'x'.repeat(161) },
        { q: '\u0000' },
        { from: '2025-02-29' },
        { from: '2026-01-01', to: '2025-01-01' },
        { date: 'missing', from: '2020-01-01' },
        { currency: '' },
        { date: 'no' },
      ])
        assert.throws(() => parseBillingFilters(kind, params), BillingFilterError);
      for (const params of [
        { client: '2147483647' },
        { fee: '2147483647' },
        { currency: 'v:unknown_fixture_currency' },
      ])
        await assert.rejects(readBilling(session, kind, params, runtime), BillingFilterError);
      const clamped = await readBilling(session, kind, { page: '999999999999999' }, runtime);
      assert.equal(clamped.filters.page, clamped.pages);
      assert.ok(clamped.clamped);
      assert.equal(await readBillingRecord(session, kind, '2147483647', runtime), null);
    }
    for (const bad of [
      null,
      { ...session, expires: '2000-01-01T00:00:00Z' },
      { ...session, user: { ...session.user, id: 'garbage' } },
      { ...session, user: { ...session.user, id: '2147483647' } },
      { ...session, user: { ...session.user, personId: 2147483647 } },
      { ...session, user: { ...session.user, sessionVersion: session.user.sessionVersion + 1 } },
      {
        ...session,
        user: {
          ...session.user,
          role: session.user.role === 'Administrator' ? 'Lawyer' : 'Administrator',
        },
      },
      { ...session, user: { ...session.user, mustChangePassword: true } },
    ]) {
      for (const kind of ['invoices', 'payments']) {
        await assert.rejects(readBilling(bad, kind, {}, runtime), /Access denied/u);
        await assert.rejects(readBillingRecord(bad, kind, '1', runtime), /Access denied/u);
      }
    }
    const readAfter = await capture(fixture.migrationUrl);
    save('reads-after', readAfter);
    for (const key of ['tables', 'sequences', 'catalogs', 'ledger'])
      assert.deepEqual(readAfter[key], readBefore[key], key);
    mark('Historical reads and service refusals preserve complete database state');
    await inspect(async (db) => {
      assert.deepEqual(await billingStructureFailures(db), []);
      await db.query('BEGIN');
      await setMaintenanceAuditContext(db, 'task48-security-proofs');
      const refusals = [];
      const refuse = async (sql, values = [], pattern) => {
        await db.query('SAVEPOINT denied');
        let code;
        try {
          await db.query(sql, values);
          assert.fail('Expected denial: ' + sql);
        } catch (e) {
          if (e.code === undefined) throw e;
          code = e.code;
          if (pattern) assert.match(e.message, pattern);
        } finally {
          await db.query('ROLLBACK TO SAVEPOINT denied');
        }
        refusals.push({ sql, code });
      };
      for (const table of ['invoices', 'payments', 'invoice_allocations']) {
        await refuse(
          `UPDATE ${table} SET updated_at=now() WHERE legacy_source_record_key IS NOT NULL`,
          [],
          /migrated billing history/u,
        );
        await refuse(
          `DELETE FROM ${table} WHERE legacy_source_record_key IS NOT NULL`,
          [],
          /migrated billing history/u,
        );
        await refuse(
          `INSERT INTO ${table}(legacy_id,updated_at) VALUES(987654321,now())`,
          [],
          /check constraint/u,
        );
        await refuse(
          `INSERT INTO ${table}(legacy_source_payload,updated_at) VALUES('{}',now())`,
          [],
          /check constraint/u,
        );
      }
      await db.query('ROLLBACK');
      save('legacy-provenance-refusals', refusals);
    });
    const sqlRuntime = new Client({ connectionString: fixture.runtimeUrl });
    await sqlRuntime.connect();
    try {
      const denied = [];
      for (const sql of [
        'DELETE FROM invoices WHERE id=-1',
        'TRUNCATE payments',
        "SELECT setval('invoices_id_seq',1)",
        'SELECT * FROM _migration.tasks46_47_import',
        'SELECT audit_set_migration_context()',
      ]) {
        await sqlRuntime.query('BEGIN');
        let code;
        try {
          await sqlRuntime.query(sql);
          assert.fail('Expected SQL denial ' + sql);
        } catch (e) {
          if (!e.code) throw e;
          code = e.code;
          assert.ok(['42501', 'P0001'].includes(code), e.message);
        } finally {
          await sqlRuntime.query('ROLLBACK');
        }
        denied.push({ sql, code });
      }
      save('runtime-sql-refusals', denied);
    } finally {
      await sqlRuntime.end();
    }
    mark('Direct SQL denied operations and imported/null-safe provenance checks');
    const liveDenials = [];
    const tested = sessions.find((s) => s.user.role === 'Lawyer');
    assert.ok(tested);
    const restoreFixtureAccount = async () => {
      const temporary = randomBytes(32).toString('base64url');
      const hash = await hashPassword(temporary);
      await inspect(async (db) => {
        await db.query('BEGIN');
        await setMaintenanceAuditContext(db, 'task48-fixture-reactivation');
        await db.query(
          'UPDATE user_accounts SET is_enabled=true,password_hash=$2,must_change_password=true,password_changed_at=clock_timestamp(),failed_login_attempts=0,locked_until=NULL,session_version=session_version+1 WHERE id=$1',
          [Number(tested.user.id), hash],
        );
        await db.query('COMMIT');
      });
      const forced = await runtime.userAccount.findUniqueOrThrow({
        where: { id: Number(tested.user.id) },
        select: { sessionVersion: true },
      });
      assert.equal(
        await changeOwnPassword(
          {
            accountId: Number(tested.user.id),
            sessionVersion: forced.sessionVersion,
            currentPassword: temporary,
            newPassword: randomBytes(32).toString('base64url'),
          },
          { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
        ),
        'changed',
      );
    };
    for (const field of ['is_enabled', 'must_change_password', 'session_version']) {
      const patch = {
        [field]:
          field === 'is_enabled'
            ? false
            : field === 'must_change_password'
              ? true
              : tested.user.sessionVersion + 1,
      };
      await inspect(async (db) => {
        await db.query('BEGIN');
        await setMaintenanceAuditContext(db, 'task48-live-auth-fixture');
        const [key, value] = Object.entries(patch)[0];
        await db.query(
          `UPDATE user_accounts SET ${key}=$1${key === 'session_version' ? '' : ',session_version=session_version+1'} WHERE id=$2`,
          [value, Number(tested.user.id)],
        );
        await db.query('COMMIT');
      });
      for (const kind of ['invoices', 'payments'])
        await assert.rejects(readBilling(tested, kind, {}, runtime), /Access denied/u);
      if (field !== 'session_version') {
        const current = await runtime.userAccount.findUniqueOrThrow({
          where: { id: Number(tested.user.id) },
          select: { sessionVersion: true },
        });
        const freshVersion = {
          ...tested,
          user: { ...tested.user, sessionVersion: current.sessionVersion },
        };
        for (const kind of ['invoices', 'payments'])
          await assert.rejects(readBilling(freshVersion, kind, {}, runtime), /Access denied/u);
      }
      liveDenials.push(Object.keys(patch)[0]);
      await restoreFixtureAccount();
      tested.user.sessionVersion = (
        await runtime.userAccount.findUniqueOrThrow({
          where: { id: Number(tested.user.id) },
          select: { sessionVersion: true },
        })
      ).sessionVersion;
    }
    mark(
      'Current disabled/reset/session-version checks against committed fixture account changes',
      { liveDenials },
    );
    const adminAccount = accounts.find((a) => a.roleCode === 'Administrator');
    assert.ok(adminAccount);
    await setFixtureStaffActive(runtime, adminAccount.id, tested.user.personId, false);
    for (const kind of ['invoices', 'payments'])
      await assert.rejects(readBilling(tested, kind, {}, runtime), /Access denied/u);
    await setFixtureStaffActive(runtime, adminAccount.id, tested.user.personId, true);
    await restoreFixtureAccount();
    tested.user.sessionVersion = (
      await runtime.userAccount.findUniqueOrThrow({
        where: { id: Number(tested.user.id) },
        select: { sessionVersion: true },
      })
    ).sessionVersion;
    mark('Inactive-person direct billing service refusals, then fixture eligibility restored');
    // Native edge fixtures stay solely on the disposable cluster, after immutable historical proof.
    const fixtureRows = await inspect(async (db) => {
      await db.query('BEGIN');
      await setMaintenanceAuditContext(db, 'task48-native-edge-fixtures');
      const fee = (
        await db.query(
          'SELECT id,contract_id FROM fee_letters WHERE contract_id IS NOT NULL ORDER BY id LIMIT 1',
        )
      ).rows[0];
      assert.ok(fee);
      const made = [];
      for (let d = 0; d < 10; d++) {
        const id = 765432100 + d,
          legacy = 876543210 + d;
        await db.query(
          `INSERT INTO invoices(id,invoice_no,amount,currency,details,updated_at) VALUES($1,'TEST ONLY native',CASE WHEN $2=0 THEN NULL WHEN $2=1 THEN 0 WHEN $2=2 THEN 0.01 ELSE 999999999999.99 END,CASE WHEN $2=0 THEN NULL WHEN $2=1 THEN '' ELSE 'TEST' END,$3,now())`,
          [id, d, d === 0 ? 'TEST ONLY أحمد %_\\ ' + 'نص طويل '.repeat(80) : 'TEST ONLY'],
        );
        await db.query(
          `INSERT INTO payments(id,credit,debit,currency,payment_date,details,updated_at) VALUES($1,CASE WHEN $2=0 THEN NULL ELSE 0 END,CASE WHEN $2=0 THEN 0.01 ELSE 999999999999.99 END,'TEST',CASE WHEN $2=0 THEN NULL ELSE DATE '2099-01-01' END,'TEST ONLY',now())`,
          [id, d],
        );
        await db.query(
          `INSERT INTO invoices(id,legacy_id,invoice_no,fee_letter_id,legacy_contract_id,legacy_currency_raw,legacy_source_record_key,legacy_source_extraction_sha256,legacy_source_payload,updated_at) VALUES($1,$2,'TEST ONLY legacy',$5,$6,'TEST',$3,$4,'{"test":"fixture"}',now())`,
          [
            id + 100,
            legacy,
            String(d).padStart(64, '0') + ':000001',
            'F'.repeat(64),
            fee.id,
            fee.contract_id,
          ],
        );
        await db.query(
          `INSERT INTO payments(id,legacy_id,invoice_id,legacy_invoice_no,legacy_source_record_key,legacy_source_extraction_sha256,legacy_source_payload,updated_at) VALUES($1,$2,$1,'TEST ONLY legacy',$3,$4,'{"test":"fixture"}',now())`,
          [id + 100, legacy, String(d + 20).padStart(64, '0') + ':000001', 'F'.repeat(64)],
        );
        made.push({ id, legacy, legacyInternal: id + 100 });
      }
      await db.query('COMMIT');
      return made;
    });
    save('edge-fixtures', fixtureRows);
    const digits = (s) => s.replace(/[0-9]/gu, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
    for (const kind of ['invoices', 'payments'])
      for (const f of fixtureRows) {
        for (const [id, expected] of [
          [f.id, f.id],
          [f.legacy, f.legacyInternal],
        ])
          for (const q of [String(id), digits(String(id))]) {
            const got = await readBilling(session, kind, { q }, runtime);
            assert.deepEqual(
              got.rows.map((r) => r.id),
              [expected],
            );
          }
        for (const q of [
          String(f.id).slice(0, -1),
          '0' + f.id,
          f.id + 'x',
          String(f.legacy).slice(0, -1),
          '0' + f.legacy,
          f.legacy + 'x',
        ])
          assert.equal((await readBilling(session, kind, { q }, runtime)).total, 0);
      }
    await inspect(async (db) => {
      const admin = accounts.find((a) => a.roleCode === 'Administrator');
      assert.ok(admin);
      const args = [admin.id, admin.sessionVersion, admin.roleCode, '2099-01-01T00:00:00Z'];
      const parent = (
        await db.query(
          `SELECT f.id,f.client_id FROM fee_letters f JOIN clients c ON c.id=f.client_id WHERE NOT f.is_archived AND NOT c.is_archived AND EXISTS(SELECT 1 FROM invoices WHERE fee_letter_id=f.id) ORDER BY f.id LIMIT 1`,
        )
      ).rows[0];
      assert.ok(parent);
      await db.query('BEGIN');
      await db.query('SELECT audit_set_human_context($1)', [admin.id]);
      await db.query('SELECT audit_set_event_context($1,$2,$3,NULL,$4,$5)', [
        randomUUID(),
        randomUUID(),
        randomUUID(),
        'task48-parent-fixture',
        'system',
      ]);
      const state = (
        await db.query('SELECT fee_letter_edit_state($1,$2,$3,$4,$5) state', [...args, parent.id])
      ).rows[0].state;
      const result = (
        await db.query('SELECT fee_letter_edit_save($1,$2,$3,$4,$5) result', [
          ...args,
          {
            operation: 'archive',
            id: parent.id,
            version: state.record.version,
            submission: randomUUID(),
            values: {},
            related: null,
            facts: state.record.facts,
          },
        ])
      ).rows[0].result;
      assert.equal(result.changed, true);
      const client = (
        await db.query('SELECT row_version::text version FROM clients WHERE id=$1', [
          parent.client_id,
        ])
      ).rows[0];
      await db.query("SELECT client_contact_set_archived('clients',$1,$2,true)", [
        parent.client_id,
        client.version,
      ]);
      await db.query('COMMIT');
      await db.query('BEGIN');
      await setMaintenanceAuditContext(db, 'task48-bounded-related-fixtures');
      const inactive = (
        await db.query('SELECT id FROM people WHERE NOT is_active ORDER BY id LIMIT 1')
      ).rows[0];
      assert.ok(inactive, 'existing inactive person for native fixture');
      for (let n = 0; n < 26; n++)
        await db.query(
          `INSERT INTO invoice_allocations(invoice_id,person_id,lawyer_role_id,share,updated_at) VALUES(765432100,$1,(SELECT id FROM lookup_lawyer_share_role WHERE code='LawyerA+'),$2,now())`,
          [n === 0 ? inactive.id : null, n === 0 ? '1' : '0'],
        );
      for (let n = 0; n < 27; n++)
        await db.query(
          `INSERT INTO payments(invoice_id,credit,debit,currency,payment_date,details,updated_at) VALUES(765432100,0,NULL,'TEST',DATE '2099-01-01','TEST ONLY linked',now())`,
        );
      await db.query('COMMIT');
      save('archived-parent-fixture', { parent, result, inactive });
    });
    const edgeOracle = await inspect(billingOracle);
    save('edge-oracle', edgeOracle);
    for (const q of ['%', '_', '\\', 'أَحـمد']) {
      const expected = await inspect(async (db) =>
        (
          await db.query(
            `SELECT i.id FROM invoices i LEFT JOIN fee_letters f ON f.id=i.fee_letter_id LEFT JOIN clients c ON c.id=f.client_id WHERE i.id::text=ar_normalise($1) OR i.legacy_id::text=ar_normalise($1) OR strpos(ar_normalise(concat_ws(' ',i.invoice_no,f.contract_id,c.name_ar,c.name_en,i.details)),ar_normalise($1))>0 ORDER BY i.id DESC`,
            [q],
          )
        ).rows.map((r) => r.id),
      );
      const got = await readBilling(session, 'invoices', { q }, runtime);
      assert.deepEqual(
        got.rows.map((r) => r.id),
        expected.slice(0, 25),
      );
      assert.equal(got.total, expected.length);
      assert.ok(expected.includes(765432100));
    }
    for (const reader of sessions) {
      const first = await readBillingRecord(reader, 'invoices', '765432100', runtime, '1');
      const second = await readBillingRecord(reader, 'invoices', '765432100', runtime, '2');
      assert.equal(first.paymentCount, 27);
      assert.equal(first.payments.length, 25);
      assert.equal(first.allocationCount, 26);
      assert.equal(first.allocations.length, 25);
      assert.equal(second.allocations.length, 1);
      assert.deepEqual(
        [...first.allocations, ...second.allocations],
        edgeOracle.allocations.filter((a) => a.invoiceId === 765432100).map((a) => a.record),
      );
      const archived = edgeOracle.invoices.find((i) => i.clientArchived && i.feeArchived);
      assert.ok(archived);
      assert.deepEqual(
        (await readBillingRecord(reader, 'invoices', String(archived.id), runtime)).record,
        archived,
      );
      const emptyCurrency = await readBilling(reader, 'invoices', { currency: 'v:' }, runtime);
      assert.deepEqual(
        emptyCurrency.rows.map((r) => r.id),
        [765432101],
      );
    }
    mark(
      'Archived parents, inactive linked allocation, 26-share pagination, 27 linked payments, empty currency and future native dates',
    );
    for (const kind of ['invoices', 'payments']) {
      const actual = await readBilling(session, kind, { q: 'TEST ONLY' }, runtime);
      assert.deepEqual(
        actual.rows,
        edgeOracle[kind]
          .filter(
            (r) =>
              (r.details ?? '').includes('TEST ONLY') || (r.invoiceNo ?? '').includes('TEST ONLY'),
          )
          .slice(0, 25),
      );
    }
    mark(
      'Exact Western/Arabic digits 0–9 in isolated internal and legacy branches; partial/suffixed/leading-zero IDs excluded',
      { fixtureRows },
    );
  } finally {
    await runtime.$disconnect();
  }
}
