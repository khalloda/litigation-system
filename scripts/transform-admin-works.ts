import 'dotenv/config';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { Client, type ClientBase } from 'pg';
import {
  buildAdminTransformPlan,
  type AdminQuarantinePlan,
  type AdminTaskTargetPlan,
  type TaskActionTargetPlan,
} from './lib/admin-transform-plan';
import { reconcileAdminWorks } from './lib/admin-reconciliation';
import { task29ProtectedState } from './lib/task29-protected-state';

type RunOptions = { databaseUrl?: string; apply?: boolean; forceFailure?: boolean };

async function insertTasks(db: ClientBase, rows: readonly AdminTaskTargetPlan[]): Promise<void> {
  await db.query(
    `INSERT INTO admin_tasks (
       legacy_id,matter_id,required_work,assigned_to_person_id,legacy_assignee_raw,
       execution_date,result,previous_decision,last_followup,deadline,court_id,
       legacy_court_raw,circuit,legacy_circuit_raw,destination_id,
       legacy_destination_raw,status,alert,legacy_source_record_key,
       legacy_source_extraction_sha256,legacy_source_payload,updated_at
     )
     SELECT x."legacyId",x."matterId",x."requiredWork",x."assignedToPersonId",
            x."legacyAssigneeRaw",x."executionDate"::date,x.result,x."previousDecision",
            x."lastFollowup",x.deadline::date,x."courtId",x."legacyCourtRaw",
            x.circuit,x."legacyCircuitRaw",x."destinationId",x."legacyDestinationRaw",
            x.status,x.alert,x."srcRecordKey",x."extractionSha256",x."sourcePayload",
            CURRENT_TIMESTAMP
       FROM jsonb_to_recordset($1::jsonb) AS x(
         "srcRecordKey" text,"extractionSha256" text,"legacyId" integer,
         "matterId" integer,"requiredWork" text,"assignedToPersonId" integer,
         "legacyAssigneeRaw" text,"executionDate" text,result text,
         "previousDecision" text,"lastFollowup" text,deadline text,"courtId" integer,
         "legacyCourtRaw" text,circuit text,"legacyCircuitRaw" text,
         "destinationId" integer,"legacyDestinationRaw" text,status text,alert text,
         "sourcePayload" jsonb
       )
     ON CONFLICT (legacy_source_record_key) DO NOTHING`,
    [JSON.stringify(rows)],
  );
}

async function insertActions(db: ClientBase, rows: readonly TaskActionTargetPlan[]): Promise<void> {
  await db.query(
    `INSERT INTO task_actions (
       legacy_id,task_id,legacy_task_id_raw,action_date,performed_by_person_id,
       legacy_performed_by_raw,result,report,next_appointment,source_ordinal,
       legacy_source_record_key,legacy_source_extraction_sha256,
       legacy_source_payload,updated_at
     )
     SELECT x."legacyId",t.id,x."legacyTaskIdRaw",x."actionDate"::date,
            x."performedByPersonId",x."legacyPerformedByRaw",x.result,x.report,
            x."nextAppointment"::date,x."sourceOrdinal",x."srcRecordKey",
            x."extractionSha256",x."sourcePayload",CURRENT_TIMESTAMP
       FROM jsonb_to_recordset($1::jsonb) AS x(
         "srcRecordKey" text,"extractionSha256" text,"legacyId" integer,
         "parentTaskSourceKey" text,"legacyTaskIdRaw" text,"actionDate" text,
         "performedByPersonId" integer,"legacyPerformedByRaw" text,result text,
         report text,"nextAppointment" text,"sourceOrdinal" integer,
         "sourcePayload" jsonb
       )
       JOIN admin_tasks t ON t.legacy_source_record_key=x."parentTaskSourceKey"
     ON CONFLICT (legacy_source_record_key) DO NOTHING`,
    [JSON.stringify(rows)],
  );
}

async function insertTaskQuarantine(
  db: ClientBase,
  table: 'admin_task_transform' | 'task_action_transform',
  rows: readonly AdminQuarantinePlan[],
): Promise<void> {
  if (table === 'admin_task_transform') {
    await db.query(
      `INSERT INTO quarantine.admin_task_transform (
         src_record_key,extraction_sha256,src_file,src_row_num,legacy_task_id,
         reason_codes,reason_details,source_payload
       ) SELECT x."srcRecordKey",x."extractionSha256",x."srcFile",x."srcRowNum",
                x."legacyId",x."reasonCodes",x."reasonDetails",x."sourcePayload"
           FROM jsonb_to_recordset($1::jsonb) AS x(
             "srcRecordKey" text,"extractionSha256" text,"srcFile" text,
             "srcRowNum" integer,"legacyId" text,"reasonCodes" text[],
             "reasonDetails" jsonb,"sourcePayload" jsonb
           ) ON CONFLICT (src_record_key) DO NOTHING`,
      [JSON.stringify(rows)],
    );
    return;
  }
  await db.query(
    `INSERT INTO quarantine.task_action_transform (
       src_record_key,extraction_sha256,src_file,src_row_num,legacy_action_id,
       legacy_task_id_raw,reason_codes,reason_details,source_payload
     ) SELECT x."srcRecordKey",x."extractionSha256",x."srcFile",x."srcRowNum",
              x."legacyId",x."legacyTaskIdRaw",x."reasonCodes",x."reasonDetails",
              x."sourcePayload"
         FROM jsonb_to_recordset($1::jsonb) AS x(
           "srcRecordKey" text,"extractionSha256" text,"srcFile" text,
           "srcRowNum" integer,"legacyId" text,"legacyTaskIdRaw" text,
           "reasonCodes" text[],"reasonDetails" jsonb,"sourcePayload" jsonb
         ) ON CONFLICT (src_record_key) DO NOTHING`,
    [JSON.stringify(rows)],
  );
}

export async function adminWorkResultDigest(db: ClientBase): Promise<string> {
  const result = await db.query<{ digest: string }>(`
    SELECT encode(sha256(convert_to(coalesce(string_agg(payload,E'\\n' ORDER BY kind,identity),''),'UTF8')),'hex') digest
      FROM (
        SELECT 'T' kind,legacy_source_record_key identity,to_jsonb(t)::text payload
          FROM admin_tasks t WHERE legacy_source_record_key IS NOT NULL
        UNION ALL SELECT 'A',legacy_source_record_key,to_jsonb(a)::text
          FROM task_actions a WHERE legacy_source_record_key IS NOT NULL
        UNION ALL SELECT 'QT',src_record_key,to_jsonb(q)::text FROM quarantine.admin_task_transform q
        UNION ALL SELECT 'QA',src_record_key,to_jsonb(q)::text FROM quarantine.task_action_transform q
      ) result`);
  return result.rows[0]?.digest ?? '';
}

export async function runAdminWorkTransform(options: RunOptions = {}) {
  const connectionString = options.databaseUrl ?? process.env['DATABASE_URL'];
  assert.ok(connectionString, 'DATABASE_URL is required');
  const db = new Client({ connectionString });
  await db.connect();
  try {
    const preview = await buildAdminTransformPlan(db);
    if (options.apply !== true) return { plan: preview, digest: null };

    const protectedBefore = await task29ProtectedState(db);
    await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    try {
      const plan = await buildAdminTransformPlan(db);
      assert.equal(plan.taskSourceCount, preview.taskSourceCount);
      assert.equal(plan.actionSourceCount, preview.actionSourceCount);
      await insertTasks(db, plan.tasks);
      await insertTaskQuarantine(db, 'admin_task_transform', plan.taskQuarantine);
      await insertActions(db, plan.actions);
      await insertTaskQuarantine(db, 'task_action_transform', plan.actionQuarantine);
      if (options.forceFailure === true) throw new Error('forced late Task 2.9A failure');
      const reconciliation = await reconcileAdminWorks(db);
      assert.deepEqual(
        reconciliation.defects,
        [],
        `Task 2.9A reconciliation failed:\n${reconciliation.defects.join('\n')}`,
      );
      assert.equal(
        await task29ProtectedState(db),
        protectedBefore,
        'prior protected state changed',
      );
      await db.query('COMMIT');
      return { plan, digest: await adminWorkResultDigest(db) };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  } finally {
    await db.end();
  }
}

function breakdown(rows: readonly AdminQuarantinePlan[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const row of rows)
    for (const code of row.reasonCodes) result[code] = (result[code] ?? 0) + 1;
  return result;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const result = await runAdminWorkTransform({ apply });
  console.log(apply ? 'TASK 2.9A APPLIED' : 'TASK 2.9A DRY RUN — no database writes');
  console.log(
    `Tasks: ${result.plan.taskSourceCount} = ${result.plan.tasks.length} transformed + ${result.plan.taskQuarantine.length} quarantined`,
  );
  console.log(
    `Actions: ${result.plan.actionSourceCount} = ${result.plan.actions.length} transformed + ${result.plan.actionQuarantine.length} quarantined`,
  );
  console.log(`Task reasons: ${JSON.stringify(breakdown(result.plan.taskQuarantine))}`);
  console.log(`Action reasons: ${JSON.stringify(breakdown(result.plan.actionQuarantine))}`);
  if (result.digest !== null) console.log(`Result digest: ${result.digest}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
