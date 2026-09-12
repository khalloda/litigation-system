import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Session } from 'next-auth';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { mutateMatter, readMatterMutation } from '../../src/lib/matter-mutations';
import { createMaintenanceAuditMetadata } from '../../src/lib/audit-metadata';
import { withApprovedMigrationClient } from './migration-principal';
import { assertIsolatedTestCluster, type IsolatedPostgres } from './isolated-postgres-fixture';
import { staffReadOnlyState } from './staff-read-only-state';
import { matterMigrationCatalog } from './matter-migration-delta';
import { verifyHighImpactApplication } from './high-impact-application';
import { assertMatterEditBoundary } from './matter-edit-checkpoint';

export async function proveMatterCorrections(
  fixture: IsolatedPostgres,
  output: string,
  runtime: PrismaClient,
  original: boolean,
  selectionOnly = false,
) {
  const inspect = <T>(work: Parameters<typeof withApprovedMigrationClient<T>>[0]) =>
    withApprovedMigrationClient(
      async (db) => {
        await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
        return work(db);
      },
      { databaseUrl: fixture.migrationUrl },
    );
  const results: unknown[] = [];
  const pass = (name: string, details: unknown = {}) => {
    results.push({ name, details });
    writeFileSync(join(output, 'correction-results.json'), JSON.stringify(results, null, 2));
    console.log('PASS ' + name);
  };
  const complete = async () => ({
    state: await inspect(staffReadOnlyState),
    catalog: await inspect(matterMigrationCatalog),
  });
  try {
    const accounts = await runtime.userAccount.findMany({
      select: { id: true, personId: true, username: true, roleCode: true, sessionVersion: true },
    });
    const rows = accounts.filter((a) => a.roleCode === 'Administrator');
    assert.equal(rows.length, 1);
    const a = rows[0]!;
    const actor = {
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
    const read = (id: number | null) =>
      readMatterMutation(actor, id === null ? 'create' : 'update', id, runtime);
    const run = (input: unknown, create = false) =>
      mutateMatter(actor, create ? 'create' : 'update', input, {
        database: runtime,
        auditMetadata: createMaintenanceAuditMetadata(),
      });
    const direct = (input: unknown) =>
      inspect(async (db) => {
        await db.query('BEGIN');
        try {
          await db.query('SELECT audit_set_human_context($1)', [a.id]);
          await db.query(
            "SELECT audit_set_event_context($1,$2,$3,NULL,'TEST ONLY correction direct gateway','system')",
            [randomUUID(), randomUUID(), randomUUID()],
          );
          const result = (
            await db.query('SELECT matter_edit_save($1,$2,$3,$4,$5::jsonb) result', [
              a.id,
              a.sessionVersion,
              a.roleCode,
              actor.expires,
              JSON.stringify(input),
            ])
          ).rows[0]!.result;
          await db.query('COMMIT');
          return result;
        } catch (error) {
          await db.query('ROLLBACK');
          throw error;
        }
      });
    const options = await read(null);
    const created = await run(
      {
        id: null,
        version: null,
        submission: randomUUID(),
        values: { subject: 'TEST ONLY correction fixture', asked_amount: '1.00' },
        parties: [
          {
            id: null,
            side: 'client',
            party_name: 'TEST ONLY correction party',
            gender: 'f',
            ordinal: 1,
            roles: [{ id: null, role_id: options.roles.find((r) => r.active)!.id, ordinal: 1 }],
          },
        ],
        lawyers: [
          {
            id: null,
            person_id: options.people.find((p) => p.active)!.id,
            role: 'lead',
            position: 1,
          },
        ],
      },
      true,
    );
    const request = async (id: number) => {
      const s = await read(id);
      return {
        id,
        version: s.record!.version,
        submission: randomUUID(),
        values: {},
        parties: s.parties,
        lawyers: s.lawyers,
      };
    };
    if (selectionOnly) {
      for (const kind of ['lawyer', 'capacity']) {
        const before = await read(created.id);
        const input = await request(created.id);
        const originalId =
          kind === 'lawyer' ? before.lawyers[0]!.id! : before.parties[0]!.roles[0]!.id!;
        const retained = () =>
          inspect(async (db) =>
            kind === 'lawyer'
              ? (
                  await db.query(
                    'SELECT id,person_id,is_retired FROM matter_lawyers WHERE matter_id=$1 ORDER BY id',
                    [created.id],
                  )
                ).rows
              : (
                  await db.query(
                    'SELECT id,role_id,is_retired FROM matter_party_roles WHERE party_id=$1 ORDER BY id',
                    [before.parties[0]!.id],
                  )
                ).rows,
          );
        if (kind === 'lawyer')
          input.lawyers[0] = {
            ...input.lawyers[0]!,
            id: null,
            person_id: options.people.find(
              (p) => p.active && p.id !== before.lawyers[0]!.person_id,
            )!.id,
          };
        else
          input.parties[0]!.roles[0] = {
            ...input.parties[0]!.roles[0]!,
            id: null,
            role_id: options.roles.find(
              (r) => r.active && r.id !== before.parties[0]!.roles[0]!.role_id,
            )!.id,
          };
        assert.equal((await run(input)).changed, true);
        const changed = await retained();
        assert.equal(changed.find((r) => r.id === originalId)!.is_retired, true);
        const restore = await request(created.id);
        if (kind === 'lawyer') restore.lawyers = before.lawyers.map((l) => ({ ...l, id: null }));
        else restore.parties[0]!.roles = before.parties[0]!.roles.map((r) => ({ ...r, id: null }));
        assert.equal((await run(restore)).changed, true);
        const restored = await retained();
        assert.equal(restored.find((r) => r.id === originalId)!.is_retired, false);
        assert.equal(restored.filter((r) => !r.is_retired).length, 1);
        assert.equal(restored.filter((r) => r.is_retired).length, 1);
        const after = await read(created.id);
        assert.deepEqual(after.lawyers, before.lawyers);
        assert.deepEqual(after.parties, before.parties);
        assert.equal(BigInt(after.record!.version), BigInt(before.record!.version) + 2n);
        const counts = await inspect(
          async (db) =>
            (
              await db.query(
                "SELECT (SELECT count(*)::integer FROM _migration.matter_edit_change WHERE matter_id=$1) changes,(SELECT count(*)::integer FROM _migration.matter_edit_submission WHERE matter_id=$1) submissions,(SELECT count(*)::integer FROM audit_events WHERE entity_table='matters' AND entity_key=jsonb_build_object('id',$1::integer)) events",
                [created.id],
              )
            ).rows[0],
        );
        for (const n of Object.values(counts)) assert.equal(n, Number(after.record!.version));
        pass(
          'R1 actual ' +
            kind +
            ' selection change and null-ID restoration reuse correct history/identity with exactly two real edits',
          { originalId, changed, restored, counts },
        );
      }
      await inspect((db) => assertMatterEditBoundary(db, 'historical-full-state-upgrade'));
      pass(
        'Additional selection controls leave complete current and original aggregate boundary valid',
      );
      return;
    }
    const stable = await complete();
    assert.equal(
      (await run({ ...(await request(created.id)), values: { asked_amount: '01.0' } })).changed,
      false,
    );
    assert.deepEqual(await complete(), stable);
    pass('R1 untouched and decimal no-op: all tables, full sequences and catalog unchanged');
    for (const selection of ['lawyer', 'capacity']) {
      const input = await request(created.id);
      if (selection === 'lawyer') input.lawyers[0]!.id = null;
      else input.parties[0]!.roles[0]!.id = null;
      const before = await complete();
      const result = await run(input);
      assert.equal(result.changed, original);
      const after = await complete();
      if (original) assert.notDeepEqual(after.state.tables, before.state.tables);
      else assert.deepEqual(after, before);
      if (!original) {
        assert.equal((await direct(input)).changed, false);
        assert.deepEqual(await complete(), before);
        const forged = structuredClone(input);
        if (selection === 'lawyer') forged.lawyers[0]!.id = 2147483647;
        else forged.parties[0]!.roles[0]!.id = 2147483647;
        await assert.rejects(direct(forged), /Foreign (lawyer|capacity) identity/u);
        assert.deepEqual(await complete(), before);
      }
      pass(
        'R1 ' +
          selection +
          ' round-trip gateway ' +
          (original ? 'false edit reproduced' : 'effective no-op'),
        { result, before, after },
      );
    }
    if (!original) {
      const changed = {
        ...(await request(created.id)),
        values: { notes_1: 'TEST ONLY canonical identity replay' },
      };
      changed.lawyers[0]!.id = null;
      changed.parties[0]!.roles[0]!.id = null;
      const saved = await run(changed);
      assert.equal(saved.changed, true);
      const before = await complete();
      assert.deepEqual(await run(changed), saved);
      const resolved = await request(created.id);
      await assert.rejects(
        run({ ...changed, lawyers: resolved.lawyers, parties: resolved.parties }),
        /submission/u,
      );
      await assert.rejects(run({ ...changed, submission: randomUUID() }), /stale/u);
      assert.deepEqual(await complete(), before);
      pass(
        'R1 real change with resolved IDs, exact replay, same-effective different committed payload and stale request refusal preserve complete state',
      );
    }
    // Resolve PostgreSQL IDs through immutable release evidence, never Access-ID equality.
    const protectedRows = await inspect(
      async (db) =>
        (
          await db.query<{ id: number; legacy_id: number; court_id: number }>(
            `SELECT m.id,m.legacy_id,m.court_id FROM _migration.high_impact_application a CROSS JOIN LATERAL jsonb_array_elements(a.created_rows) c JOIN matters m ON m.id=(c->>'id')::integer WHERE c->>'table'='matters' AND (c->'initial'->>'legacy_id')::integer IN (467,468,515) ORDER BY m.legacy_id`,
          )
        ).rows,
    );
    assert.deepEqual(
      protectedRows.map((r) => r.legacy_id),
      [467, 468, 515],
    );
    for (const row of protectedRows) {
      for (const court of [
        options.choices.court_id!.find((c) => c.active && c.id !== row.court_id)!.id,
        null,
      ]) {
        const input = { ...(await request(row.id)), values: { court_id: court } };
        const before = await complete();
        if (original) {
          assert.equal((await run(input)).changed, true);
          await assert.rejects(inspect(verifyHighImpactApplication), /D41 matter court changed/u);
          await run({ ...(await request(row.id)), values: { court_id: row.court_id } });
          await inspect(verifyHighImpactApplication);
        } else {
          await assert.rejects(run(input));
          assert.deepEqual(await complete(), before);
          await inspect(async (db) => {
            await db.query('BEGIN');
            try {
              await db.query('SELECT audit_set_human_context($1)', [a.id]);
              await db.query(
                "SELECT audit_set_event_context($1,$2,$3,NULL,'TEST ONLY D41 row guard','system')",
                [randomUUID(), randomUUID(), randomUUID()],
              );
              await assert.rejects(
                db.query('UPDATE matters SET court_id=$1,row_version=row_version+1 WHERE id=$2', [
                  court,
                  row.id,
                ]),
                /D41 court is protected/u,
              );
            } finally {
              await db.query('ROLLBACK');
            }
          });
          assert.deepEqual(await complete(), before);
          await inspect(async (db) => {
            await db.query('BEGIN');
            try {
              await db.query('SELECT audit_set_human_context($1)', [a.id]);
              await db.query(
                "SELECT audit_set_event_context($1,$2,$3,NULL,'TEST ONLY correction direct gateway','system')",
                [randomUUID(), randomUUID(), randomUUID()],
              );
              await assert.rejects(
                db.query('SELECT matter_edit_save($1,$2,$3,$4,$5::jsonb)', [
                  a.id,
                  a.sessionVersion,
                  a.roleCode,
                  actor.expires,
                  JSON.stringify(input),
                ]),
                /D41 court is protected/u,
              );
            } finally {
              await db.query('ROLLBACK');
            }
          });
          assert.deepEqual(await complete(), before);
        }
        pass(
          'R2 ' +
            row.legacy_id +
            ' ' +
            (court === null ? 'cleared' : 'changed') +
            ' court ' +
            (original
              ? 'conflict reproduced and fixture court restored'
              : 'service and direct gateway refused exactly'),
          { ...row, attemptedCourt: court },
        );
      }
      assert.equal(
        (
          await run({
            ...(await request(row.id)),
            values: { notes_1: 'TEST ONLY unrelated protected-matter edit' },
          })
        ).changed,
        true,
      );
    }
    assert.equal(
      (
        await run({
          ...(await request(created.id)),
          values: { court_id: options.choices.court_id!.find((c) => c.active)!.id },
        })
      ).changed,
      true,
    );
    await inspect(verifyHighImpactApplication);
    pass(
      'R2 all three allow unrelated edits; ordinary matter court changes; unchanged full D39/D40/D41 verifier passes',
      { protectedRows },
    );
  } finally {
    await runtime.$disconnect();
  }
}
