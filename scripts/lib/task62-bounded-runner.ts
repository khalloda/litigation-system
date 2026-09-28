import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { decode } from 'next-auth/jwt';
import { readSessionClaims } from '../../src/lib/auth/session';
import { TASK62_PLAN_SHA, task62SourceFailures } from './task62-source-checkpoint';
import { migrationDatabaseTarget, withApprovedMigrationClient } from './migration-principal';
import { assertIsolatedTestCluster } from './isolated-postgres-fixture';
import { assertStaffCheckpoint } from './staff-roster-checkpoint';

type Party = {
  id: null;
  side: string;
  party_name: string;
  gender: null;
  ordinal: number;
  roles: { id: null; role_id: number | null; ordinal: number; proposedCapacitySpelling: string }[];
};
type PartySource = {
  matterId: number;
  legacyMatterId: number;
  quarantineId: number;
  side: string;
  retainedRaw: string;
  sourceRecordKey: string;
  sourceExtractionSha256: string;
  currentMatterVersion: string;
  proposedParty: Party;
  unreviewedRoles: { value: string }[];
};
type HearingSource = {
  sourceHearingId: number;
  sourceMatterId: number;
  currentMatterId: number;
  currentMatterVersion: string;
  currentFields: Record<string, string | number | null>;
  lookupRaw: { court_id: string; action_id: string };
  sourceRecord: Record<string, unknown>;
};
type Choice = {
  clientId: number;
  matterId: number;
  baselineMatterVersion: string;
  selected: boolean;
  existingHearingId: number | null;
  newHearingSourceId: number | null;
};
type Plan = {
  source: { path: string; sha256: string };
  parentMatterUnion: number[];
  payloads: {
    capacityMappings: {
      sourceSpelling: string;
      existingRoleId: number | null;
      displayM: string;
      displayF: string;
    }[];
    partyReleases: { sourceRow: PartySource; approvedParty: Party }[];
    hearingAdditions: { sourceRow: HearingSource }[];
    selectionInitialization: {
      approvedSelection: Choice;
      sourceRow: { sourceMatterId: number; matterVersion: string };
    }[];
  };
};
type Result = { id: number; version: string; changed: boolean };
type Save = { request: Record<string, unknown>; result: Result };
type Manifest = {
  operationId: string;
  planSha256: string;
  capacities: {
    sourceSpelling: string;
    id: number;
    auditEventId: string;
    afterValues: Record<string, unknown>;
  }[];
  matters: Save[];
  hearings: (Save & { sourceHearingId: number; courtId: number; actionId: number })[];
  selections: Save[];
};
type Wrapper = {
  scope: 'fixture-readiness' | 'reviewed-owner-operation';
  cluster: string;
  database: string;
  host: string;
  port: number;
  planSha256: string;
  runnerSha256: string;
  fixtureEnvironment?: NodeJS.ProcessEnv;
  independentReview?: { path: string; sha256: string };
  ownerAdoption?: { path: string; sha256: string };
};
type Journal = {
  schema: string;
  operationId: string;
  planSha256: string;
  wrapperSha256: string;
  target: { cluster: string; database: string };
  createdAt: string;
};
export const boundedHash = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const load = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
function step(operation: string, label: string) {
  const h = boundedHash(operation + ':' + label);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export function prepareBoundedJournal(
  planPath: string,
  wrapperPath: string,
  journalPath: string,
): Journal {
  const plan = readFileSync(planPath);
  assert.equal(boundedHash(plan), TASK62_PLAN_SHA);
  const wrapper = load(wrapperPath) as Wrapper;
  assert.equal(wrapper.planSha256, TASK62_PLAN_SHA);
  const expected = {
    schema: 'task62-bounded-operation-v1',
    planSha256: TASK62_PLAN_SHA,
    wrapperSha256: boundedHash(readFileSync(wrapperPath)),
    target: { cluster: wrapper.cluster, database: wrapper.database },
  };
  if (existsSync(journalPath)) {
    const j = load(journalPath) as Journal;
    for (const [k, v] of Object.entries(expected)) assert.deepEqual(j[k as keyof Journal], v);
    return j;
  }
  const id = randomUUID();
  const j = { ...expected, operationId: '', createdAt: new Date().toISOString() };
  // Keep UUID segment boundaries explicit; the reserved version5 namespace is private maintenance.
  j.operationId = `62620075-${id.slice(9, 13)}-5${id.slice(15, 18)}-${id.slice(19, 23)}-${id.slice(24)}`;
  assert.match(
    j.operationId,
    /^62620075-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u,
  );
  writeFileSync(journalPath, JSON.stringify(j, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return j;
}

export async function runBoundedTask62(input: {
  planPath: string;
  wrapperPath: string;
  journalPath: string;
  mode: 'plan' | 'apply';
  sessionPath?: string;
  databaseUrl?: string;
}) {
  const text = readFileSync(input.planPath, 'utf8');
  assert.equal(boundedHash(text), TASK62_PLAN_SHA);
  const plan = JSON.parse(text) as Plan;
  assert.equal(
    boundedHash(readFileSync(plan.source.path)),
    plan.source.sha256,
    'Exact bound Access copy required',
  );
  const wrapper = load(input.wrapperPath) as Wrapper;
  assert.equal(wrapper.planSha256, TASK62_PLAN_SHA);
  assert.equal(
    wrapper.runnerSha256,
    boundedHash(readFileSync('scripts/lib/task62-bounded-runner.ts')),
    'Reviewed runner bytes required',
  );
  const journal = load(input.journalPath) as Journal;
  assert.equal(journal.schema, 'task62-bounded-operation-v1');
  assert.match(
    journal.operationId,
    /^62620075-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u,
  );
  assert.equal(journal.planSha256, TASK62_PLAN_SHA);
  assert.equal(journal.wrapperSha256, boundedHash(readFileSync(input.wrapperPath)));
  assert.deepEqual(journal.target, { cluster: wrapper.cluster, database: wrapper.database });
  const target = migrationDatabaseTarget(input.databaseUrl);
  const url = new URL(`${target.protocol}//${target.hostname}:${target.port}/${target.database}`);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname), 'Local reviewed target only');
  assert.equal(url.hostname, wrapper.host);
  assert.equal(Number(url.port || 5432), wrapper.port);
  assert.equal(url.pathname, '/' + wrapper.database);
  if (wrapper.scope === 'reviewed-owner-operation') {
    assert.equal(wrapper.cluster, '7676117521894273062');
    assert.equal(wrapper.database, 'litigation');
    assert.equal(wrapper.port, 5433);
    if (input.mode === 'apply')
      for (const receipt of [wrapper.independentReview, wrapper.ownerAdoption]) {
        assert.ok(receipt, 'Separate readiness PASS and operational adoption required');
        assert.equal(boundedHash(readFileSync(receipt.path)), receipt.sha256);
      }
  } else assert.equal(wrapper.scope, 'fixture-readiness');
  const authority = input.mode === 'apply' ? await genuineSession(input.sessionPath) : null;
  return withApprovedMigrationClient(
    async (db) => {
      const actual = (
        await db.query(
          'SELECT current_database() database,(SELECT system_identifier::text FROM pg_control_system()) cluster',
        )
      ).rows[0];
      assert.deepEqual(actual, journal.target);
      if (wrapper.scope === 'fixture-readiness') {
        assert.ok(wrapper.fixtureEnvironment);
        await assertIsolatedTestCluster(db, url, wrapper.fixtureEnvironment);
      }
      await db.query(
        input.mode === 'plan'
          ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'
          : 'BEGIN ISOLATION LEVEL SERIALIZABLE',
      );
      try {
        assert.equal(await assertStaffCheckpoint(db, 'historical-full-state-upgrade'), 75);
        assert.deepEqual(await task62SourceFailures(db), [], 'Permanent candidate75 checks');
        assert.equal(
          (
            await db.query(
              'SELECT count(*)::int n FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
            )
          ).rows[0].n,
          75,
        );
        if (input.mode === 'apply')
          await db.query(
            "SELECT pg_advisory_xact_lock(hashtextextended('task62-bounded-source-repair',75))",
          );
        if (authority) {
          await db.query('SELECT public.matter_edit_state($1,$2,$3,$4::timestamptz,$5)', [
            authority.userId,
            authority.sessionVersion,
            authority.role,
            new Date(authority.absoluteExpiresAt).toISOString(),
            plan.parentMatterUnion[0],
          ]);
          const login = (
            await db.query(
              "SELECT count(*)::int n FROM public.audit_events e JOIN public.audit_actors a ON a.id=e.actor_id WHERE e.action='login_succeeded' AND e.outcome='succeeded' AND e.audit_session_id=$1::uuid AND a.user_account_id=$2",
              [authority.auditSessionId, authority.userId],
            )
          ).rows[0];
          assert.equal(login.n, 1, 'Genuine login audit session');
        }
        const existing = (
          await db.query(
            'SELECT operation_id,operation_manifest,approved_plan_text FROM _migration.task62_source_receipt ORDER BY kind,source_identity',
          )
        ).rows;
        if (existing.length) {
          assert.equal(existing.length, 31, 'Partial or unrelated prior operation');
          assert.ok(
            existing.every(
              (r) => r.operation_id === journal.operationId && r.approved_plan_text === text,
            ),
          );
          assert.equal(
            (
              await db.query('SELECT _migration.task62_source_operation_valid($1::uuid) valid', [
                journal.operationId,
              ])
            ).rows[0].valid,
            true,
          );
          await db.query('COMMIT');
          return {
            status: 'ALREADY_APPLIED',
            operation: journal.operationId,
            manifest: existing[0].operation_manifest,
            changed: false,
          };
        }
        assert.equal(
          (
            await db.query(
              'SELECT count(*)::int n FROM public.audit_events WHERE request_id=$1::uuid',
              [journal.operationId],
            )
          ).rows[0].n,
          0,
          'Partial unreceipted prior operation',
        );
        const parents = (
          await db.query(
            `SELECT id,legacy_id,client_id,row_version::text version,is_archived FROM public.matters WHERE id=ANY($1::int[]) ORDER BY id${input.mode === 'apply' ? ' FOR UPDATE' : ''}`,
            [plan.parentMatterUnion],
          )
        ).rows;
        assert.deepEqual(
          parents.map((r) => r.id),
          plan.parentMatterUnion,
        );
        assert.ok(parents.every((r) => r.client_id === 245 && !r.is_archived));
        assert.equal(
          (await db.query('SELECT is_archived FROM public.clients WHERE id=245')).rows[0]
            .is_archived,
          false,
        );
        const versions = new Map<number, string>();
        for (const r of parents) versions.set(r.id, r.version);
        const capacity = new Map<string, number>();
        for (const cap of plan.payloads.capacityMappings) {
          const rows = (
            await db.query(
              'SELECT id,label_ar_m,label_ar_f,is_active,code FROM public.lookup_party_role WHERE id=$1 OR label_ar_m=$2 OR label_ar_f=$3 OR code=$4',
              [
                cap.existingRoleId,
                cap.displayM,
                cap.displayF,
                'task62_' + Buffer.from(cap.sourceSpelling).toString('hex'),
              ],
            )
          ).rows;
          if (cap.existingRoleId !== null) {
            assert.equal(rows.length, 1);
            assert.equal(rows[0].id, cap.existingRoleId);
            assert.equal(rows[0].label_ar_m, cap.displayM);
            assert.equal(rows[0].label_ar_f, cap.displayF);
            assert.equal(rows[0].is_active, true);
            capacity.set(cap.sourceSpelling, rows[0].id);
          } else assert.equal(rows.length, 0, 'Conflicting capacity identity');
        }
        for (const { sourceRow: q } of plan.payloads.partyReleases) {
          const m = parents.find((r) => r.id === q.matterId);
          assert.ok(m);
          assert.equal(m.legacy_id, q.legacyMatterId);
          assert.equal(m.version, q.currentMatterVersion);
          const rows = (
            await db.query('SELECT * FROM quarantine.matter_relationship_transform WHERE id=$1', [
              q.quarantineId,
            ])
          ).rows;
          assert.equal(rows.length, 1);
          assert.equal(rows[0].raw_value, q.retainedRaw);
          assert.equal(rows[0].resolved_at, null);
          assert.deepEqual(rows[0].reason_codes, ['unreviewed_party_role']);
          assert.equal(rows[0].src_record_key, q.sourceRecordKey);
          assert.equal(
            rows[0].extraction_sha256.toUpperCase(),
            q.sourceExtractionSha256.toUpperCase(),
          );
          assert.equal(String(rows[0].legacy_matter_id), String(q.legacyMatterId));
          assert.equal(rows[0].side, q.side);
          assert.equal(rows[0].source_payload[rows[0].source_field], q.retainedRaw);
          assert.equal(
            (
              await db.query(
                'SELECT count(*)::int n FROM public.matter_parties WHERE matter_id=$1 AND side=$2',
                [q.matterId, q.side],
              )
            ).rows[0].n,
            0,
            'Existing or retired party side conflict',
          );
        }
        const lookups = new Map<number, { court: number; action: number }>();
        for (const { sourceRow: r } of plan.payloads.hearingAdditions) {
          const m = parents.find((x) => x.id === r.currentMatterId);
          assert.ok(m);
          assert.equal(m.legacy_id, r.sourceMatterId);
          assert.equal(m.version, r.currentMatterVersion);
          assert.equal(
            (
              await db.query(
                'SELECT count(*)::int n FROM public.hearings WHERE legacy_id=$1 OR (matter_id=$2 AND hearing_date=$3::date AND decision IS NOT DISTINCT FROM $4)',
                [
                  r.sourceHearingId,
                  r.currentMatterId,
                  r.currentFields.hearing_date,
                  r.currentFields.decision,
                ],
              )
            ).rows[0].n,
            0,
            'Existing source or indistinguishable native hearing',
          );
          const court = (
            await db.query('SELECT id FROM public.lookup_court WHERE label_ar=$1 AND is_active', [
              r.lookupRaw.court_id,
            ])
          ).rows;
          const action = (
            await db.query(
              'SELECT id FROM public.lookup_hearing_action WHERE label_ar=$1 AND is_active',
              [r.lookupRaw.action_id],
            )
          ).rows;
          assert.equal(court.length, 1);
          assert.equal(action.length, 1);
          lookups.set(r.sourceHearingId, { court: court[0].id, action: action[0].id });
        }
        for (const { approvedSelection: s, sourceRow: r } of plan.payloads
          .selectionInitialization) {
          assert.equal(versions.get(s.matterId), s.baselineMatterVersion);
          assert.equal(parents.find((m) => m.id === s.matterId).legacy_id, r.sourceMatterId);
          assert.equal(
            (
              await db.query(
                'SELECT count(*)::int n FROM public.client_report_selections WHERE id=$1',
                [s.matterId],
              )
            ).rows[0].n,
            0,
            'Existing current selection conflict',
          );
          if (s.existingHearingId !== null) {
            const h = (
              await db.query(
                'SELECT matter_id,row_version::text version,is_archived FROM public.hearings WHERE id=$1',
                [s.existingHearingId],
              )
            ).rows;
            assert.equal(h.length, 1);
            assert.equal(h[0].matter_id, s.matterId);
            assert.equal(h[0].version, '1');
            assert.equal(h[0].is_archived, false);
          }
        }
        if (input.mode === 'plan') {
          await db.query('COMMIT');
          return {
            status: 'READY_EMPTY',
            operation: journal.operationId,
            counts: {
              capacities: 8,
              parties: 29,
              parents: 24,
              hearings: 2,
              sourceReceipts: 31,
              selections: 10,
              noOpExclusions: 3,
            },
            changed: false,
          };
        }
        assert.ok(authority);
        const a = authority;
        const expiry = new Date(a.absoluteExpiresAt).toISOString();
        await db.query('SELECT public.audit_set_human_context($1)', [a.userId]);
        await db.query(
          "SELECT public.audit_set_event_context($1::uuid,$1::uuid,$2::uuid,NULL,'task62-bounded-approved-operation','system')",
          [journal.operationId, a.auditSessionId],
        );
        const actor = (await db.query('SELECT public.audit_current_actor_id() id')).rows[0].id;
        const manifest: Manifest = {
          operationId: journal.operationId,
          planSha256: TASK62_PLAN_SHA,
          capacities: [],
          matters: [],
          hearings: [],
          selections: [],
        };
        const audit = async (table: string, id: number) =>
          (
            await db.query(
              "SELECT id::text,after_values FROM public.audit_events WHERE request_id=$1::uuid AND entity_schema='public' AND entity_table=$2 AND entity_key=jsonb_build_object('id',$3::int) AND action IN('record_created','relationship_added')",
              [journal.operationId, table, id],
            )
          ).rows;
        for (const cap of plan.payloads.capacityMappings.filter((r) => r.existingRoleId === null)) {
          const r = (
            await db.query(
              'INSERT INTO public.lookup_party_role(code,label_ar_m,label_ar_f,updated_at) VALUES($1,$2,$3,statement_timestamp()) RETURNING id',
              [
                'task62_' + Buffer.from(cap.sourceSpelling).toString('hex'),
                cap.displayM,
                cap.displayF,
              ],
            )
          ).rows[0];
          capacity.set(cap.sourceSpelling, r.id);
          const events = await audit('lookup_party_role', r.id);
          assert.equal(events.length, 1);
          manifest.capacities.push({
            sourceSpelling: cap.sourceSpelling,
            id: r.id,
            auditEventId: events[0].id,
            afterValues: events[0].after_values,
          });
        }
        const receipts: {
          kind: string;
          identity: string;
          matter: number;
          target: number;
          event: string;
          roleEvent: string | null;
          source: PartySource | HearingSource;
          after: Record<string, unknown>;
        }[] = [];
        for (const id of [
          ...new Set(plan.payloads.partyReleases.map((r) => r.sourceRow.matterId)),
        ].sort((a, b) => a - b)) {
          const rows = plan.payloads.partyReleases.filter((r) => r.sourceRow.matterId === id);
          const state = (
            await db.query('SELECT public.matter_edit_state($1,$2,$3,$4::timestamptz,$5) state', [
              a.userId,
              a.sessionVersion,
              a.role,
              expiry,
              id,
            ])
          ).rows[0].state;
          assert.equal(state.record.version, versions.get(id));
          const added = rows.map((r) => ({
            ...r.approvedParty,
            roles: r.approvedParty.roles.map((role) => ({
              id: null,
              role_id: capacity.get(role.proposedCapacitySpelling),
              ordinal: role.ordinal,
            })),
          }));
          const request = {
            id,
            version: versions.get(id),
            submission: step(journal.operationId, 'matter:' + id),
            values: {},
            parties: [...state.parties, ...added],
          };
          const result = (
            await db.query(
              'SELECT public.matter_edit_save($1,$2,$3,$4::timestamptz,$5::jsonb) result',
              [a.userId, a.sessionVersion, a.role, expiry, JSON.stringify(request)],
            )
          ).rows[0].result as Result;
          assert.equal(BigInt(result.version), BigInt(versions.get(id)!) + 1n);
          versions.set(id, result.version);
          manifest.matters.push({ request, result });
          for (const { sourceRow: q } of rows) {
            const p = (
              await db.query(
                'SELECT id,party_name,gender FROM public.matter_parties WHERE matter_id=$1 AND side=$2',
                [id, q.side],
              )
            ).rows;
            assert.equal(p.length, 1);
            assert.equal(p[0].party_name, q.proposedParty.party_name);
            assert.equal(p[0].gender, null);
            const roles = (
              await db.query('SELECT id FROM public.matter_party_roles WHERE party_id=$1', [
                p[0].id,
              ])
            ).rows;
            assert.equal(roles.length, 1);
            const e = await audit('matter_parties', p[0].id),
              re = await audit('matter_party_roles', roles[0].id);
            assert.equal(e.length, 1);
            assert.equal(re.length, 1);
            receipts.push({
              kind: 'party_release',
              identity: 'quarantine:' + q.quarantineId,
              matter: id,
              target: p[0].id,
              event: e[0].id,
              roleEvent: re[0].id,
              source: q,
              after: e[0].after_values,
            });
          }
        }
        for (const { sourceRow: r } of plan.payloads.hearingAdditions) {
          assert.equal(
            (
              await db.query('SELECT row_version::text version FROM public.matters WHERE id=$1', [
                r.currentMatterId,
              ])
            ).rows[0].version,
            versions.get(r.currentMatterId),
          );
          const lookup = lookups.get(r.sourceHearingId)!;
          const request = {
            id: null,
            version: null,
            submission: step(journal.operationId, 'hearing:' + r.sourceHearingId),
            values: { ...r.currentFields, court_id: lookup.court, action_id: lookup.action },
            attendees: [],
          };
          const result = (
            await db.query(
              'SELECT public.hearing_edit_save($1,$2,$3,$4::timestamptz,$5::jsonb) result',
              [a.userId, a.sessionVersion, a.role, expiry, JSON.stringify(request)],
            )
          ).rows[0].result as Result;
          manifest.hearings.push({
            sourceHearingId: r.sourceHearingId,
            courtId: lookup.court,
            actionId: lookup.action,
            request,
            result,
          });
          const e = await audit('hearings', result.id);
          assert.equal(e.length, 1);
          receipts.push({
            kind: 'hearing_source',
            identity: 'hearing:' + r.sourceHearingId,
            matter: r.currentMatterId,
            target: result.id,
            event: e[0].id,
            roleEvent: null,
            source: r,
            after: e[0].after_values,
          });
        }
        for (const { approvedSelection: s } of plan.payloads.selectionInitialization) {
          const hearingId =
            s.existingHearingId ??
            manifest.hearings.find((h) => h.sourceHearingId === s.newHearingSourceId)?.result.id ??
            null;
          const h =
            hearingId === null
              ? null
              : (
                  await db.query(
                    'SELECT matter_id,row_version::text version,is_archived FROM public.hearings WHERE id=$1',
                    [hearingId],
                  )
                ).rows[0];
          if (h) {
            assert.equal(h.matter_id, s.matterId);
            assert.equal(h.version, '1');
            assert.equal(h.is_archived, false);
          }
          const m = (
            await db.query('SELECT row_version::text version FROM public.matters WHERE id=$1', [
              s.matterId,
            ])
          ).rows[0];
          assert.equal(m.version, versions.get(s.matterId));
          const request = {
            client: 245,
            id: s.matterId,
            version: '0',
            matterVersion: m.version,
            hearingId,
            hearingVersion: h?.version ?? null,
            selected: s.selected,
            submission: step(journal.operationId, 'selection:' + s.matterId),
          };
          const result = (
            await db.query(
              'SELECT public.client_report_selection_save($1,$2,$3,$4,$5::timestamptz,$6::jsonb) result',
              [a.userId, a.personId, a.sessionVersion, a.role, expiry, JSON.stringify(request)],
            )
          ).rows[0].result as Result;
          assert.equal(result.changed, s.selected);
          manifest.selections.push({ request, result });
        }
        for (const r of receipts)
          await db.query(
            "INSERT INTO _migration.task62_source_receipt(kind,source_identity,source_lineage,source_sha256,approved_plan_text,operation_id,actor_id,audit_session_id,matter_id,target_id,audit_event_id,role_audit_event_id,source_values,before_values,after_values,operation_manifest) VALUES($1,$2,'litigation-department-access',$3,$4,$5::uuid,$6,$7::uuid,$8,$9,$10,$11,$12::jsonb,'{}'::jsonb,$13::jsonb,$14::jsonb)",
            [
              r.kind,
              r.identity,
              plan.source.sha256,
              text,
              journal.operationId,
              actor,
              a.auditSessionId,
              r.matter,
              r.target,
              r.event,
              r.roleEvent,
              JSON.stringify(r.source),
              JSON.stringify(r.after),
              JSON.stringify(manifest),
            ],
          );
        await db.query('SET CONSTRAINTS ALL IMMEDIATE');
        assert.equal(
          (
            await db.query('SELECT _migration.task62_source_operation_valid($1::uuid) valid', [
              journal.operationId,
            ])
          ).rows[0].valid,
          true,
        );
        await db.query('COMMIT');
        return { status: 'APPLIED', operation: journal.operationId, manifest, changed: true };
      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }
    },
    {
      databaseUrl: input.databaseUrl,
      clientConfig: {
        application_name: 'task62-bounded-reviewed-runner',
        ...(input.mode === 'plan' ? { options: '-c default_transaction_read_only=on' } : {}),
      },
    },
  );
}

async function genuineSession(path: string | undefined) {
  assert.ok(path, 'Protected genuine session token file required');
  const value = load(path);
  assert.ok(['authjs.session-token', '__Secure-authjs.session-token'].includes(value.cookieName));
  assert.equal(typeof value.token, 'string');
  assert.ok(process.env.AUTH_SECRET);
  const decoded = await decode({
    token: value.token,
    secret: process.env.AUTH_SECRET!,
    salt: value.cookieName,
  });
  assert.ok(decoded, 'Signed encrypted session required');
  const claims = readSessionClaims(decoded);
  assert.ok(claims);
  assert.ok(claims.authenticatedAt <= Date.now() + 60000 && claims.absoluteExpiresAt > Date.now());
  assert.equal(claims.mustChangePassword, false);
  assert.ok(['Administrator', 'Litigation Assistant'].includes(claims.role));
  return claims;
}
