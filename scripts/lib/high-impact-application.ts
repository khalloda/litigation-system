import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ClientBase } from 'pg';
import { withApprovedMigrationClient } from './migration-principal';
import { setMaintenanceAuditContext } from './audit-maintenance-context';
import { assertHighImpactStructure } from './high-impact-application-structure';
import {
  APPROVED_APPLICATION_BYTES,
  APPROVED_APPLICATION_FILE,
  APPROVED_APPLICATION_SHA256,
  D39_BRANCHES,
  D41_DESTINATIONS,
  assertApprovedApplicationBytes,
} from './high-impact-application-contract';
import {
  buildHighImpactApplicationPlan,
  approvedPlanDigest,
  applicationDigest,
  type Fields,
  type HighImpactApplicationPlan,
} from './high-impact-application-plan';
import {
  APPLICATION_KEY,
  APPROVED_PLAN_SHA256,
  CREATED_TABLES,
  applicationInventory,
  assertProjectedRow,
  assertStateIdentity,
  identifier,
  readApplicationState,
  rowDigest,
  readInitialRow,
  tableName,
  type ApplicationState,
  type CreatedRow,
} from './high-impact-application-state';
import {
  captureHistoricalIds,
  captureSourceEvidence,
  eventFingerprints,
  verifyCompatibility,
  verifyRowContinuity,
  verifySourceEvidence,
} from './high-impact-operational-proof';
import {
  assertRealApplicationRequest,
  assertRealPreconditions,
  collectRealPreconditions,
  checkRealInvariantsReadOnly,
  type RealApplicationOptions,
} from './high-impact-real-gate';

export const APPLICATION_PATH = `_migration/review/${APPROVED_APPLICATION_FILE}`;

function resolveFields(fields: Fields, created: readonly CreatedRow[]): Fields {
  const result = { ...fields };
  const find = (table: string, key: string) => {
    const matches = created.filter((row) => row.table === table && row.key === key);
    assert.equal(matches.length, 1, `unresolved or duplicated ${table} application reference`);
    return matches[0]!.id;
  };
  for (const [column, value] of Object.entries(result)) {
    if (column === 'branch_id' && typeof value === 'string')
      result[column] = find('lookup_client_branch', value.slice(4));
    if (column === 'court_id' && typeof value === 'string')
      result[column] = find('lookup_court', value.slice(4));
    if (column === 'matter_id' && typeof value === 'number' && value < 0) {
      result[column] = find('matters', `legacy:${-value}`);
    }
    if (column === 'party_id' && typeof value === 'string')
      result[column] = find('matter_parties', value);
    if (column === 'hearing_id' && typeof value === 'string')
      result[column] = find('hearings', value);
  }
  return result;
}

function references(plan: HighImpactApplicationPlan, created: readonly CreatedRow[]): CreatedRow[] {
  return [
    ...created,
    ...created
      .filter((row) => row.table === 'matters')
      .map((row) => {
        const matter = plan.rows.find((item) => item.table === 'matters' && item.key === row.key)!;
        return { ...row, key: `legacy:${matter.fields.legacy_id}` };
      }),
  ];
}

async function insertRow(db: ClientBase, table: string, fields: Fields): Promise<number> {
  assert.ok((CREATED_TABLES as readonly string[]).includes(table), 'unapproved application table');
  const columns = Object.keys(fields);
  const hasUpdatedAt = (
    await db.query<{ found: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name='updated_at') found`,
      table.includes('.') ? table.split('.') : ['public', table],
    )
  ).rows[0]!.found;
  const names = columns.map(identifier);
  const values = names.map((name) => `p.${name}`);
  if (hasUpdatedAt) {
    names.push('updated_at');
    values.push('CURRENT_TIMESTAMP');
  }
  const result = await db.query<{ id: number }>(
    `INSERT INTO ${tableName(table)} (${names.join(',')}) SELECT ${values.join(',')}
     FROM jsonb_populate_record(NULL::${tableName(table)},$1::jsonb) p RETURNING id`,
    [JSON.stringify(fields)],
  );
  assert.equal(result.rowCount, 1);
  return Number(result.rows[0]!.id);
}

export async function verifyHighImpactApplication(db: ClientBase): Promise<{
  state: ApplicationState | null;
  plan: HighImpactApplicationPlan | null;
}> {
  const prepared = await assertHighImpactStructure(db);
  const state = await readApplicationState(db);
  if (prepared) await verifyCompatibility(db, state);
  if (state === null) return { state: null, plan: null };
  assertStateIdentity(state);
  assert.equal(state.workbook_sha256, APPROVED_APPLICATION_SHA256);
  assert.equal(state.workbook_bytes, APPROVED_APPLICATION_BYTES);
  const anchor = (
    await db.query<{ event_metadata: Record<string, unknown> }>(
      'SELECT event_metadata FROM audit_events WHERE id=$1',
      [state.audit_event_ids.at(-1)],
    )
  ).rows[0];
  assert.ok(anchor, 'missing application audit event');
  assert.equal(
    anchor.event_metadata.application_evidence_sha256,
    applicationEvidenceDigest(state.created_rows, state.before_inventory, {
      ...state.evidence,
      events: state.evidence.events.slice(0, -1),
    }),
    'immutable application evidence changed',
  );
  const plan = state.evidence.plan;
  assert.equal(plan.digest, APPROVED_PLAN_SHA256, 'approved source plan drift');
  assert.equal(approvedPlanDigest(plan), APPROVED_PLAN_SHA256, 'stored approved plan drift');
  await verifySourceEvidence(db, state.evidence.sources);
  const expectedCreated = [
    ...plan.lookupCreations.map((row) => ({ table: row.table, key: row.label })),
    ...plan.rows.map(({ table, key }) => ({ table, key })),
  ];
  assert.deepEqual(
    state.created_rows.map(({ table, key }) => ({ table, key })),
    expectedCreated,
    'created-row identity inventory differs from the approved plan',
  );
  const refs = references(plan, state.created_rows);
  for (const row of plan.rows) {
    const target = state.created_rows.find(
      (item) => item.table === row.table && item.key === row.key,
    )!;
    await assertProjectedRow(
      db,
      row.table,
      target.id,
      resolveFields(row.fields, refs),
      target.initial,
    );
  }
  for (const row of plan.lookupCreations) {
    const target = state.created_rows.find(
      (item) => item.table === row.table && item.key === row.label,
    )!;
    await assertProjectedRow(db, row.table, target.id, { label_ar: row.label }, target.initial);
  }
  await verifyRowContinuity(db, state);
  const resolutions = (
    await db.query<{
      review_id: string;
      source_record_key: string;
      extraction_sha256: string;
      matter_id: number | null;
      hearing_id: number | null;
      matter_quarantine_id: string | null;
      hearing_quarantine_id: string | null;
      d41_note: boolean;
      resolved_by: number;
      resolved_at: Date;
      application_key: string;
    }>('SELECT * FROM _migration.high_impact_resolution ORDER BY review_id')
  ).rows;
  assert.equal(resolutions.length, 382, 'partial resolution ledger');
  const d41 = new Set<number>(D41_DESTINATIONS.map(([hearing]) => hearing));
  for (const decision of plan.dispositions) {
    const row = resolutions.find((item) => item.review_id === decision.reviewId);
    assert.ok(row, 'missing resolution identity');
    assert.equal(row.source_record_key, decision.sourceRecordKey);
    assert.equal(row.extraction_sha256, decision.extractionSha256);
    const table = decision.kind === 'matter' ? 'matters' : 'hearings';
    assert.equal(
      row.matter_id ?? row.hearing_id,
      state.created_rows.find(
        (item) => item.table === table && item.key === decision.sourceRecordKey,
      )!.id,
    );
    assert.equal(
      String(row.matter_quarantine_id ?? row.hearing_quarantine_id),
      decision.quarantineId,
    );
    assert.equal(row.d41_note, decision.kind === 'hearing' && d41.has(Number(decision.legacyId)));
    assert.equal(row.resolved_by, 1);
    assert.equal(row.application_key, APPLICATION_KEY);
    assert.equal(
      row.resolved_at.getTime(),
      state.applied_at.getTime(),
      'resolution timestamp changed',
    );
    assert.equal(
      decision.quarantineId,
      String(Number(decision.reviewId.slice(2))),
      'stored resolution identity changed',
    );
  }
  const pairs = (
    await db.query<{ client_id: number; branch_id: number; authority: string }>(
      "SELECT client_id,branch_id,authority FROM _migration.client_branch_compatibility WHERE authority='D39' ORDER BY client_id,branch_id",
    )
  ).rows;
  assert.equal(pairs.length, 3, 'missing or extra D39 pair');
  for (const branch of D39_BRANCHES) {
    const id: number = state.created_rows.find(
      (row) => row.table === 'lookup_client_branch' && row.key === branch.label,
    )!.id;
    assert.equal(
      pairs.filter((row) => row.client_id === branch.clientId && row.branch_id === id).length,
      1,
    );
  }
  const badPairs = (
    await db.query<{ count: number }>(
      `SELECT count(*)::integer count FROM matters m WHERE m.branch_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM _migration.client_branch_compatibility p WHERE p.client_id=m.client_id AND p.branch_id=m.branch_id)`,
    )
  ).rows[0]!.count;
  assert.equal(badPairs, 0, 'incompatible client/branch pair');
  const events = (
    await db.query<{
      id: string;
      actor_id: number;
      actor_key_snapshot: string;
      entity_table: string | null;
      entity_key: { id?: number } | null;
      action: string;
      outcome: string;
      request_id: string;
    }>('SELECT * FROM audit_events WHERE id=ANY($1::bigint[]) ORDER BY id', [state.audit_event_ids])
  ).rows;
  assert.equal(events.length, 808, 'missing application audit event');
  assert.equal(
    new Set(events.map((row) => row.request_id)).size,
    1,
    'application events lack shared request context',
  );
  assert.ok(
    events.every(
      (row) =>
        row.actor_id === 1 &&
        row.actor_key_snapshot === 'system_migration' &&
        row.outcome === 'succeeded',
    ),
    'incorrect application audit attribution',
  );
  for (const row of state.created_rows.filter((row) => !row.table.startsWith('quarantine.'))) {
    const expectedAction = [
      'matter_lawyers',
      'matter_parties',
      'matter_party_roles',
      'hearing_attendees',
    ].includes(row.table)
      ? 'relationship_added'
      : 'record_created';
    assert.equal(
      events.filter(
        (event) =>
          event.entity_table === row.table &&
          event.entity_key?.id === row.id &&
          event.action === expectedAction,
      ).length,
      1,
      'missing or duplicate created-row audit event',
    );
  }
  const lastMatter = Math.max(
    ...events.filter((row) => row.entity_table === 'matters').map((row) => Number(row.id)),
  );
  const firstHearing = Math.min(
    ...events.filter((row) => row.entity_table === 'hearings').map((row) => Number(row.id)),
  );
  assert.ok(lastMatter < firstHearing, 'hearing creation preceded parent creation');
  assert.deepEqual(
    await eventFingerprints(db, state.audit_event_ids),
    state.evidence.events,
    'altered application event contents/context/sequence',
  );
  return { state, plan };
}

function applicationEvidenceDigest(
  created: CreatedRow[],
  before: ApplicationState['before_inventory'],
  evidence: ApplicationState['evidence'],
): string {
  return applicationDigest({ created, before, evidence });
}

export async function runHighImpactApplication(
  options: {
    apply?: boolean;
    databaseUrl?: string;
    forceLateFailure?: boolean;
    real?: RealApplicationOptions;
  } = {},
): Promise<{
  mode: 'dry-run' | 'applied' | 'no-op';
  digest: string;
  counts: Record<string, number>;
}> {
  const bytes = readFileSync(APPLICATION_PATH);
  assertApprovedApplicationBytes(APPLICATION_PATH, bytes);
  assert.ok(
    !(options.real && options.apply),
    'fixture and real application modes cannot be combined',
  );
  assert.ok(!(options.real && options.forceLateFailure), 'real mode cannot run a failure fixture');
  if (options.real) assertRealApplicationRequest(options.real, options.databaseUrl);
  const write = Boolean(options.apply || options.real);
  return withApprovedMigrationClient(
    async (db) => {
      const name = (await db.query<{ name: string }>('SELECT current_database() name')).rows[0]!
        .name;
      if (options.apply)
        assert.match(
          name,
          /^litigation_task35b_fixture_[a-z0-9_]+$/,
          'this reviewed preparation phase permits application only to task-specific disposable databases',
        );
      await db.query(
        write
          ? 'BEGIN ISOLATION LEVEL SERIALIZABLE'
          : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',
      );
      try {
        if (options.real) {
          // Lock only this target's tables. No row write occurs before every
          // gate passes; readers remain allowed for the read-only invariant run.
          const targets = (
            await db.query<{ schema: string; table: string }>(
              "SELECT schemaname schema,tablename \"table\" FROM pg_tables WHERE schemaname IN ('public','staging','quarantine','_migration') ORDER BY schemaname,tablename",
            )
          ).rows;
          await db.query(
            `LOCK TABLE ${targets.map((t) => `${identifier(t.schema)}.${identifier(t.table)}`).join(',')} IN SHARE ROW EXCLUSIVE MODE`,
          );
          const lockedPlan = await buildHighImpactApplicationPlan(db, APPLICATION_PATH, bytes);
          const invariantCount = checkRealInvariantsReadOnly(options.databaseUrl);
          assertRealPreconditions(
            await collectRealPreconditions(
              db,
              bytes,
              APPLICATION_PATH,
              lockedPlan.digest,
              invariantCount,
            ),
            options.real.expectedRevision,
          );
        }
        if (write) {
          await setMaintenanceAuditContext(db, 'task-3-5b-owner-decisions');
          await db.query("SELECT pg_advisory_xact_lock(hashtext('task-3-5b-owner-decisions'))");
        }
        const existing = await verifyHighImpactApplication(db);
        if (existing.state !== null) {
          await db.query('ROLLBACK');
          return { mode: 'no-op', digest: existing.plan!.digest, counts: existing.plan!.counts };
        }
        const plan = await buildHighImpactApplicationPlan(db, APPLICATION_PATH, bytes);
        assert.equal(plan.digest, APPROVED_PLAN_SHA256, 'dry-run plan is not the approved plan');
        if (!write) {
          await db.query('ROLLBACK');
          return { mode: 'dry-run', digest: plan.digest, counts: plan.counts };
        }
        assert.equal(
          (
            await db.query<{ count: number }>(
              'SELECT count(*)::integer count FROM _migration.high_impact_resolution',
            )
          ).rows[0]!.count,
          0,
          'partial resolution application',
        );
        // Rebuild within the locked serializable snapshot before writing anything.
        assert.equal(
          (await buildHighImpactApplicationPlan(db, APPLICATION_PATH, bytes)).digest,
          plan.digest,
        );
        const before = await applicationInventory(db);
        const evidence: ApplicationState['evidence'] = {
          plan,
          sources: await captureSourceEvidence(db),
          historicalIds: await captureHistoricalIds(db),
          events: [],
        };
        const eventFloor = (
          await db.query<{ id: string }>('SELECT coalesce(max(id),0)::text id FROM audit_events')
        ).rows[0]!.id;
        const created: CreatedRow[] = [];
        for (const lookup of plan.lookupCreations) {
          const id = await insertRow(db, lookup.table, { label_ar: lookup.label });
          created.push({
            table: lookup.table,
            key: lookup.label,
            id,
            sha256: await rowDigest(db, lookup.table, id),
            initial: await readInitialRow(db, lookup.table, id),
          });
        }
        for (const branch of D39_BRANCHES)
          await db.query(
            "INSERT INTO _migration.client_branch_compatibility(client_id,branch_id,authority) VALUES($1,$2,'D39')",
            [
              branch.clientId,
              created.find(
                (row) => row.table === 'lookup_client_branch' && row.key === branch.label,
              )!.id,
            ],
          );
        for (const row of plan.rows) {
          const fields = resolveFields(row.fields, references(plan, created));
          const id = await insertRow(db, row.table, fields);
          await assertProjectedRow(db, row.table, id, fields);
          created.push({
            table: row.table,
            key: row.key,
            id,
            sha256: await rowDigest(db, row.table, id),
            initial: await readInitialRow(db, row.table, id),
          });
        }
        evidence.events = await eventFingerprints(
          db,
          (
            await db.query<{ id: string }>(
              'SELECT id::text FROM audit_events WHERE id>$1 ORDER BY audit_events.id',
              [eventFloor],
            )
          ).rows.map((r) => r.id),
        );
        assert.equal(
          evidence.events.length,
          807,
          'unexpected application row/configuration events',
        );
        await db.query(
          `SELECT public.audit_write_event('record_created','succeeded',NULL,NULL,NULL,
        ARRAY[]::text[],'{}','{}',NULL,NULL,'task-3-5b:application-ledger','{}','owner_decisions_applied',
        jsonb_build_object('workbook_sha256',$1::text,'plan_sha256',$2::text,'resolution_count',382,'authority','D39/D40/D41','application_evidence_sha256',$3::text))`,
          [
            APPROVED_APPLICATION_SHA256,
            plan.digest,
            applicationEvidenceDigest(created, before, evidence),
          ],
        );
        const eventIds = (
          await db.query<{ id: string }>(
            'SELECT id::text FROM audit_events WHERE id>$1 ORDER BY audit_events.id',
            [eventFloor],
          )
        ).rows.map((row) => row.id);
        assert.equal(eventIds.length, 808, 'unexpected/missing application audit events');
        evidence.events = await eventFingerprints(db, eventIds);
        await db.query(
          `INSERT INTO _migration.high_impact_application(application_key,workbook_sha256,workbook_bytes,
        plan_sha256,created_rows,before_inventory,audit_event_ids,evidence) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::bigint[],$8::jsonb)`,
          [
            APPLICATION_KEY,
            APPROVED_APPLICATION_SHA256,
            APPROVED_APPLICATION_BYTES,
            plan.digest,
            JSON.stringify(created),
            JSON.stringify(before),
            eventIds,
            JSON.stringify(evidence),
          ],
        );
        const d41 = new Set<number>(D41_DESTINATIONS.map(([hearing]) => hearing));
        for (const decision of plan.dispositions) {
          const matter = decision.kind === 'matter';
          const target = created.find(
            (row) =>
              row.table === (matter ? 'matters' : 'hearings') &&
              row.key === decision.sourceRecordKey,
          )!;
          await db.query(
            `INSERT INTO _migration.high_impact_resolution(review_id,application_key,source_record_key,
          extraction_sha256,matter_quarantine_id,hearing_quarantine_id,matter_id,hearing_id,d41_note)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              decision.reviewId,
              APPLICATION_KEY,
              decision.sourceRecordKey,
              decision.extractionSha256,
              matter ? decision.quarantineId : null,
              matter ? null : decision.quarantineId,
              matter ? target.id : null,
              matter ? null : target.id,
              !matter && d41.has(Number(decision.legacyId)),
            ],
          );
        }
        await db.query('SET CONSTRAINTS ALL IMMEDIATE');
        const verified = await verifyHighImpactApplication(db);
        assert.deepEqual(
          await applicationInventory(db, verified.state),
          before,
          'application-time historical/protected/lower-impact inventory changed',
        );
        if (options.forceLateFailure) throw new Error('fixture forced late Task 3.5B failure');
        await db.query('COMMIT');
        return { mode: 'applied', digest: plan.digest, counts: plan.counts };
      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }
    },
    { databaseUrl: options.databaseUrl },
  );
}
