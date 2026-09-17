import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client, type ClientBase } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import type { Session } from 'next-auth';
import { withApprovedMigrationClient, migrationDatabaseTarget } from './lib/migration-principal';
import { assertTasks46_47Boundary } from './lib/tasks46-47-checkpoint';
import { parseDocumentForm, DocumentMutationError } from '../src/lib/document-mutation-input';
import { parseFeeLetterForm, FeeLetterMutationError } from '../src/lib/fee-letter-mutation-input';
import { readDocuments } from '../src/lib/document-query';
import { readFeeLetters } from '../src/lib/fee-letter-query';

const base = process.env.MIGRATION_DATABASE_URL;
assert.ok(base, 'MIGRATION_DATABASE_URL required');
const url = new URL(base);
const requested = process.env.TASKS46_47_TEST_DATABASE;
assert.ok(
  requested && /^litigation_t(?:ask)?4647_[a-z0-9_]+$/u.test(requested),
  'explicit disposable TASKS46_47_TEST_DATABASE required',
);
assert.notEqual(requested, 'litigation');
url.pathname = '/' + requested;
const databaseUrl = url.toString();
const runtime = new URL(process.env.DATABASE_URL!);
assert.equal(runtime.username, 'litigation_runtime');
runtime.pathname = '/' + requested;
const runtimeDatabaseUrl = runtime.toString();
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
async function completeBoundaryRejects(db: ClientBase, message: string) {
  let refused = false;
  try {
    await assertTasks46_47Boundary(db, 'historical-full-state-upgrade');
  } catch {
    refused = true;
  }
  assert.equal(refused, true, message);
}
async function receiptCorrespondenceFaultProof(db: ClientBase) {
  const gateways = [
    {
      gateway: 'documents',
      submission: 'document_edit_submission',
      change: 'document_edit_change',
      entity: 'document_id',
    },
    {
      gateway: 'fee_letters',
      submission: 'fee_letter_edit_submission',
      change: 'fee_letter_edit_change',
      entity: 'fee_letter_id',
    },
    {
      gateway: 'matter_fee_references',
      submission: 'matter_fee_reference_submission',
      change: 'matter_fee_reference_change',
      entity: 'matter_id',
    },
  ] as const;
  for (const gateway of gateways) {
    const receipt = (
      await db.query(
        `SELECT s.submission_id,s.${gateway.entity} entity_id,s.result_version
         FROM _migration.${gateway.submission} s
         JOIN _migration.tasks46_47_submission_owner o USING(submission_id)
         JOIN _migration.${gateway.change} c
           ON c.${gateway.entity}=s.${gateway.entity} AND c.version=s.result_version
         ORDER BY s.created_at DESC LIMIT 1`,
      )
    ).rows[0];
    assert.ok(receipt, `${gateway.gateway} correspondence fixture`);
    for (const missing of ['global', 'local', 'history'] as const) {
      await db.query('SAVEPOINT receipt_correspondence_fault');
      await db.query(`ALTER TABLE _migration.${gateway.submission} DISABLE TRIGGER immutable_rows`);
      await db.query(`ALTER TABLE _migration.${gateway.change} DISABLE TRIGGER immutable_rows`);
      await db.query(
        'ALTER TABLE _migration.tasks46_47_submission_owner DISABLE TRIGGER immutable_rows',
      );
      if (missing === 'global') {
        await db.query(
          'DELETE FROM _migration.tasks46_47_submission_owner WHERE submission_id=$1',
          [receipt.submission_id],
        );
      } else if (missing === 'local') {
        await db.query(`DELETE FROM _migration.${gateway.submission} WHERE submission_id=$1`, [
          receipt.submission_id,
        ]);
      } else {
        await db.query(
          `DELETE FROM _migration.${gateway.change}
           WHERE ${gateway.entity}=$1 AND version=$2`,
          [receipt.entity_id, receipt.result_version],
        );
      }
      await db.query(`ALTER TABLE _migration.${gateway.submission} ENABLE TRIGGER immutable_rows`);
      await db.query(`ALTER TABLE _migration.${gateway.change} ENABLE TRIGGER immutable_rows`);
      await db.query(
        'ALTER TABLE _migration.tasks46_47_submission_owner ENABLE TRIGGER immutable_rows',
      );
      assert.equal(
        (await db.query('SELECT _migration.tasks46_47_submission_correspondence_valid() valid'))
          .rows[0].valid,
        false,
        `${gateway.gateway} missing ${missing} correspondence`,
      );
      await completeBoundaryRejects(
        db,
        `${gateway.gateway} missing ${missing} must fail the complete permanent checker`,
      );
      await db.query('ROLLBACK TO SAVEPOINT receipt_correspondence_fault');
      assert.equal(
        (await db.query('SELECT _migration.tasks46_47_submission_correspondence_valid() valid'))
          .rows[0].valid,
        true,
        `${gateway.gateway} ${missing} fault rollback`,
      );
    }
  }
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
        const coveredPayload = request(
          'covered-add',
          first.id,
          first.version,
          {},
          { membershipId: null, matterId: matter },
        );
        const covered = await gateway(
          db,
          'fee_letter_edit_save',
          accounts.assistant,
          coveredPayload,
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
        const setPayload = request(
          'set',
          matter,
          reference.version,
          {},
          { oldFeeLetterId: null, newFeeLetterId: first.id },
        );
        const set = await gateway(
          db,
          'matter_fee_reference_edit_save',
          accounts.assistant,
          setPayload,
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
        assert.deepEqual(
          await gateway(db, 'fee_letter_edit_save', accounts.assistant, coveredPayload),
          covered,
          'lost covered-add response remains stable after retire and restore',
        );
        assert.deepEqual(
          await gateway(db, 'matter_fee_reference_edit_save', accounts.assistant, setPayload),
          set,
          'lost matter-side set response remains stable after replace and clear',
        );
        await context(db, accounts.assistant);
        await gateway(
          db,
          'document_edit_save',
          accounts.assistant,
          request('create', null, null, {
            description: 'receipt correspondence fixture',
            client_id: client,
          }),
        );
        await receiptCorrespondenceFaultProof(db);
        reference = await state(db, 'matter_fee_reference_edit_state', accounts.assistant, matter);
        assert.equal(
          reference.references.filter((row: { is_retired: boolean }) => !row.is_retired).length,
          0,
        );
        for (const fault of ['set-provenance', 'clear-retained', 'replace-provenance'] as const) {
          await db.query('SAVEPOINT reverse_fault');
          const start = (
            await db.query('SELECT _migration.matter_fee_reference_aggregate($1) state', [matter])
          ).rows[0].state;
          await context(db, accounts.assistant);
          const reset = await gateway(
            db,
            'matter_fee_reference_edit_save',
            accounts.assistant,
            request(
              'set',
              matter,
              start.version,
              {},
              { oldFeeLetterId: null, newFeeLetterId: first.id },
            ),
          );
          let targetVersion = reset.version;
          if (fault === 'clear-retained') {
            await context(db, accounts.assistant);
            targetVersion = (
              await gateway(
                db,
                'matter_fee_reference_edit_save',
                accounts.assistant,
                request(
                  'clear',
                  matter,
                  reset.version,
                  {},
                  { oldFeeLetterId: first.id, newFeeLetterId: null },
                ),
              )
            ).version;
          } else if (fault === 'replace-provenance') {
            await context(db, accounts.assistant);
            targetVersion = (
              await gateway(
                db,
                'matter_fee_reference_edit_save',
                accounts.assistant,
                request(
                  'replace',
                  matter,
                  reset.version,
                  {},
                  { oldFeeLetterId: first.id, newFeeLetterId: second.id },
                ),
              )
            ).version;
          }
          const change = (
            await db.query(
              `SELECT after_values FROM _migration.matter_fee_reference_change
               WHERE matter_id=$1 AND version=$2`,
              [matter, targetVersion],
            )
          ).rows[0];
          const corrupted = structuredClone(change.after_values);
          if (fault === 'clear-retained') {
            corrupted.references = corrupted.references.filter(
              (row: { fee_letter_id: number }) => row.fee_letter_id !== first.id,
            );
          } else {
            const row = corrupted.references.find(
              (item: { fee_letter_id: number }) => item.fee_letter_id === first.id,
            );
            assert.ok(row, 'touched reverse-reference row');
            row.created_by = accounts.administrator.id;
          }
          await db.query("SET LOCAL session_replication_role='replica'");
          await db.query(
            `UPDATE _migration.matter_fee_reference_change SET after_values=$3
             WHERE matter_id=$1 AND version=$2`,
            [matter, targetVersion, corrupted],
          );
          if (fault === 'clear-retained') {
            await db.query(
              'DELETE FROM matter_fee_letter_references WHERE matter_id=$1 AND fee_letter_id=$2',
              [matter, first.id],
            );
          } else {
            await db.query(
              `UPDATE matter_fee_letter_references SET created_by=$3
               WHERE matter_id=$1 AND fee_letter_id=$2`,
              [matter, first.id, accounts.administrator.id],
            );
          }
          await db.query("SET LOCAL session_replication_role='origin'");
          assert.equal(
            (
              await db.query('SELECT _migration.matter_fee_reference_current_valid($1) valid', [
                matter,
              ])
            ).rows[0].valid,
            false,
            `${fault} must be rejected by permanent reverse replay`,
          );
          await completeBoundaryRejects(
            db,
            `${fault} must be rejected through the complete permanent checker`,
          );
          await db.query('ROLLBACK TO SAVEPOINT reverse_fault');
        }
        assert.equal(
          (
            await db.query('SELECT _migration.matter_fee_reference_current_valid($1) valid', [
              matter,
            ])
          ).rows[0].valid,
          true,
          'set/clear/replace fault probes leave the legitimate sequence intact',
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
        await context(db, accounts.administrator);
        await db.query('UPDATE user_accounts SET session_version=session_version+1 WHERE id=$1', [
          accounts.assistant.id,
        ]);
        await context(db, accounts.assistant);
        await rejected(
          db,
          () => gateway(db, 'fee_letter_edit_save', accounts.assistant, coveredPayload),
          /authorized document\/fee-letter session/u,
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
      for (const variant of ['operation', 'subject', 'version', 'values', 'orphan'] as const) {
        await db.query('BEGIN');
        try {
          await context(db, accounts.administrator);
          const submission = randomUUID();
          const payload = request(
            'create',
            null,
            null,
            { description: 'semantic receipt fixture', client_id: client },
            null,
            null,
            submission,
          );
          const made = await gateway(db, 'document_edit_save', accounts.administrator, payload);
          await db.query(
            'ALTER TABLE _migration.document_edit_submission DISABLE TRIGGER immutable_rows',
          );
          await db.query(
            'ALTER TABLE _migration.tasks46_47_submission_owner DISABLE TRIGGER immutable_rows',
          );
          if (variant === 'orphan') {
            const orphan = randomUUID();
            const orphanPayload = { ...payload, submission: orphan };
            await db.query(
              `INSERT INTO _migration.tasks46_47_submission_owner
               (submission_id,actor_id,gateway,operation,entity_id,request_payload,result_version)
               SELECT $1,actor_id,'documents','create',document_id,$2,result_version+50
              FROM _migration.document_edit_submission WHERE submission_id=$3`,
              [orphan, orphanPayload, submission],
            );
          } else {
            const changed = structuredClone(payload);
            if (variant === 'operation') {
              changed.operation = 'update';
              changed.id = made.id;
            } else if (variant === 'subject') {
              changed.operation = 'update';
              changed.id = made.id + 1;
              changed.version = '1';
            } else if (variant === 'version') {
              changed.operation = 'update';
              changed.id = made.id;
              changed.version = '99';
            } else changed.values.description = 'corrupt semantic value';
            await db.query(
              'UPDATE _migration.document_edit_submission SET request_payload=$1 WHERE submission_id=$2',
              [changed, submission],
            );
            await db.query(
              `UPDATE _migration.tasks46_47_submission_owner
               SET request_payload=$1,operation=$2 WHERE submission_id=$3`,
              [changed, changed.operation, submission],
            );
          }
          if (variant === 'orphan') {
            assert.equal(
              (await db.query('SELECT _migration.document_edit_current_valid($1) valid', [made.id]))
                .rows[0].valid,
              true,
              'global-only ownership row does not alter the document aggregate',
            );
            assert.equal(
              (
                await db.query(
                  'SELECT _migration.tasks46_47_submission_correspondence_valid() valid',
                )
              ).rows[0].valid,
              false,
              'global-only ownership row must fail bidirectional correspondence',
            );
            await db.query(
              'ALTER TABLE _migration.document_edit_submission ENABLE TRIGGER immutable_rows',
            );
            await db.query(
              'ALTER TABLE _migration.tasks46_47_submission_owner ENABLE TRIGGER immutable_rows',
            );
            await completeBoundaryRejects(
              db,
              'global-only ownership row must be rejected through the complete permanent checker',
            );
          } else {
            assert.equal(
              (await db.query('SELECT _migration.document_edit_current_valid($1) valid', [made.id]))
                .rows[0].valid,
              false,
              `semantic ${variant} corruption must be detected`,
            );
          }
        } finally {
          await db.query('ROLLBACK');
        }
      }
      await db.query('BEGIN');
      try {
        await context(db, accounts.administrator);
        const otherMatter = (
          await db.query(
            'SELECT id FROM matters WHERE id<>$1 AND NOT is_archived ORDER BY id LIMIT 1',
            [matter],
          )
        ).rows[0].id as number;
        const made = await gateway(
          db,
          'fee_letter_edit_save',
          accounts.administrator,
          request('create', null, null, { client_id: client, contract_type: 'semantic relation' }),
        );
        await context(db, accounts.administrator);
        const submission = randomUUID();
        const related = request(
          'covered-add',
          made.id,
          made.version,
          {},
          { membershipId: null, matterId: matter },
          null,
          submission,
        );
        await gateway(db, 'fee_letter_edit_save', accounts.administrator, related);
        await db.query(
          'ALTER TABLE _migration.fee_letter_edit_submission DISABLE TRIGGER immutable_rows',
        );
        await db.query(
          'ALTER TABLE _migration.tasks46_47_submission_owner DISABLE TRIGGER immutable_rows',
        );
        const corrupt = {
          ...related,
          related: { membershipId: null, matterId: otherMatter },
        };
        await db.query(
          'UPDATE _migration.fee_letter_edit_submission SET request_payload=$1 WHERE submission_id=$2',
          [corrupt, submission],
        );
        await db.query(
          'UPDATE _migration.tasks46_47_submission_owner SET request_payload=$1 WHERE submission_id=$2',
          [corrupt, submission],
        );
        assert.equal(
          (await db.query('SELECT _migration.fee_letter_edit_current_valid($1) valid', [made.id]))
            .rows[0].valid,
          false,
          'covered-matter semantic payload corruption must be detected',
        );
      } finally {
        await db.query('ROLLBACK');
      }
      console.log(
        'PASS semantic operation, subject, version, values, relationship and orphan receipt corruption detection',
      );
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
    const writerBWaits = async (message: string) => {
      let waiting = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const row = (
          await observer.query(
            "SELECT wait_event_type FROM pg_stat_activity WHERE application_name='t4647-writer-b'",
          )
        ).rows[0];
        if (row?.wait_event_type === 'Lock') {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.equal(waiting, true, message);
    };
    const client = (
      await a.query('SELECT id FROM clients WHERE NOT is_archived ORDER BY id LIMIT 1')
    ).rows[0].id as number;
    await a.query('BEGIN');
    await context(a, accounts.administrator);
    const madePayload = request('create', null, null, {
      description: 'concurrency fixture',
      client_id: client,
    });
    const made = await gateway(a, 'document_edit_save', accounts.administrator, madePayload);
    await a.query('COMMIT');
    await a.query('BEGIN');
    await context(a, accounts.administrator);
    assert.deepEqual(
      await gateway(a, 'document_edit_save', accounts.administrator, madePayload),
      made,
      'Administrator lost create response retries exactly after commit',
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
    const setPayload = request(
      'set',
      matter,
      initial.version,
      {},
      { oldFeeLetterId: null, newFeeLetterId: first.id },
    );
    const set = await gateway(
      a,
      'matter_fee_reference_edit_save',
      accounts.administrator,
      setPayload,
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
    await a.query('BEGIN');
    await context(a, accounts.administrator);
    assert.deepEqual(
      await gateway(a, 'matter_fee_reference_edit_save', accounts.administrator, setPayload),
      set,
      'Administrator lost set response retries exactly after later replacement',
    );
    await a.query('COMMIT');
    console.log(
      'PASS true lock-overlap concurrency: one matter-side replacement commits and stale peer fails',
    );

    let documentState = await state(
      observer,
      'document_edit_state',
      accounts.administrator,
      made.id,
    );
    await a.query('BEGIN');
    await context(a, accounts.administrator);
    const documentEditBeforeArchive = await gateway(
      a,
      'document_edit_save',
      accounts.administrator,
      request('update', made.id, winner.version, { notes: 'edit beats archive' }),
    );
    await b.query('BEGIN');
    await context(b, accounts.administrator);
    const staleDocumentArchive = gateway(
      b,
      'document_edit_save',
      accounts.administrator,
      request('archive', made.id, winner.version, {}, null, documentState.record.facts),
    );
    await writerBWaits('document archive waited behind a conflicting edit');
    await a.query('COMMIT');
    await assert.rejects(staleDocumentArchive, /version or confirmation is stale/u);
    await b.query('ROLLBACK');

    documentState = await state(observer, 'document_edit_state', accounts.administrator, made.id);
    await a.query('BEGIN');
    await context(a, accounts.administrator);
    const documentArchived = await gateway(
      a,
      'document_edit_save',
      accounts.administrator,
      request(
        'archive',
        made.id,
        documentEditBeforeArchive.version,
        {},
        null,
        documentState.record.facts,
      ),
    );
    await a.query('COMMIT');
    documentState = await state(observer, 'document_edit_state', accounts.administrator, made.id);
    await a.query('BEGIN');
    await context(a, accounts.administrator);
    const restoredDocument = await gateway(
      a,
      'document_edit_save',
      accounts.administrator,
      request('restore', made.id, documentArchived.version, {}, null, documentState.record.facts),
    );
    await b.query('BEGIN');
    await context(b, accounts.administrator);
    const staleDocumentRestore = gateway(
      b,
      'document_edit_save',
      accounts.administrator,
      request('restore', made.id, documentArchived.version, {}, null, documentState.record.facts),
    );
    await writerBWaits('second document restore waited behind the committed restore');
    await a.query('COMMIT');
    await assert.rejects(staleDocumentRestore, /version or confirmation is stale/u);
    await b.query('ROLLBACK');
    assert.equal(Number(restoredDocument.version), Number(documentArchived.version) + 1);

    let feeState = await state(observer, 'fee_letter_edit_state', accounts.administrator, third.id);
    await a.query('BEGIN');
    await context(a, accounts.administrator);
    const feeEditWinner = await gateway(
      a,
      'fee_letter_edit_save',
      accounts.administrator,
      request('update', third.id, feeState.record.version, { contract_details: 'winner' }),
    );
    await b.query('BEGIN');
    await context(b, accounts.administrator);
    const staleFeeEdit = gateway(
      b,
      'fee_letter_edit_save',
      accounts.administrator,
      request('update', third.id, feeState.record.version, { contract_details: 'loser' }),
    );
    await writerBWaits('second fee-letter edit waited behind the winning edit');
    await a.query('COMMIT');
    await assert.rejects(staleFeeEdit, /version or confirmation is stale/u);
    await b.query('ROLLBACK');

    feeState = await state(observer, 'fee_letter_edit_state', accounts.administrator, third.id);
    await a.query('BEGIN');
    await context(a, accounts.administrator);
    const feeEditBeforeArchive = await gateway(
      a,
      'fee_letter_edit_save',
      accounts.administrator,
      request('update', third.id, feeEditWinner.version, {
        contract_details: 'edit beats archive',
      }),
    );
    await b.query('BEGIN');
    await context(b, accounts.administrator);
    const staleFeeArchive = gateway(
      b,
      'fee_letter_edit_save',
      accounts.administrator,
      request('archive', third.id, feeEditWinner.version, {}, null, feeState.record.facts),
    );
    await writerBWaits('fee-letter archive waited behind a conflicting edit');
    await a.query('COMMIT');
    await assert.rejects(staleFeeArchive, /version or confirmation is stale/u);
    await b.query('ROLLBACK');

    feeState = await state(observer, 'fee_letter_edit_state', accounts.administrator, third.id);
    await a.query('BEGIN');
    await context(a, accounts.administrator);
    const feeArchived = await gateway(
      a,
      'fee_letter_edit_save',
      accounts.administrator,
      request('archive', third.id, feeEditBeforeArchive.version, {}, null, feeState.record.facts),
    );
    await a.query('COMMIT');
    feeState = await state(observer, 'fee_letter_edit_state', accounts.administrator, third.id);
    await a.query('BEGIN');
    await context(a, accounts.administrator);
    const feeRestored = await gateway(
      a,
      'fee_letter_edit_save',
      accounts.administrator,
      request('restore', third.id, feeArchived.version, {}, null, feeState.record.facts),
    );
    await b.query('BEGIN');
    await context(b, accounts.administrator);
    const staleFeeRestore = gateway(
      b,
      'fee_letter_edit_save',
      accounts.administrator,
      request('restore', third.id, feeArchived.version, {}, null, feeState.record.facts),
    );
    await writerBWaits('second fee-letter restore waited behind the committed restore');
    await a.query('COMMIT');
    await assert.rejects(staleFeeRestore, /version or confirmation is stale/u);
    await b.query('ROLLBACK');
    assert.equal(Number(feeRestored.version), Number(feeArchived.version) + 1);

    const membershipMatters = (
      await observer.query(
        `SELECT id FROM matters WHERE NOT is_archived AND id<>$1 ORDER BY id LIMIT 2`,
        [matter],
      )
    ).rows.map((row) => row.id as number);
    assert.equal(membershipMatters.length, 2);
    const membershipState = await state(
      observer,
      'fee_letter_edit_state',
      accounts.administrator,
      second.id,
    );
    await a.query('BEGIN');
    await context(a, accounts.administrator);
    const membershipWinner = await gateway(
      a,
      'fee_letter_edit_save',
      accounts.administrator,
      request(
        'covered-add',
        second.id,
        membershipState.record.version,
        {},
        { membershipId: null, matterId: membershipMatters[0] },
      ),
    );
    await b.query('BEGIN');
    await context(b, accounts.administrator);
    const membershipLoser = gateway(
      b,
      'fee_letter_edit_save',
      accounts.administrator,
      request(
        'covered-add',
        second.id,
        membershipState.record.version,
        {},
        { membershipId: null, matterId: membershipMatters[1] },
      ),
    );
    await writerBWaits('competing covered-matter order allocation waited on a real lock');
    await a.query('COMMIT');
    await assert.rejects(membershipLoser, /version or confirmation is stale/u);
    await b.query('ROLLBACK');
    assert.deepEqual(
      (
        await observer.query(
          `SELECT matter_id,current_order FROM fee_letter_matters
           WHERE fee_letter_id=$1 AND NOT is_retired ORDER BY current_order,id`,
          [second.id],
        )
      ).rows,
      [{ matter_id: membershipMatters[0], current_order: 1 }],
    );
    assert.equal(Number(membershipWinner.version), Number(membershipState.record.version) + 1);
    const committedMembership = (
      await observer.query(
        `SELECT id FROM fee_letter_matters
         WHERE fee_letter_id=$1 AND matter_id=$2 AND NOT is_retired`,
        [second.id, membershipMatters[0]],
      )
    ).rows[0].id as number;
    await a.query('BEGIN');
    await context(a, accounts.administrator);
    const committedRetirement = await gateway(
      a,
      'fee_letter_edit_save',
      accounts.administrator,
      request(
        'covered-retire',
        second.id,
        membershipWinner.version,
        {},
        { membershipId: committedMembership, matterId: null },
      ),
    );
    await a.query('COMMIT');
    await a.query('BEGIN');
    await context(a, accounts.administrator);
    await gateway(
      a,
      'fee_letter_edit_save',
      accounts.administrator,
      request(
        'covered-restore',
        second.id,
        committedRetirement.version,
        {},
        { membershipId: committedMembership, matterId: null },
      ),
    );
    await a.query('COMMIT');
    assert.equal(
      (
        await observer.query('SELECT _migration.fee_letter_edit_current_valid($1) valid', [
          second.id,
        ])
      ).rows[0].valid,
      true,
      'committed covered-matter retire/restore passes the deferred permanent replay constraint',
    );

    const parentMatter = membershipMatters[1]!;
    await a.query('BEGIN');
    await context(a, accounts.administrator);
    const parentDocument = await gateway(
      a,
      'document_edit_save',
      accounts.administrator,
      request('create', null, null, {
        description: 'matter archive overlap',
        matter_id: parentMatter,
      }),
    );
    await a.query('COMMIT');
    const lifecycle = await state(
      observer,
      'matter_lifecycle_state',
      accounts.administrator,
      parentMatter,
    );
    await a.query('BEGIN');
    await context(a, accounts.administrator);
    const archivedParent = (
      await a.query(`SELECT public.matter_lifecycle_save($1,$2,$3,$4,$5) result`, [
        accounts.administrator.id,
        accounts.administrator.session,
        accounts.administrator.role,
        expires,
        {
          id: parentMatter,
          version: lifecycle.version,
          submission: randomUUID(),
          action: 'archive',
          counts: lifecycle.counts,
          confirmation: parentMatter,
        },
      ])
    ).rows[0].result;
    await b.query('BEGIN');
    await context(b, accounts.administrator);
    const childAfterParentArchive = gateway(
      b,
      'document_edit_save',
      accounts.administrator,
      request('update', parentDocument.id, parentDocument.version, { notes: 'must not commit' }),
    );
    await writerBWaits('document edit waited behind its shared matter archive');
    await a.query('COMMIT');
    await assert.rejects(childAfterParentArchive, /Restore archived document parent/u);
    await b.query('ROLLBACK');
    const archivedLifecycle = await state(
      observer,
      'matter_lifecycle_state',
      accounts.administrator,
      parentMatter,
    );
    await a.query('BEGIN');
    await context(a, accounts.administrator);
    await a.query(`SELECT public.matter_lifecycle_save($1,$2,$3,$4,$5)`, [
      accounts.administrator.id,
      accounts.administrator.session,
      accounts.administrator.role,
      expires,
      {
        id: parentMatter,
        version: archivedParent.version,
        submission: randomUUID(),
        action: 'restore',
        counts: archivedLifecycle.counts,
        confirmation: parentMatter,
      },
    ]);
    await a.query('COMMIT');

    const clientRaceFee = await state(
      observer,
      'fee_letter_edit_state',
      accounts.administrator,
      first.id,
    );
    const clientRow = (
      await observer.query('SELECT id,row_version::text version FROM clients WHERE id=$1', [client])
    ).rows[0];
    await a.query('BEGIN');
    await context(a, accounts.administrator);
    const archivedClientVersion = (
      await a.query(`SELECT public.client_contact_set_archived('clients',$1,$2,true) version`, [
        clientRow.id,
        clientRow.version,
      ])
    ).rows[0].version;
    await b.query('BEGIN');
    await context(b, accounts.administrator);
    const feeAfterClientArchive = gateway(
      b,
      'fee_letter_edit_save',
      accounts.administrator,
      request('update', first.id, clientRaceFee.record.version, { contract_details: 'blocked' }),
    );
    await writerBWaits('fee-letter edit waited behind its shared client archive');
    await a.query('COMMIT');
    await assert.rejects(feeAfterClientArchive, /Restore archived fee-letter client/u);
    await b.query('ROLLBACK');
    await a.query('BEGIN');
    await context(a, accounts.administrator);
    await a.query(`SELECT public.client_contact_set_archived('clients',$1,$2,false)`, [
      clientRow.id,
      archivedClientVersion,
    ]);
    await a.query('COMMIT');

    const staff = (
      await observer.query(
        `SELECT p.id,p.row_version::text version,p.name_en,p.email,p.is_trainee,p.team_id
         FROM people p WHERE p.is_staff AND p.is_active
           AND NOT EXISTS(SELECT 1 FROM user_accounts u WHERE u.person_id=p.id)
         ORDER BY p.id LIMIT 1`,
      )
    ).rows[0];
    assert.ok(staff, 'active disposable staff fixture without an account');
    await a.query('BEGIN');
    await context(a, accounts.administrator);
    const deactivatedVersion = (
      await a.query('SELECT public.staff_update_person($1,$2,$3,$4,false,$5,$6) version', [
        staff.id,
        staff.version,
        staff.name_en,
        staff.email,
        staff.is_trainee,
        staff.team_id,
      ])
    ).rows[0].version;
    await b.query('BEGIN');
    await context(b, accounts.administrator);
    const personAfterDeactivation = gateway(
      b,
      'document_edit_save',
      accounts.administrator,
      request('update', parentDocument.id, parentDocument.version, {
        responsible_person_id: staff.id,
      }),
    );
    await writerBWaits('responsible-person selection waited behind staff deactivation');
    await a.query('COMMIT');
    await assert.rejects(personAfterDeactivation, /Active staff person required/u);
    await b.query('ROLLBACK');
    await a.query('BEGIN');
    await context(a, accounts.administrator);
    await a.query('SELECT public.staff_update_person($1,$2,$3,$4,true,$5,$6)', [
      staff.id,
      deactivatedVersion,
      staff.name_en,
      staff.email,
      staff.is_trainee,
      staff.team_id,
    ]);
    await a.query('COMMIT');

    await a.query('BEGIN');
    await activateDisposableAssistant(a);
    await a.query('COMMIT');
    const invalidatedSession = accounts.assistant.session;
    await a.query('BEGIN');
    await context(a, accounts.administrator);
    const replacementSession = (
      await a.query(
        'UPDATE user_accounts SET session_version=session_version+1 WHERE id=$1 RETURNING session_version',
        [accounts.assistant.id],
      )
    ).rows[0].session_version as number;
    await b.query('BEGIN');
    await context(b, accounts.assistant);
    const afterSessionInvalidation = gateway(
      b,
      'document_edit_save',
      { ...accounts.assistant, session: invalidatedSession },
      request('update', parentDocument.id, parentDocument.version, { notes: 'revoked writer' }),
    );
    await writerBWaits('pending write waited behind account/session invalidation');
    await a.query('COMMIT');
    await assert.rejects(afterSessionInvalidation, /authorized document\/fee-letter session/u);
    await b.query('ROLLBACK');
    accounts.assistant.session = replacementSession;

    const duplicatePayload = request('create', null, null, {
      description: 'exact concurrent duplicate',
      client_id: client,
    });
    await a.query('BEGIN');
    await context(a, accounts.administrator);
    const firstDuplicate = await gateway(
      a,
      'document_edit_save',
      accounts.administrator,
      duplicatePayload,
    );
    await b.query('BEGIN');
    await context(b, accounts.administrator);
    const duplicateRetry = gateway(
      b,
      'document_edit_save',
      accounts.administrator,
      duplicatePayload,
    );
    await writerBWaits('exact duplicate submission waited for its first commit');
    await a.query('COMMIT');
    assert.deepEqual(await duplicateRetry, firstDuplicate);
    await b.query('COMMIT');
    assert.equal(
      (
        await observer.query(
          'SELECT count(*)::integer n FROM _migration.document_edit_submission WHERE submission_id=$1',
          [duplicatePayload.submission],
        )
      ).rows[0].n,
      1,
    );
    console.log(
      'PASS observed overlap matrix: document and fee edit/archive/restore, membership order, shared parents, person/session invalidation and exact duplicate',
    );

    const sequentialToken = randomUUID();
    const sequentialDocument = request(
      'create',
      null,
      null,
      { description: 'cross-gateway sequential token', client_id: client },
      null,
      null,
      sequentialToken,
    );
    await a.query('BEGIN');
    await context(a, accounts.administrator);
    await gateway(a, 'document_edit_save', accounts.administrator, sequentialDocument);
    await a.query('COMMIT');
    await b.query('BEGIN');
    await context(b, accounts.administrator);
    await rejected(
      b,
      () =>
        gateway(
          b,
          'fee_letter_edit_save',
          accounts.administrator,
          request(
            'create',
            null,
            null,
            { client_id: client, contract_type: 'cross-gateway sequential token' },
            null,
            null,
            sequentialToken,
          ),
        ),
      /submission payload differs across gateway/u,
    );
    await b.query('ROLLBACK');

    const overlapToken = randomUUID();
    await a.query('BEGIN');
    await context(a, accounts.administrator);
    await gateway(
      a,
      'document_edit_save',
      accounts.administrator,
      request(
        'create',
        null,
        null,
        { description: 'cross-gateway overlap token', client_id: client },
        null,
        null,
        overlapToken,
      ),
    );
    await b.query('BEGIN');
    await context(b, accounts.administrator);
    const crossGateway = gateway(
      b,
      'fee_letter_edit_save',
      accounts.administrator,
      request(
        'create',
        null,
        null,
        { client_id: client, contract_type: 'cross-gateway overlap token' },
        null,
        null,
        overlapToken,
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
    assert.equal(observed, true, 'cross-gateway token reuse waited on the global advisory lock');
    await a.query('COMMIT');
    await assert.rejects(crossGateway, /submission payload differs across gateway/u);
    await b.query('ROLLBACK');
    console.log('PASS sequential and true-overlap cross-gateway submission ownership');
  } finally {
    await Promise.allSettled([a.query('ROLLBACK'), b.query('ROLLBACK')]);
    await Promise.all([a.end(), b.end(), observer.end()]);
  }
}

async function fullPopulationReadOracle() {
  const owner = new Client({
    connectionString: databaseUrl,
    application_name: 't4647-read-oracle',
  });
  const service = new PrismaClient({
    adapter: new PrismaPg({ connectionString: runtimeDatabaseUrl }),
    log: ['error'],
  });
  const fixtureAccountIds = [accounts.assistant.id, accounts.lawyer.id, accounts.paralegal.id];
  let originalFixtureAccounts: Record<string, unknown>[] = [];
  await owner.connect();
  try {
    originalFixtureAccounts = (
      await owner.query('SELECT * FROM user_accounts WHERE id=ANY($1::integer[]) ORDER BY id', [
        fixtureAccountIds,
      ])
    ).rows;
    assert.equal(originalFixtureAccounts.length, fixtureAccountIds.length);
    await owner.query('BEGIN');
    try {
      await owner.query("SET LOCAL session_replication_role='replica'");
      for (const target of fixtureAccountIds)
        await owner.query(
          `UPDATE user_accounts target SET is_enabled=true,password_hash=source.password_hash,
            password_changed_at=statement_timestamp(),must_change_password=false,
            failed_login_attempts=0,locked_until=NULL,session_version=target.session_version+1
           FROM user_accounts source WHERE target.id=$1 AND source.id=$2`,
          [target, accounts.administrator.id],
        );
      await owner.query('COMMIT');
    } catch (error) {
      await owner.query('ROLLBACK');
      throw error;
    }
    const accountRows = (
      await owner.query(
        `SELECT u.id,u.person_id,u.username,u.role_code,u.session_version,p.name_ar
        FROM user_accounts u JOIN people p ON p.id=u.person_id
        WHERE u.role_code=ANY($1::text[]) AND u.is_enabled AND u.password_hash IS NOT NULL
          AND NOT u.must_change_password AND p.is_active AND p.is_staff AND p.can_login
        ORDER BY array_position($1::text[],u.role_code),u.id`,
        [['Administrator', 'Litigation Assistant', 'Lawyer', 'Paralegal']],
      )
    ).rows;
    assert.deepEqual(
      accountRows.map((row) => row.role_code),
      ['Administrator', 'Litigation Assistant', 'Lawyer', 'Paralegal'],
      'full-population oracle has all four reader roles',
    );
    const sessions = accountRows.map(
      (account) =>
        ({
          expires,
          user: {
            id: String(account.id),
            personId: account.person_id,
            username: account.username,
            name: account.name_ar,
            role: account.role_code,
            mustChangePassword: false,
            sessionVersion: account.session_version,
            auditSessionId: randomUUID(),
          },
        }) as Session,
    );
    const arNormalise = (input: unknown) => {
      if (input === null || input === undefined) return '';
      const characterMap = new Map(
        [...'أإآٱةىؤئ٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹'].map((character, index) => [
          character,
          [...'ااااهيوي01234567890123456789'][index]!,
        ]),
      );
      return Array.from(
        String(input)
          .normalize('NFC')
          .replace(/[ًٌٍَُِّْـٰ]/gu, '')
          .toLowerCase(),
      )
        .map((character) => characterMap.get(character) ?? character)
        .join('')
        .replaceAll(' ', '');
    };
    type RawDocument = {
      id: number;
      legacy_id: number | null;
      is_archived: boolean;
      client_id: number | null;
      matter_id: number | null;
      responsible_person_id: number | null;
      mfiles_id: string | null;
      search_values: unknown[];
    };
    const rawDocuments = (
      await owner.query<RawDocument>(`SELECT d.id,d.legacy_id,d.is_archived,d.client_id,d.matter_id,
        d.responsible_person_id,d.mfiles_id,ARRAY[d.description,d.movement_card,d.storage_location,
        d.notes,d.mfiles_id,d.legacy_client_name_raw,d.legacy_matter_ref_raw,
        d.legacy_responsible_raw,d.legacy_page_count_raw,c.name_ar,c.full_name,c.name_en,
        m.case_number_ar,m.subject,p.name_ar] || coalesce(ARRAY(SELECT a.alias_ar
          FROM person_name_alias a WHERE a.person_id=p.id AND NOT a.is_retired),'{}') search_values
        FROM documents d LEFT JOIN clients c ON c.id=d.client_id
        LEFT JOIN matters m ON m.id=d.matter_id LEFT JOIN people p ON p.id=d.responsible_person_id
        ORDER BY d.id DESC`)
    ).rows;
    type RawFee = {
      id: number;
      contract_id: number | null;
      is_archived: boolean;
      client_id: number | null;
      mfiles_id: string | null;
      search_values: unknown[];
      covered: { matter: number; retired: boolean; original: boolean; values: unknown[] }[];
      referencing: { matter: number; retired: boolean; original: boolean; values: unknown[] }[];
    };
    const rawFees = (
      await owner.query<RawFee>(`SELECT f.id,f.contract_id,f.is_archived,f.client_id,f.mfiles_id,
        ARRAY[f.mfiles_id,f.legacy_mfiles_id_raw,f.client_name,f.contract_type,f.contract_details,
          f.contract_structure,f.status,c.name_ar,c.full_name,c.name_en] search_values,
        coalesce((SELECT jsonb_agg(jsonb_build_object('matter',l.matter_id,'retired',l.is_retired,
          'original',l.legacy_source_record_key IS NOT NULL,'values',jsonb_build_array(m.case_number_ar,l.legacy_matter_ref)))
          FROM fee_letter_matters l JOIN matters m ON m.id=l.matter_id WHERE l.fee_letter_id=f.id),'[]') covered,
        coalesce((SELECT jsonb_agg(jsonb_build_object('matter',r.matter_id,'retired',r.is_retired,
          'original',r.legacy_source_record_key IS NOT NULL,'values',jsonb_build_array(m.case_number_ar,r.legacy_reference_raw)))
          FROM matter_fee_letter_references r JOIN matters m ON m.id=r.matter_id WHERE r.fee_letter_id=f.id),'[]') referencing
        FROM fee_letters f LEFT JOIN clients c ON c.id=f.client_id ORDER BY f.id DESC`)
    ).rows;
    const selectId = (rows: object[], key: string) => {
      const selected = rows
        .map((row) => (row as Record<string, unknown>)[key])
        .find((value) => value !== null && value !== undefined);
      return String(selected ?? 'missing');
    };
    const arabicDigits = (value: number) =>
      String(value).replace(/[0-9]/gu, (digit) => '٠١٢٣٤٥٦٧٨٩'[Number(digit)]!);
    const persianDigits = (value: number) =>
      String(value).replace(/[0-9]/gu, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]!);
    const nonExactNumericForms = (value: number) => {
      const text = String(value);
      return [text.slice(0, -1), `${text}x`, `0${text}`];
    };
    const documentControl = (key: 'id' | 'legacy_id') => {
      const found = rawDocuments.find((row) => {
        const value = row[key];
        if (value === null || String(value).length < 2) return false;
        const variants = nonExactNumericForms(value);
        const other = key === 'id' ? row.legacy_id : row.id;
        return variants.every(
          (variant) =>
            arNormalise(other) !== arNormalise(variant) &&
            !row.search_values.some((candidate) =>
              arNormalise(candidate).includes(arNormalise(variant)),
            ),
        );
      });
      assert.ok(found, `document ${key} non-exact ID control`);
      return found;
    };
    const feeControl = (key: 'id' | 'contract_id') => {
      const found = rawFees.find((row) => {
        const value = row[key];
        if (value === null || String(value).length < 2) return false;
        const variants = nonExactNumericForms(value);
        const other = key === 'id' ? row.contract_id : row.id;
        const values = [
          ...row.search_values,
          ...row.covered.flatMap((link) => link.values),
          ...row.referencing.flatMap((link) => link.values),
        ];
        return variants.every(
          (variant) =>
            arNormalise(other) !== arNormalise(variant) &&
            !values.some((candidate) => arNormalise(candidate).includes(arNormalise(variant))),
        );
      });
      assert.ok(found, `fee-letter ${key} non-exact ID control`);
      return found;
    };
    const documentId = documentControl('id');
    const documentLegacyId = documentControl('legacy_id');
    const feeId = feeControl('id');
    const feeContractId = feeControl('contract_id');
    const documentMulti =
      rawDocuments.find((row) => row.client_id !== null && row.matter_id !== null) ??
      rawDocuments[0]!;
    const feeMulti = rawFees.find((row) => row.client_id !== null) ?? rawFees[0]!;
    const finalPage = (ids: number[]) =>
      ids.slice(Math.floor(Math.max(0, ids.length - 1) / 25) * 25);
    const documentCases: Record<string, string>[] = [
      { archive: 'all' },
      { archive: 'current' },
      { archive: 'archived' },
      { archive: 'all', client: 'missing' },
      { archive: 'all', client: selectId(rawDocuments, 'client_id') },
      { archive: 'all', matter: 'missing' },
      { archive: 'all', matter: selectId(rawDocuments, 'matter_id') },
      { archive: 'all', person: 'missing' },
      { archive: 'all', person: selectId(rawDocuments, 'responsible_person_id') },
      { archive: 'all', mfiles: 'missing' },
      { archive: 'all', mfiles: 'present' },
      { archive: 'all', q: String(documentId.id) },
      { archive: 'all', q: arabicDigits(documentId.id) },
      { archive: 'all', q: persianDigits(documentId.id) },
      { archive: 'all', q: String(documentLegacyId.legacy_id) },
      { archive: 'all', q: arabicDigits(documentLegacyId.legacy_id!) },
      { archive: 'all', q: persianDigits(documentLegacyId.legacy_id!) },
      ...nonExactNumericForms(documentId.id).map((q) => ({ archive: 'all', q })),
      ...nonExactNumericForms(documentLegacyId.legacy_id!).map((q) => ({ archive: 'all', q })),
      {
        archive: documentMulti.is_archived ? 'archived' : 'current',
        client: documentMulti.client_id === null ? 'missing' : String(documentMulti.client_id),
        matter: documentMulti.matter_id === null ? 'missing' : String(documentMulti.matter_id),
        person:
          documentMulti.responsible_person_id === null
            ? 'missing'
            : String(documentMulti.responsible_person_id),
        mfiles: documentMulti.mfiles_id === null ? 'missing' : 'present',
        q: String(documentMulti.id),
      },
      { archive: 'all', q: 'أحمد' },
      { archive: 'all', q: '%' },
      { archive: 'all', q: '_' },
    ];
    const feeCases: Record<string, string>[] = [
      { archive: 'all' },
      { archive: 'current' },
      { archive: 'archived' },
      { archive: 'all', client: 'missing' },
      { archive: 'all', client: selectId(rawFees, 'client_id') },
      { archive: 'all', covered: 'missing' },
      {
        archive: 'all',
        covered: String(
          rawFees.flatMap((row) => row.covered).find((link) => !link.retired)?.matter,
        ),
      },
      { archive: 'all', referencing: 'missing' },
      {
        archive: 'all',
        referencing: String(
          rawFees.flatMap((row) => row.referencing).find((link) => !link.retired)?.matter,
        ),
      },
      { archive: 'all', mfiles: 'missing' },
      { archive: 'all', mfiles: 'present' },
      { archive: 'all', q: String(feeId.id) },
      { archive: 'all', q: arabicDigits(feeId.id) },
      { archive: 'all', q: persianDigits(feeId.id) },
      { archive: 'all', q: String(feeContractId.contract_id) },
      { archive: 'all', q: arabicDigits(feeContractId.contract_id!) },
      { archive: 'all', q: persianDigits(feeContractId.contract_id!) },
      ...nonExactNumericForms(feeId.id).map((q) => ({ archive: 'all', q })),
      ...nonExactNumericForms(feeContractId.contract_id!).map((q) => ({ archive: 'all', q })),
      {
        archive: feeMulti.is_archived ? 'archived' : 'current',
        client: feeMulti.client_id === null ? 'missing' : String(feeMulti.client_id),
        covered: feeMulti.covered.find((link) => !link.retired)?.matter.toString() ?? 'missing',
        referencing:
          feeMulti.referencing.find((link) => !link.retired)?.matter.toString() ?? 'missing',
        mfiles: feeMulti.mfiles_id === null ? 'missing' : 'present',
        q: String(feeMulti.id),
      },
      { archive: 'all', q: 'أحمد' },
      { archive: 'all', q: '%' },
      { archive: 'all', q: '_' },
    ];
    const documentExpected = (params: Record<string, string>) => {
      const q = arNormalise(params.q ?? '');
      return rawDocuments
        .filter((row) => {
          if (params.archive !== 'all' && row.is_archived !== (params.archive === 'archived'))
            return false;
          for (const [parameter, property] of [
            ['client', 'client_id'],
            ['matter', 'matter_id'],
            ['person', 'responsible_person_id'],
          ] as const) {
            const value = params[parameter] ?? 'all';
            if (value === 'missing' && row[property] !== null) return false;
            if (value !== 'all' && value !== 'missing' && row[property] !== Number(value))
              return false;
          }
          if (params.mfiles === 'present' && row.mfiles_id === null) return false;
          if (params.mfiles === 'missing' && row.mfiles_id !== null) return false;
          return (
            !q ||
            arNormalise(row.id) === q ||
            arNormalise(row.legacy_id) === q ||
            row.search_values.some((value) => arNormalise(value).includes(q))
          );
        })
        .map((row) => row.id);
    };
    const feeExpected = (params: Record<string, string>) => {
      const q = arNormalise(params.q ?? '');
      return rawFees
        .filter((row) => {
          if (params.archive !== 'all' && row.is_archived !== (params.archive === 'archived'))
            return false;
          const clientFilter = params.client ?? 'all';
          if (clientFilter === 'missing' && row.client_id !== null) return false;
          if (
            clientFilter !== 'all' &&
            clientFilter !== 'missing' &&
            row.client_id !== Number(clientFilter)
          )
            return false;
          for (const [parameter, links] of [
            ['covered', row.covered],
            ['referencing', row.referencing],
          ] as const) {
            const value = params[parameter] ?? 'all';
            if (value === 'missing' && links.some((link) => !link.retired)) return false;
            if (
              value !== 'all' &&
              value !== 'missing' &&
              !links.some((link) => !link.retired && link.matter === Number(value))
            )
              return false;
          }
          if (params.mfiles === 'present' && row.mfiles_id === null) return false;
          if (params.mfiles === 'missing' && row.mfiles_id !== null) return false;
          const relationshipHit = [...row.covered, ...row.referencing].some(
            (link) =>
              (!link.retired || link.original) &&
              link.values.some((value) => arNormalise(value).includes(q)),
          );
          return (
            !q ||
            arNormalise(row.id) === q ||
            arNormalise(row.contract_id) === q ||
            row.search_values.some((value) => arNormalise(value).includes(q)) ||
            relationshipHit
          );
        })
        .map((row) => row.id);
    };
    for (const [row, key] of [
      [documentId, 'id'],
      [documentLegacyId, 'legacy_id'],
    ] as const) {
      const value = row[key]!;
      for (const q of nonExactNumericForms(value))
        assert.equal(
          documentExpected({ archive: 'all', q }).includes(row.id),
          false,
          `document ${key} control ${q} must not match by ID or incidental text`,
        );
    }
    for (const [row, key] of [
      [feeId, 'id'],
      [feeContractId, 'contract_id'],
    ] as const) {
      const value = row[key]!;
      for (const q of nonExactNumericForms(value))
        assert.equal(
          feeExpected({ archive: 'all', q }).includes(row.id),
          false,
          `fee-letter ${key} control ${q} must not match by ID or incidental text`,
        );
    }
    const allFeeRows: Awaited<ReturnType<typeof readFeeLetters>>['rows'] = [];
    for (const session of sessions) {
      for (const params of documentCases) {
        const expected = documentExpected(params);
        const actual: number[] = [];
        let page = 1;
        let pages = 1;
        do {
          const result = await readDocuments(session, { ...params, page: String(page) }, service);
          assert.equal(result.total, expected.length, 'document oracle total');
          assert.equal(
            result.pages,
            Math.max(1, Math.ceil(expected.length / 25)),
            'document oracle page count',
          );
          pages = result.pages;
          actual.push(...result.rows.map((row) => row.id));
          page += 1;
        } while (page <= pages);
        assert.deepEqual(
          actual,
          expected,
          `${session.user.role} document oracle ${JSON.stringify(params)}`,
        );
        const edge = await readDocuments(session, { ...params, page: '2147483647' }, service);
        assert.equal(edge.total, expected.length, 'document edge total');
        assert.equal(edge.pages, Math.max(1, Math.ceil(expected.length / 25)));
        assert.deepEqual(
          edge.rows.map((row) => row.id),
          finalPage(expected),
          `${session.user.role} document last-page clamp`,
        );
      }
      for (const params of feeCases) {
        const expected = feeExpected(params);
        const actual: Awaited<ReturnType<typeof readFeeLetters>>['rows'] = [];
        let page = 1;
        let pages = 1;
        do {
          const result = await readFeeLetters(session, { ...params, page: String(page) }, service);
          assert.equal(result.total, expected.length, 'fee-letter oracle total');
          assert.equal(
            result.pages,
            Math.max(1, Math.ceil(expected.length / 25)),
            'fee-letter oracle page count',
          );
          pages = result.pages;
          actual.push(...result.rows);
          page += 1;
        } while (page <= pages);
        assert.deepEqual(
          actual.map((row) => row.id),
          expected,
          `${session.user.role} fee-letter oracle ${JSON.stringify(params)}`,
        );
        const edge = await readFeeLetters(session, { ...params, page: '2147483647' }, service);
        assert.equal(edge.total, expected.length, 'fee-letter edge total');
        assert.equal(edge.pages, Math.max(1, Math.ceil(expected.length / 25)));
        assert.deepEqual(
          edge.rows.map((row) => row.id),
          finalPage(expected),
          `${session.user.role} fee-letter last-page clamp`,
        );
        if (params.archive === 'all' && Object.keys(params).length === 1)
          allFeeRows.push(...actual);
      }
    }
    const feeRows = allFeeRows.slice(0, rawFees.length);
    const documentIds = documentExpected({ archive: 'all' });
    const serviceLinks = feeRows
      .flatMap((row) => [
        ...row.covered.map(
          (link) =>
            [
              'covered',
              row.id,
              link.id,
              link.matterId,
              link.retired,
              link.sourceReference,
            ] as const,
        ),
        ...row.referencing.map(
          (link) =>
            [
              'referencing',
              row.id,
              link.id,
              link.matterId,
              link.retired,
              link.sourceReference,
            ] as const,
        ),
      ])
      .sort((a, b) => `${a[0]}:${a[1]}:${a[2]}`.localeCompare(`${b[0]}:${b[1]}:${b[2]}`));
    const directLinks = (
      await owner.query(`SELECT 'covered' kind,l.fee_letter_id fee,l.id,l.matter_id matter,l.is_retired retired,
          l.legacy_matter_ref source FROM fee_letter_matters l
        UNION ALL SELECT 'referencing',r.fee_letter_id,r.id,r.matter_id,r.is_retired,r.legacy_reference_raw
          FROM matter_fee_letter_references r ORDER BY 1,2,3`)
    ).rows
      .map((row) => [row.kind, row.fee, row.id, row.matter, row.retired, row.source])
      .sort((a, b) => `${a[0]}:${a[1]}:${a[2]}`.localeCompare(`${b[0]}:${b[1]}:${b[2]}`));
    assert.deepEqual(
      serviceLinks,
      directLinks,
      'all forward and reverse relationship rows match SQL oracle',
    );
    console.log(
      `PASS independent full-population read/search/filter oracle: four roles, ${documentCases.length} document and ${feeCases.length} fee-letter cases each, ${documentIds.length} documents, ${feeRows.length} fee letters, ${serviceLinks.length} relationship rows`,
    );
  } finally {
    await owner.query('ROLLBACK');
    if (originalFixtureAccounts.length) {
      await owner.query('BEGIN');
      try {
        await owner.query("SET LOCAL session_replication_role='replica'");
        for (const row of originalFixtureAccounts)
          await owner.query(
            `UPDATE user_accounts SET person_id=$2,username=$3,username_normalized=$4,password_hash=$5,
              role_code=$6,is_enabled=$7,must_change_password=$8,failed_login_attempts=$9,
              locked_until=$10,session_version=$11,password_changed_at=$12,last_login_at=$13,
              created_at=$14,created_by=$15,updated_at=$16,updated_by=$17 WHERE id=$1`,
            [
              row.id,
              row.person_id,
              row.username,
              row.username_normalized,
              row.password_hash,
              row.role_code,
              row.is_enabled,
              row.must_change_password,
              row.failed_login_attempts,
              row.locked_until,
              row.session_version,
              row.password_changed_at,
              row.last_login_at,
              row.created_at,
              row.created_by,
              row.updated_at,
              row.updated_by,
            ],
          );
        await owner.query('COMMIT');
      } catch (error) {
        await owner.query('ROLLBACK');
        throw error;
      }
    }
    await service.$disconnect();
    await owner.end();
  }
}

async function main() {
  parserProof();
  await functionalProof();
  await concurrencyProof();
  await fullPopulationReadOracle();
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
