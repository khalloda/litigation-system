import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client, type ClientBase } from 'pg';
import { withApprovedMigrationClient, migrationDatabaseTarget } from './lib/migration-principal';
import { assertTasks46_47Boundary } from './lib/tasks46-47-checkpoint';
import { parseDocumentForm, DocumentMutationError } from '../src/lib/document-mutation-input';
import { parseFeeLetterForm, FeeLetterMutationError } from '../src/lib/fee-letter-mutation-input';

const base = process.env.MIGRATION_DATABASE_URL;
assert.ok(base, 'MIGRATION_DATABASE_URL required');
const url = new URL(base);
const requested = process.env.TASKS46_47_TEST_DATABASE;
assert.ok(
  requested && /^litigation_t4647_[a-z0-9_]+$/u.test(requested),
  'explicit disposable TASKS46_47_TEST_DATABASE required',
);
assert.notEqual(requested, 'litigation');
url.pathname = '/' + requested;
const databaseUrl = url.toString();
assert.equal(migrationDatabaseTarget(databaseUrl).database, requested);

type Account = { id: number; session: number; role: string };
const expires = '2099-01-01T00:00:00Z';
const accounts = {
  lawyer: { id: 1, session: 1, role: 'Lawyer' },
  administrator: { id: 2, session: 4, role: 'Administrator' },
  assistant: { id: 3, session: 1, role: 'Litigation Assistant' },
  paralegal: { id: 4, session: 1, role: 'Paralegal' },
} satisfies Record<string, Account>;

async function context(db: ClientBase, account: Account) {
  await db.query('SELECT public.audit_set_human_context($1)', [account.id]);
  await db.query('SELECT public.audit_set_event_context($1,$2,$3,NULL,$4,$5)', [
    randomUUID(),
    randomUUID(),
    randomUUID(),
    'tasks-4-6-4-7-disposable-proof',
    'system',
  ]);
}
async function activateDisposableAssistant(db: ClientBase) {
  await context(db, accounts.administrator);
  const row = (
    await db.query(
      `UPDATE user_accounts target SET
      password_hash=source.password_hash,password_changed_at=statement_timestamp(),
      must_change_password=false,failed_login_attempts=0,locked_until=NULL,
      session_version=target.session_version+1
      FROM user_accounts source WHERE target.id=$1 AND source.id=$2
      RETURNING target.session_version`,
      [accounts.assistant.id, accounts.administrator.id],
    )
  ).rows[0];
  assert.ok(row, 'disposable assistant fixture account');
  accounts.assistant.session = row.session_version;
}
const request = (
  operation: string,
  id: number | null,
  version: string | null,
  values: Record<string, unknown>,
  related: unknown = null,
  facts: unknown = null,
  submission = randomUUID(),
) => ({ operation, id, version, submission, values, related, facts });

async function gateway(
  db: ClientBase,
  name: 'document_edit_save' | 'fee_letter_edit_save' | 'matter_fee_reference_edit_save',
  account: Account,
  payload: ReturnType<typeof request>,
) {
  return (
    await db.query(`SELECT public.${name}($1,$2,$3,$4,$5) result`, [
      account.id,
      account.session,
      account.role,
      expires,
      payload,
    ])
  ).rows[0].result as { id: number; version: string; changed: boolean };
}
async function state(db: ClientBase, name: string, account: Account, id: number) {
  return (
    await db.query(`SELECT public.${name}($1,$2,$3,$4,$5) state`, [
      account.id,
      account.session,
      account.role,
      expires,
      id,
    ])
  ).rows[0].state;
}
async function rejected(db: ClientBase, work: () => Promise<unknown>, pattern: RegExp) {
  await db.query('SAVEPOINT expected_refusal');
  await assert.rejects(work, pattern);
  await db.query('ROLLBACK TO SAVEPOINT expected_refusal');
}
function parserProof() {
  const duplicate = new FormData();
  duplicate.set(
    'payload',
    `{"operation":"create","operation":"update","id":null,"version":null,"submission":"${randomUUID()}","values":{},"related":null,"facts":null}`,
  );
  assert.throws(() => parseDocumentForm('create', duplicate), DocumentMutationError);
  assert.throws(() => parseFeeLetterForm('create', duplicate), FeeLetterMutationError);
  const oversized = new FormData();
  oversized.set('payload', 'x'.repeat(200001));
  assert.throws(() => parseDocumentForm('create', oversized), DocumentMutationError);
  assert.throws(() => parseFeeLetterForm('create', oversized), FeeLetterMutationError);
  console.log('PASS strict mutation parsing: duplicate keys and oversized forms refused');
}

async function functionalProof() {
  await withApprovedMigrationClient(
    async (db) => {
      assert.equal((await db.query('SELECT current_database() db')).rows[0].db, requested);
      await assertTasks46_47Boundary(db, 'historical-full-state-upgrade');
      assert.deepEqual(
        (
          await db.query(
            'SELECT id,role_code role,session_version session FROM user_accounts ORDER BY id',
          )
        ).rows,
        Object.values(accounts),
        'all four copied fixture roles and session versions',
      );
      const client = (
        await db.query('SELECT id FROM clients WHERE NOT is_archived ORDER BY id LIMIT 1')
      ).rows[0].id as number;
      const matter = (
        await db.query(`SELECT m.id FROM matters m WHERE NOT m.is_archived AND NOT EXISTS(
          SELECT 1 FROM matter_fee_letter_references r WHERE r.matter_id=m.id AND NOT r.is_retired)
          ORDER BY m.id LIMIT 1`)
      ).rows[0].id as number;
      const person = (
        await db.query('SELECT id FROM people WHERE is_active AND is_staff ORDER BY id LIMIT 1')
      ).rows[0].id as number;

      await db.query('BEGIN');
      try {
        for (const account of [accounts.lawyer, accounts.paralegal]) {
          await context(db, account);
          await rejected(
            db,
            () =>
              db.query('SELECT public.document_edit_state($1,$2,$3,$4,NULL)', [
                account.id,
                account.session,
                account.role,
                expires,
              ]),
            /authorized document\/fee-letter session/u,
          );
        }
        await activateDisposableAssistant(db);
        await context(db, accounts.assistant);
        const submission = randomUUID();
        const createPayload = request(
          'create',
          null,
          null,
          {
            description: 'document fixture\nsecond line',
            client_id: client,
            matter_id: matter,
            responsible_person_id: person,
            document_date: '2024-02-29',
            page_count: 0,
            deposit_date: null,
            notes: '',
            mfiles_id: '0',
          },
          null,
          null,
          submission,
        );
        const made = await gateway(db, 'document_edit_save', accounts.assistant, createPayload);
        assert.equal(made.changed, true);
        assert.deepEqual(
          await gateway(db, 'document_edit_save', accounts.assistant, createPayload),
          made,
          'exact duplicate returns its original receipt',
        );
        const snapshot = await state(db, 'document_edit_state', accounts.assistant, made.id);
        assert.equal(snapshot.record.values.page_count, 0);
        assert.equal(snapshot.record.values.notes, '');
        assert.equal(snapshot.record.values.mfiles_id, '0');
        assert.equal(snapshot.record.values.document_date, '2024-02-29');
        assert.match(snapshot.record.values.description, /\n/u);
        await context(db, accounts.assistant);
        const edited = await gateway(
          db,
          'document_edit_save',
          accounts.assistant,
          request('update', made.id, made.version, { notes: null }),
        );
        assert.equal(Number(edited.version), Number(made.version) + 1);
        assert.deepEqual(
          await gateway(db, 'document_edit_save', accounts.assistant, createPayload),
          made,
          'lost create response remains stable after a later edit',
        );
        await context(db, accounts.assistant);
        await rejected(
          db,
          () =>
            gateway(db, 'document_edit_save', accounts.assistant, {
              ...createPayload,
              values: { ...createPayload.values, notes: 'different' },
            }),
          /submission payload differs/u,
        );
        const lifecycle = await state(db, 'document_edit_state', accounts.administrator, made.id);
        await context(db, accounts.assistant);
        await rejected(
          db,
          () =>
            gateway(
              db,
              'document_edit_save',
              accounts.assistant,
              request('archive', made.id, edited.version, {}, null, lifecycle.record.facts),
            ),
          /Invalid document operation/u,
        );
        await context(db, accounts.administrator);
        const archived = await gateway(
          db,
          'document_edit_save',
          accounts.administrator,
          request('archive', made.id, edited.version, {}, null, lifecycle.record.facts),
        );
        const restoredState = await state(
          db,
          'document_edit_state',
          accounts.administrator,
          made.id,
        );
        await context(db, accounts.administrator);
        const restored = await gateway(
          db,
          'document_edit_save',
          accounts.administrator,
          request('restore', made.id, archived.version, {}, null, restoredState.record.facts),
        );
        assert.equal(Number(restored.version), Number(made.version) + 3);
        await db.query('ROLLBACK');
        accounts.assistant.session = 1;
      } catch (error) {
        await db.query('ROLLBACK');
        accounts.assistant.session = 1;
        throw error;
      }

      await db.query('BEGIN');
      try {
        await activateDisposableAssistant(db);
        await context(db, accounts.assistant);
        const first = await gateway(
          db,
          'fee_letter_edit_save',
          accounts.assistant,
          request('create', null, null, {
            client_id: client,
            contract_type: 'fixture',
            contract_date: '2024-02-29',
            contract_details: 'line one\nline two',
            contract_structure: '',
            mfiles_id: null,
          }),
        );
        await context(db, accounts.assistant);
        const second = await gateway(
          db,
          'fee_letter_edit_save',
          accounts.assistant,
          request('create', null, null, { client_id: client, contract_type: 'replacement' }),
        );
        await context(db, accounts.assistant);
        const covered = await gateway(
          db,
          'fee_letter_edit_save',
          accounts.assistant,
          request(
            'covered-add',
            first.id,
            first.version,
            {},
            {
              membershipId: null,
              matterId: matter,
            },
          ),
        );
        let feeState = await state(db, 'fee_letter_edit_state', accounts.assistant, first.id);
        const membership = feeState.record.covered.find(
          (row: { matterId: number }) => row.matterId === matter,
        );
        assert.ok(membership && !membership.retired);
        await context(db, accounts.assistant);
        const retired = await gateway(
          db,
          'fee_letter_edit_save',
          accounts.assistant,
          request(
            'covered-retire',
            first.id,
            covered.version,
            {},
            {
              membershipId: membership.id,
              matterId: null,
            },
          ),
        );
        await context(db, accounts.assistant);
        const readded = await gateway(
          db,
          'fee_letter_edit_save',
          accounts.assistant,
          request(
            'covered-restore',
            first.id,
            retired.version,
            {},
            {
              membershipId: membership.id,
              matterId: null,
            },
          ),
        );
        assert.equal(Number(readded.version), Number(first.version) + 3);
        const rawReference = (
          await db.query('SELECT fee_letter_ref FROM matters WHERE id=$1', [matter])
        ).rows[0].fee_letter_ref;
        let reference = await state(
          db,
          'matter_fee_reference_edit_state',
          accounts.assistant,
          matter,
        );
        await context(db, accounts.assistant);
        const set = await gateway(
          db,
          'matter_fee_reference_edit_save',
          accounts.assistant,
          request(
            'set',
            matter,
            reference.version,
            {},
            {
              oldFeeLetterId: null,
              newFeeLetterId: first.id,
            },
          ),
        );
        await context(db, accounts.assistant);
        const replaced = await gateway(
          db,
          'matter_fee_reference_edit_save',
          accounts.assistant,
          request(
            'replace',
            matter,
            set.version,
            {},
            {
              oldFeeLetterId: first.id,
              newFeeLetterId: second.id,
            },
          ),
        );
        await context(db, accounts.assistant);
        await gateway(
          db,
          'matter_fee_reference_edit_save',
          accounts.assistant,
          request(
            'clear',
            matter,
            replaced.version,
            {},
            {
              oldFeeLetterId: second.id,
              newFeeLetterId: null,
            },
          ),
        );
        reference = await state(db, 'matter_fee_reference_edit_state', accounts.assistant, matter);
        assert.equal(
          reference.references.filter((row: { is_retired: boolean }) => !row.is_retired).length,
          0,
        );
        assert.equal(
          (await db.query('SELECT fee_letter_ref FROM matters WHERE id=$1', [matter])).rows[0]
            .fee_letter_ref,
          rawReference,
          'matter raw source evidence never changes',
        );
        feeState = await state(db, 'fee_letter_edit_state', accounts.administrator, first.id);
        const linkCount = (
          await db.query(
            'SELECT count(*)::integer n FROM fee_letter_matters WHERE fee_letter_id=$1',
            [first.id],
          )
        ).rows[0].n;
        await context(db, accounts.administrator);
        await gateway(
          db,
          'fee_letter_edit_save',
          accounts.administrator,
          request('archive', first.id, readded.version, {}, null, feeState.record.facts),
        );
        assert.equal(
          (
            await db.query(
              'SELECT count(*)::integer n FROM fee_letter_matters WHERE fee_letter_id=$1',
              [first.id],
            )
          ).rows[0].n,
          linkCount,
          'archive does not cascade relationship evidence',
        );
        await db.query('ROLLBACK');
        accounts.assistant.session = 1;
      } catch (error) {
        await db.query('ROLLBACK');
        accounts.assistant.session = 1;
        throw error;
      }

      await db.query('BEGIN');
      try {
        await db.query('SET LOCAL ROLE litigation_runtime');
        await rejected(
          db,
          () =>
            db.query(
              "UPDATE documents SET description='blocked' WHERE id=(SELECT min(id) FROM documents)",
            ),
          /permission denied/u,
        );
        await rejected(
          db,
          () => db.query("SELECT nextval('documents_id_seq')"),
          /permission denied/u,
        );
        await rejected(
          db,
          () => db.query('SELECT _migration.document_edit_aggregate(1)'),
          /permission denied/u,
        );
        await db.query('ROLLBACK');
      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }

      for (const corruption of [
        `UPDATE documents SET description=description||'x',row_version=row_version+1 WHERE id=(SELECT min(id) FROM documents)`,
        `UPDATE fee_letters SET is_archived=NOT is_archived,row_version=row_version+1 WHERE id=(SELECT min(id) FROM fee_letters)`,
        `UPDATE fee_letter_matters SET is_retired=NOT is_retired WHERE id=(SELECT min(id) FROM fee_letter_matters)`,
        `UPDATE matter_fee_letter_references SET is_retired=NOT is_retired WHERE id=(SELECT min(id) FROM matter_fee_letter_references)`,
      ]) {
        await db.query('BEGIN');
        try {
          await context(db, accounts.administrator);
          await db.query("SELECT set_config('litigation.tasks46_47_gateway','on',true)");
          await db.query(corruption);
          const invalid = (
            await db.query(`SELECT
              EXISTS(SELECT 1 FROM documents WHERE _migration.document_edit_current_valid(id) IS DISTINCT FROM true)
              OR EXISTS(SELECT 1 FROM fee_letters WHERE _migration.fee_letter_edit_current_valid(id) IS DISTINCT FROM true)
              OR EXISTS(SELECT 1 FROM matters WHERE _migration.matter_fee_reference_current_valid(id) IS DISTINCT FROM true) bad`)
          ).rows[0].bad;
          assert.equal(invalid, true, 'corruption must be visible to permanent replay');
        } finally {
          await db.query('ROLLBACK');
        }
      }
      await db.query('BEGIN');
      try {
        await rejected(
          db,
          () => db.query("UPDATE _migration.tasks46_47_import SET initial_values='{}' WHERE false"),
          /immutable/u,
        );
      } finally {
        await db.query('ROLLBACK');
      }
      await assertTasks46_47Boundary(db, 'historical-full-state-upgrade');
    },
    { databaseUrl },
  );
  console.log(
    'PASS roles, complete document/fee-letter flows, ACLs, source preservation and corruption detection',
  );
}

async function concurrencyProof() {
  const a = new Client({ connectionString: databaseUrl, application_name: 't4647-writer-a' });
  const b = new Client({ connectionString: databaseUrl, application_name: 't4647-writer-b' });
  const observer = new Client({
    connectionString: databaseUrl,
    application_name: 't4647-observer',
  });
  await Promise.all([a.connect(), b.connect(), observer.connect()]);
  try {
    const client = (
      await a.query('SELECT id FROM clients WHERE NOT is_archived ORDER BY id LIMIT 1')
    ).rows[0].id as number;
    await a.query('BEGIN');
    await context(a, accounts.administrator);
    const made = await gateway(
      a,
      'document_edit_save',
      accounts.administrator,
      request('create', null, null, { description: 'concurrency fixture', client_id: client }),
    );
    await a.query('COMMIT');

    await a.query('BEGIN');
    await context(a, accounts.administrator);
    const winner = await gateway(
      a,
      'document_edit_save',
      accounts.administrator,
      request('update', made.id, made.version, { notes: 'winner' }),
    );
    await b.query('BEGIN');
    await context(b, accounts.administrator);
    const loserPromise = gateway(
      b,
      'document_edit_save',
      accounts.administrator,
      request('update', made.id, made.version, { notes: 'loser' }),
    );
    let observed = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      const row = (
        await observer.query(
          "SELECT wait_event_type FROM pg_stat_activity WHERE application_name='t4647-writer-b'",
        )
      ).rows[0];
      if (row?.wait_event_type === 'Lock') {
        observed = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(observed, true, 'second writer was observed waiting on a real PostgreSQL lock');
    await a.query('COMMIT');
    await assert.rejects(loserPromise, /version or confirmation is stale/u);
    await b.query('ROLLBACK');
    assert.equal(
      (await observer.query('SELECT row_version,notes FROM documents WHERE id=$1', [made.id]))
        .rows[0].notes,
      'winner',
    );
    assert.equal(Number(winner.version), Number(made.version) + 1);
    assert.equal(
      (
        await observer.query(
          'SELECT count(*)::integer n FROM _migration.document_edit_change WHERE document_id=$1',
          [made.id],
        )
      ).rows[0].n,
      2,
      'exactly create plus one competing edit committed',
    );
    console.log(
      'PASS true lock-overlap concurrency: one document writer commits and stale peer fails',
    );

    const matter = (
      await a.query(`SELECT m.id FROM matters m WHERE NOT m.is_archived AND NOT EXISTS(
        SELECT 1 FROM matter_fee_letter_references r
        WHERE r.matter_id=m.id AND NOT r.is_retired)
        ORDER BY m.id LIMIT 1`)
    ).rows[0].id as number;
    await a.query('BEGIN');
    await context(a, accounts.administrator);
    const first = await gateway(
      a,
      'fee_letter_edit_save',
      accounts.administrator,
      request('create', null, null, { client_id: client, contract_type: 'race source' }),
    );
    await context(a, accounts.administrator);
    const second = await gateway(
      a,
      'fee_letter_edit_save',
      accounts.administrator,
      request('create', null, null, { client_id: client, contract_type: 'race winner' }),
    );
    await context(a, accounts.administrator);
    const third = await gateway(
      a,
      'fee_letter_edit_save',
      accounts.administrator,
      request('create', null, null, { client_id: client, contract_type: 'race loser' }),
    );
    const initial = await state(
      a,
      'matter_fee_reference_edit_state',
      accounts.administrator,
      matter,
    );
    await context(a, accounts.administrator);
    const set = await gateway(
      a,
      'matter_fee_reference_edit_save',
      accounts.administrator,
      request(
        'set',
        matter,
        initial.version,
        {},
        {
          oldFeeLetterId: null,
          newFeeLetterId: first.id,
        },
      ),
    );
    await a.query('COMMIT');

    await a.query('BEGIN');
    await context(a, accounts.administrator);
    const replacement = await gateway(
      a,
      'matter_fee_reference_edit_save',
      accounts.administrator,
      request(
        'replace',
        matter,
        set.version,
        {},
        {
          oldFeeLetterId: first.id,
          newFeeLetterId: second.id,
        },
      ),
    );
    await b.query('BEGIN');
    await context(b, accounts.administrator);
    const staleReplacement = gateway(
      b,
      'matter_fee_reference_edit_save',
      accounts.administrator,
      request(
        'replace',
        matter,
        set.version,
        {},
        {
          oldFeeLetterId: first.id,
          newFeeLetterId: third.id,
        },
      ),
    );
    observed = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      const row = (
        await observer.query(
          "SELECT wait_event_type FROM pg_stat_activity WHERE application_name='t4647-writer-b'",
        )
      ).rows[0];
      if (row?.wait_event_type === 'Lock') {
        observed = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(observed, true, 'competing matter reference replacement waited on a real lock');
    await a.query('COMMIT');
    await assert.rejects(staleReplacement, /version or (?:confirmation|subject) is stale/u);
    await b.query('ROLLBACK');
    const currentReference = await state(
      observer,
      'matter_fee_reference_edit_state',
      accounts.administrator,
      matter,
    );
    assert.equal(currentReference.version, replacement.version);
    assert.deepEqual(
      currentReference.references
        .filter((row: { is_retired: boolean }) => !row.is_retired)
        .map((row: { fee_letter_id: number }) => row.fee_letter_id),
      [second.id],
    );
    console.log(
      'PASS true lock-overlap concurrency: one matter-side replacement commits and stale peer fails',
    );
  } finally {
    await Promise.allSettled([a.query('ROLLBACK'), b.query('ROLLBACK')]);
    await Promise.all([a.end(), b.end(), observer.end()]);
  }
}

async function main() {
  parserProof();
  await functionalProof();
  await concurrencyProof();
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
