import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { ClientBase } from 'pg';
import type { Prisma } from '../../src/generated/prisma/client';
import type { SessionClaims } from '../../src/lib/auth/session';
import { administrativeReports } from '../../src/lib/reports/administrative-reports';
import { parseReportInput } from '../../src/lib/reports/input';
import { reportColumns, validateReportData } from '../../src/lib/reports/result';
import { t } from '../../src/strings';
/** Uses production query builders and guarded native actions, all inside a caller
 * savepoint. The actual restored NULL status remains untouched after rollback. */
export async function probeTask69AdminReport(db: ClientBase, actor: SessionClaims, taskId: number) {
  await db.query('SAVEPOINT administrative_report_probe');
  try {
    const args = [
      actor.userId,
      actor.sessionVersion,
      actor.role,
      new Date(actor.absoluteExpiresAt).toISOString(),
    ];
    const task = (
      await db.query('SELECT to_jsonb(a) value FROM public.admin_tasks a WHERE id=$1', [taskId])
    ).rows[0].value;
    assert.equal(task.status, null);
    const descriptor = administrativeReports.find(
      (d) => d.descriptor.id === 'administrative-by-destination',
    )!;
    const parameters = parseReportInput(
      descriptor.descriptor,
      new URLSearchParams({ format: 'preview', destination: String(task.destination_id) }),
    ).parameters;
    const tx = {
      $queryRaw: async (sql: Prisma.Sql) => {
        await db.query('SET LOCAL ROLE litigation_runtime');
        const result = (await db.query(sql.text, [...sql.values])).rows;
        await db.query('RESET ROLE');
        return result;
      },
    } as unknown as Prisma.TransactionClient;
    const run = async () => {
      const data = await descriptor.query(tx, parameters);
      validateReportData(descriptor.descriptor, data);
      return data;
    };
    const empty = await run();
    assert.equal(
      empty.sections[0]!.groups.flatMap((g) => g.rows).length,
      0,
      'Empty saved selection remains empty',
    );
    const source = (
      await db.query(
        'SELECT h.id,h.row_version::text "recordVersion",m.id parent,m.client_id client,m.row_version::text "parentVersion",coalesce(s.row_version,0)::text version FROM public.hearings h JOIN public.matters m ON m.id=h.matter_id LEFT JOIN public.administrative_hearing_report_selections s ON s.id=h.id WHERE m.id=$1 AND NOT h.is_archived AND NOT m.is_archived ORDER BY h.id LIMIT 1',
        [task.matter_id],
      )
    ).rows;
    assert.equal(source.length, 1);
    const context = async () => {
      await db.query('SELECT public.audit_set_human_context($1)', [actor.userId]);
      await db.query("SELECT public.audit_set_event_context($1,$2,$3,NULL,NULL,'system')", [
        randomUUID(),
        randomUUID(),
        actor.auditSessionId,
      ]);
    };
    await context();
    await db.query('SET LOCAL ROLE litigation_runtime');
    const selected = (
      await db.query(
        'SELECT public.administrative_hearing_report_selection_save($1,$2,$3,$4,$5,$6::jsonb) value',
        [
          actor.userId,
          actor.personId,
          actor.sessionVersion,
          actor.role,
          new Date(actor.absoluteExpiresAt).toISOString(),
          JSON.stringify({
            scope: 'administrative-hearing',
            ...source[0],
            selected: true,
            submission: randomUUID(),
          }),
        ],
      )
    ).rows[0].value;
    await db.query('RESET ROLE');
    assert.equal(selected.changed, true);
    assert.equal(
      (await run()).sections[0]!.groups.flatMap((g) => g.rows).filter(
        (r) => r.id === `work:${taskId}`,
      ).length,
      0,
      'Legacy NULL-status exclusion is preserved',
    );
    const status = (await db.query('SELECT status FROM public.admin_tasks WHERE legacy_id=11184'))
      .rows[0].status;
    assert.equal(typeof status, 'string');
    await context();
    await db.query('SET LOCAL ROLE litigation_runtime');
    await db.query('SELECT public.admin_edit_save($1,$2,$3,$4,$5::jsonb)', [
      ...args,
      JSON.stringify({
        operation: 'task-update',
        task_id: taskId,
        step_id: null,
        version: String(task.row_version),
        submission: randomUUID(),
        values: { status },
      }),
    ]);
    await db.query('RESET ROLE');
    const data = await run(),
      rows = data.sections[0]!.groups.flatMap((g) => g.rows),
      matches = rows.filter((r) => r.id === `work:${taskId}`);
    assert.equal(matches.length, 1);
    assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
    const members = (
      await db.query(
        'SELECT p.name_ar,p.is_active FROM public.admin_task_assignees a JOIN public.people p ON p.id=a.person_id WHERE a.task_id=$1 AND NOT a.is_retired ORDER BY a.position',
        [taskId],
      )
    ).rows;
    assert.equal(members.length, 2);
    const index = reportColumns(descriptor.descriptor, 'works').findIndex(
      (c) => c.key === 'assignees',
    );
    assert(index >= 0);
    assert.deepEqual(matches[0]!.cells[index], {
      type: 'text',
      value: members.map((p) => p.name_ar + (p.is_active ? '' : ' — ' + t.staff.former)).join('\n'),
    });
    assert.deepEqual(data.totals[0]!.value, { type: 'integer', value: String(rows.length) });
    await db.query('SET CONSTRAINTS ALL IMMEDIATE');
    await db.query('ROLLBACK TO SAVEPOINT administrative_report_probe');
    assert.deepEqual(
      (await db.query('SELECT to_jsonb(a) value FROM public.admin_tasks a WHERE id=$1', [taskId]))
        .rows[0].value,
      task,
    );
    return {
      emptySelection: empty,
      selectedData: data,
      taskId,
      assigneeColumn: index,
      rolledBack: true,
    };
  } catch (e) {
    await db.query('ROLLBACK TO SAVEPOINT administrative_report_probe');
    throw e;
  }
}
