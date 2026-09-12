import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ClientBase } from 'pg';
import type { Session } from 'next-auth';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { mutateMatter, readMatterMutation } from '../../src/lib/matter-mutations';
import { createMaintenanceAuditMetadata } from '../../src/lib/audit-metadata';
import { withApprovedMigrationClient } from './migration-principal';
import { assertIsolatedTestCluster, type IsolatedPostgres } from './isolated-postgres-fixture';
import { staffReadOnlyState } from './staff-read-only-state';
import { assertMatterEditBoundary } from './matter-edit-checkpoint';

export async function proveMatterSupplemental(
  fixture: IsolatedPostgres,
  output: string,
  runtime: PrismaClient,
) {
  const results: unknown[] = [];
  const pass = (name: string, details: unknown = {}) => {
    results.push({ name, details });
    writeFileSync(join(output, 'supplemental-results.json'), JSON.stringify(results, null, 2));
    console.log('PASS ' + name);
  };
  const inspect = <T>(fn: (db: ClientBase) => Promise<T>) =>
    withApprovedMigrationClient(
      async (db) => {
        await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
        return fn(db);
      },
      { databaseUrl: fixture.migrationUrl },
    );
  try {
    const accounts = await runtime.userAccount.findMany({
      select: { id: true, personId: true, username: true, roleCode: true, sessionVersion: true },
    });
    const session = (role: string): Session => {
      const list = accounts.filter((a) => a.roleCode === role);
      assert.equal(list.length, 1);
      const a = list[0]!;
      return {
        expires: new Date(Date.now() + 3600000).toISOString(),
        user: {
          id: String(a.id),
          personId: a.personId,
          username: a.username,
          name: 'TEST ONLY',
          role: a.roleCode,
          sessionVersion: a.sessionVersion,
          mustChangePassword: false,
          auditSessionId: randomUUID(),
        },
      } as Session;
    };
    const admin = session('Administrator'),
      assistant = session('Litigation Assistant');
    const run = (action: 'create' | 'update', input: unknown, actor = admin) =>
      mutateMatter(actor, action, input, {
        database: runtime,
        auditMetadata: createMaintenanceAuditMetadata(),
      });
    const draft = {
      id: null,
      version: null,
      submission: randomUUID(),
      values: { subject: 'TEST ONLY precise replay proof', asked_amount: '1.00' },
    };
    const created = await run('create', draft);
    const snapshot = await inspect(staffReadOnlyState);
    assert.deepEqual(await run('create', draft), created);
    assert.deepEqual(await inspect(staffReadOnlyState), snapshot);
    const noop = await run('update', {
      id: created.id,
      version: created.version,
      submission: randomUUID(),
      values: { asked_amount: '01.0' },
    });
    assert.equal(noop.changed, false);
    assert.deepEqual(await inspect(staffReadOnlyState), snapshot);
    const detail = await readMatterMutation(admin, 'update', created.id, runtime);
    const update = {
      id: created.id,
      version: detail.record!.version,
      submission: randomUUID(),
      values: { notes_1: 'TEST ONLY update replay' },
    };
    const updated = await run('update', update);
    const updateState = await inspect(staffReadOnlyState);
    assert.deepEqual(await run('update', update), updated);
    assert.deepEqual(await inspect(staffReadOnlyState), updateState);
    const counts = await inspect(
      async (db) =>
        (
          await db.query(
            `SELECT (SELECT count(*)::integer FROM _migration.matter_edit_change WHERE matter_id=$1) changes,(SELECT count(*)::integer FROM _migration.matter_edit_submission WHERE matter_id=$1) submissions,(SELECT count(*)::integer FROM audit_events WHERE entity_schema='public' AND entity_table='matters' AND entity_key=jsonb_build_object('id',$1::integer)) events`,
            [created.id],
          )
        ).rows[0],
    );
    assert.deepEqual(counts, { changes: 2, submissions: 2, events: 2 });
    pass(
      'Exact create/update replay and numerically equal decimal no-op preserve all rows, full sequence/catalog digests',
      { counts },
    );
    const released = await inspect(
      async (db) =>
        (
          await db.query(
            "SELECT (r->>'id')::integer id FROM _migration.high_impact_application a,LATERAL jsonb_array_elements(a.created_rows) r WHERE r->>'table'='matters' ORDER BY (r->>'id')::integer LIMIT 1",
          )
        ).rows[0].id as number,
    );
    const releasedForm = await readMatterMutation(admin, 'update', released, runtime);
    await run('update', {
      id: released,
      version: releasedForm.record!.version,
      submission: randomUUID(),
      values: {
        notes_1: (releasedForm.record!.values.notes_1 ?? '') + '\nTEST ONLY released matter edit',
      },
    });
    await inspect((db) => assertMatterEditBoundary(db, 'historical-full-state-upgrade'));
    pass(
      'Released high-impact matter accepts attributable business edit while original released evidence remains exact',
      { released },
    );
    for (const sql of [
      'ALTER TABLE matters DISABLE TRIGGER matter_edit_complete',
      'ALTER TABLE matter_parties DISABLE TRIGGER zz_matter_edit_guard',
      'ALTER FUNCTION public.matter_edit_save(integer,integer,text,timestamptz,jsonb) SET search_path=public',
    ])
      await inspect(async (db) => {
        await db.query('BEGIN');
        try {
          await db.query(sql);
          await assert.rejects(assertMatterEditBoundary(db, 'historical-full-state-upgrade'));
        } finally {
          await db.query('ROLLBACK');
        }
      });
    await inspect(async (db) => {
      await db.query('BEGIN');
      try {
        await assert.rejects(
          db.query(
            "UPDATE _migration.matter_edit_import SET initial_values='{}'::jsonb WHERE entity_table='matters'",
          ),
          /immutable/u,
        );
      } finally {
        await db.query('ROLLBACK');
      }
    });
    pass(
      'Standing checker rejects disabled completion/identity guards and changed function search path; original evidence rejects mutation',
    );
    async function auditContext(db: ClientBase) {
      await db.query('SELECT audit_set_human_context($1)', [Number(admin.user.id)]);
      await db.query(
        "SELECT audit_set_event_context($1,$2,$3,NULL,'TEST ONLY explicit bypass proof','system')",
        [randomUUID(), randomUUID(), randomUUID()],
      );
    }
    for (const change of [
      'UPDATE user_accounts SET is_enabled=false,session_version=session_version+1 WHERE id=$1',
      'UPDATE user_accounts SET must_change_password=true,session_version=session_version+1 WHERE id=$1',
      "UPDATE user_accounts SET role_code='Lawyer',session_version=session_version+1 WHERE id=$1",
      'UPDATE people SET is_active=false WHERE id=(SELECT person_id FROM user_accounts WHERE id=$1)',
    ])
      await inspect(async (db) => {
        await db.query('BEGIN');
        try {
          await auditContext(db);
          await db.query(change, [Number(assistant.user.id)]);
          const actualVersion = (
            await db.query('SELECT session_version FROM user_accounts WHERE id=$1', [
              Number(assistant.user.id),
            ])
          ).rows[0].session_version;
          await db.query('SELECT audit_set_human_context($1)', [Number(assistant.user.id)]);
          await assert.rejects(
            db.query('SELECT matter_edit_save($1,$2,$3,$4,$5::jsonb)', [
              Number(assistant.user.id),
              actualVersion,
              assistant.user.role,
              assistant.expires,
              JSON.stringify({ ...draft, submission: randomUUID() }),
            ]),
            /Current authorized matter session required/u,
          );
        } finally {
          await db.query('ROLLBACK');
        }
      });
    pass(
      'Gateway independently rejects current disabled, forced-password, changed-role and inactive-person accounts',
    );
    const optional = await run('create', {
      ...draft,
      submission: randomUUID(),
      values: {
        subject: 'TEST ONLY optional values',
        case_number_ar: '',
        notes_1: 'J ق\n'.repeat(5000),
        matter_type_id: null,
        matter_category_id: null,
        degree_id: null,
        venue_id: null,
        asked_amount: '-0.01',
        judged_amount: null,
        start_date: '2000-02-29',
        end_date: null,
      },
      parties: [],
      lawyers: [],
    });
    const optionalState = await readMatterMutation(admin, 'update', optional.id, runtime);
    assert.equal(optionalState.record!.values.case_number_ar, '');
    assert.equal(optionalState.record!.values.notes_1, 'J ق\n'.repeat(5000));
    assert.equal(optionalState.record!.values.matter_type_id, null);
    assert.equal(optionalState.record!.values.asked_amount, '-0.01');
    assert.equal(optionalState.record!.values.start_date, '2000-02-29');
    assert.equal(optionalState.record!.values.end_date, null);
    assert.deepEqual(optionalState.parties, []);
    assert.deepEqual(optionalState.lawyers, []);
    const blanked = await run('update', {
      id: optional.id,
      version: optional.version,
      submission: randomUUID(),
      values: { case_number_ar: null },
    });
    const blankedState = await readMatterMutation(admin, 'update', blanked.id, runtime);
    assert.equal(blankedState.record!.values.case_number_ar, null);
    assert.equal(blankedState.record!.values.notes_1, optionalState.record!.values.notes_1);
    pass(
      'Long mixed multiline text, empty versus null, omitted fields, nullable classifications and negative exact decimal survive saves',
    );
    const choices = await readMatterMutation(admin, 'create', null, runtime);
    const category = choices.choices.matter_category_id!.find((c) => c.active)!;
    const classified = await run('create', {
      ...draft,
      submission: randomUUID(),
      values: {
        subject: 'TEST ONLY independent selections',
        matter_category_id: category.id,
        degree_id: choices.choices.degree_id!.find((c) => c.active)!.id,
        venue_id: choices.choices.venue_id!.find((c) => c.active)!.id,
      },
    });
    await inspect(async (db) => {
      await db.query('BEGIN');
      try {
        await auditContext(db);
        await db.query('UPDATE lookup_matter_category SET is_active=false WHERE id=$1', [
          category.id,
        ]);
        const saved = await db.query('SELECT matter_edit_save($1,$2,$3,$4,$5::jsonb) result', [
          Number(admin.user.id),
          admin.user.sessionVersion,
          admin.user.role,
          admin.expires,
          JSON.stringify({
            id: classified.id,
            version: classified.version,
            submission: randomUUID(),
            values: {
              matter_category_id: category.id,
              notes_1: 'TEST ONLY unchanged inactive classification',
            },
          }),
        ]);
        assert.equal(saved.rows[0].result.changed, true);
        await db.query('SAVEPOINT invalid_selection');
        await assert.rejects(
          db.query('SELECT matter_edit_save($1,$2,$3,$4,$5::jsonb)', [
            Number(admin.user.id),
            admin.user.sessionVersion,
            admin.user.role,
            admin.expires,
            JSON.stringify({
              ...draft,
              submission: randomUUID(),
              values: { subject: 'TEST ONLY invalid new choice', matter_category_id: category.id },
            }),
          ]),
        );
        await db.query('ROLLBACK TO SAVEPOINT invalid_selection');
      } finally {
        await db.query('ROLLBACK');
      }
    });
    const foreign = await inspect(
      async (db) =>
        (
          await db.query(
            'SELECT (SELECT id FROM matter_parties WHERE matter_id<>$1 ORDER BY id LIMIT 1) party,(SELECT id FROM matter_lawyers WHERE matter_id<>$1 ORDER BY id LIMIT 1) lawyer',
            [created.id],
          )
        ).rows[0],
    );
    const current = await readMatterMutation(admin, 'update', created.id, runtime);
    const beforeForeign = await inspect(staffReadOnlyState);
    for (const children of [
      {
        parties: [
          {
            id: foreign.party,
            side: 'client',
            party_name: 'TEST ONLY foreign identity',
            gender: null,
            ordinal: 1,
            roles: [],
          },
        ],
      },
      {
        lawyers: [
          {
            id: foreign.lawyer,
            person_id: choices.people.find((p) => p.active)!.id,
            role: 'support',
            position: 1,
          },
        ],
      },
    ])
      await assert.rejects(
        run('update', {
          id: created.id,
          version: current.record!.version,
          submission: randomUUID(),
          values: {},
          ...children,
        }),
      );
    assert.deepEqual((await inspect(staffReadOnlyState)).tables, beforeForeign.tables);
    pass(
      'Independent active classifications; unchanged inactive selection retained, new inactive selection refused; actual foreign child identities rejected',
    );
    const guardBefore = await inspect(staffReadOnlyState);
    await inspect(async (db) => {
      await db.query('BEGIN');
      try {
        await auditContext(db);
        await db.query('UPDATE matters SET subject=$1,row_version=row_version+1 WHERE id=$2', [
          'TEST ONLY unledgered write',
          created.id,
        ]);
        await assert.rejects(
          db.query('SET CONSTRAINTS ALL IMMEDIATE'),
          /complete continuous audited change evidence/u,
        );
      } finally {
        await db.query('ROLLBACK');
      }
    });
    assert.deepEqual((await inspect(staffReadOnlyState)).tables, guardBefore.tables);
    for (const input of [
      { ...draft, submission: randomUUID(), values: { created_by: 1 } },
      { ...draft, submission: randomUUID(), id: '1', version: '1' },
      {
        ...draft,
        submission: randomUUID(),
        values: { subject: 'TEST ONLY malformed' },
        lawyers: [{ id: null, person_id: 1, role: 'support', position: -1 }],
      },
      {
        ...draft,
        submission: randomUUID(),
        parties: [
          {
            id: null,
            side: 'client',
            party_name: { text: 'wrong' },
            gender: null,
            ordinal: 1,
            roles: [],
          },
        ],
      },
    ])
      await inspect(async (db) => {
        await db.query('BEGIN');
        try {
          await auditContext(db);
          await assert.rejects(
            db.query('SELECT matter_edit_save($1,$2,$3,$4,$5::jsonb)', [
              Number(admin.user.id),
              admin.user.sessionVersion,
              admin.user.role,
              admin.expires,
              JSON.stringify(input),
            ]),
          );
        } finally {
          await db.query('ROLLBACK');
        }
      });
    pass(
      'Bypassing the parser cannot choose audit fields, forge ID types, store malformed children or omit aggregate history',
    );
    const beforeRevocation = await inspect(staffReadOnlyState);
    await inspect(async (db) => {
      await db.query('BEGIN');
      await db.query('SELECT id FROM user_accounts WHERE id=$1 FOR UPDATE', [
        Number(assistant.user.id),
      ]);
      const saving = Promise.allSettled([
        run('create', { ...draft, submission: randomUUID() }, assistant),
      ]);
      try {
        let observed = false;
        for (let i = 0; i < 150; i++) {
          await db.query('SELECT pg_stat_clear_snapshot()');
          const n = Number(
            (
              await db.query(
                "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%public.matter_edit_save(%'",
              )
            ).rows[0].count,
          );
          if (n) {
            observed = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 20));
        }
        assert.ok(observed, 'Revocation actually overlaps a waiting save');
        await auditContext(db);
        await db.query('UPDATE user_accounts SET session_version=session_version+1 WHERE id=$1', [
          Number(assistant.user.id),
        ]);
        await db.query('COMMIT');
      } finally {
        await db.query('ROLLBACK');
        const outcomes = await saving;
        assert.equal(outcomes[0]!.status, 'rejected');
      }
    });
    const afterRevocation = await inspect(staffReadOnlyState);
    for (const table of beforeRevocation.tables.filter((t) =>
      [
        'matters',
        'matter_parties',
        'matter_party_roles',
        'matter_lawyers',
        'matter_edit_change',
        'matter_edit_submission',
      ].includes(t.table),
    ))
      assert.deepEqual(
        afterRevocation.tables.find((t) => t.schema === table.schema && t.table === table.table),
        table,
      );
    pass(
      'Observed current-account revocation/save overlap denies the stale account without partial matter changes',
    );
  } finally {
    await runtime.$disconnect();
  }
}
