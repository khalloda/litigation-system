import type { Session } from 'next-auth';
import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { setHumanAuditContext } from '@/lib/audit';
import type { AuditRequestMetadata } from '@/lib/audit-metadata';
import {
  decideAuthorization,
  requireAuthorizedDecision,
  AuthorizationError,
} from '@/lib/auth/authorization-core';
import { withSerializableRetry } from '@/lib/auth/service';
import { reportSession, reportSnapshot } from './authority';
import { ReportSelectionError } from './selection';

export type AdministrativeSelectionKind = 'hearing' | 'step';
export type AdministrativeSelectionInput = {
  scope: 'administrative-hearing' | 'administrative-step';
  id: number;
  parent: number;
  client: number;
  version: string;
  parentVersion: string;
  recordVersion: string | null;
  selected: boolean;
  submission: string;
};
const permissions = [
  { area: 'matters', action: 'view' },
  { area: 'hearings', action: 'view' },
  { area: 'administrativeWorks', action: 'view' },
  { area: 'clients', action: 'view' },
] as const;
function positive(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0 && Number(value) <= 2147483647;
}
export function parseAdministrativeSelectionInput(value: unknown): AdministrativeSelectionInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ReportSelectionError('invalid');
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).sort().join(',') !==
      'client,id,parent,parentVersion,recordVersion,scope,selected,submission,version' ||
    !['administrative-hearing', 'administrative-step'].includes(String(v.scope)) ||
    !positive(v.id) ||
    !positive(v.parent) ||
    !positive(v.client) ||
    typeof v.selected !== 'boolean' ||
    typeof v.version !== 'string' ||
    !/^(0|[1-9]\d{0,17})$/u.test(v.version) ||
    typeof v.parentVersion !== 'string' ||
    !/^[1-9]\d{0,17}$/u.test(v.parentVersion) ||
    (v.scope === 'administrative-hearing'
      ? typeof v.recordVersion !== 'string' || !/^[1-9]\d{0,17}$/u.test(v.recordVersion)
      : v.recordVersion !== null) ||
    typeof v.submission !== 'string' ||
    !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/u.test(v.submission)
  )
    throw new ReportSelectionError('invalid');
  return v as AdministrativeSelectionInput;
}
export async function saveAdministrativeReportSelection(
  session: Session | null,
  value: unknown,
  dependencies: { auditMetadata: AuditRequestMetadata; database?: PrismaClient },
) {
  const actor = reportSession(session, 'run', permissions);
  const input = parseAdministrativeSelectionInput(value);
  requireAuthorizedDecision(
    decideAuthorization(
      actor,
      input.scope === 'administrative-hearing' ? 'hearings' : 'administrativeWorks',
      'update',
    ),
  );
  const database = dependencies.database ?? db;
  const gateway =
    input.scope === 'administrative-hearing'
      ? Prisma.sql`public.administrative_hearing_report_selection_save`
      : Prisma.sql`public.administrative_step_report_selection_save`;
  try {
    return await withSerializableRetry(() =>
      database.$transaction(
        async (tx) => {
          await setHumanAuditContext(tx, Number(actor.user.id), dependencies.auditMetadata);
          const rows = await tx.$queryRaw<
            { result: { id: number; version: string; changed: boolean } }[]
          >(Prisma.sql`
        SELECT ${gateway}(${Number(actor.user.id)}::integer,${actor.user.personId}::integer,
        ${actor.user.sessionVersion}::integer,${actor.user.role}::text,${actor.expires}::timestamptz,${JSON.stringify(input)}::jsonb) AS result`);
          if (rows.length !== 1)
            throw new Error('Administrative selection gateway cardinality differs');
          return rows[0]!.result;
        },
        { isolationLevel: 'Serializable', timeout: 30000, maxWait: 5000 },
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('42501')) throw new AuthorizationError('unauthenticated');
    if (message.includes('stale')) throw new ReportSelectionError('stale');
    if (message.includes('archived')) throw new ReportSelectionError('archived');
    if (message.includes('submission differs')) throw new ReportSelectionError('submission');
    if (message.includes('P0002')) throw new ReportSelectionError('missing');
    if (/22023|23503|23514|22P02/u.test(message)) throw new ReportSelectionError('invalid');
    throw error;
  }
}
export type AdministrativeSelectionParent = {
  id: number;
  matterId: number;
  caseNumber: string | null;
  subject: string | null;
  work: string | null;
  version: string;
  archived: boolean;
};
export type AdministrativeSelectionRecord = {
  id: number;
  recordVersion: string | null;
  version: string;
  selected: boolean;
  archived: boolean;
  date: string | null;
  text: string | null;
  court: string | null;
  circuit: string | null;
  action: string | null;
  person: string | null;
  ordinal: number | null;
};
export async function readAdministrativeReportSelection(
  session: Session | null,
  kind: AdministrativeSelectionKind,
  client: number,
  parent: number | null,
  page: number,
  database: PrismaClient = db,
) {
  reportSession(session, 'run', permissions);
  if (
    !['hearing', 'step'].includes(kind) ||
    !positive(client) ||
    (parent !== null && !positive(parent)) ||
    !positive(page) ||
    page > 100000
  )
    throw new ReportSelectionError('invalid');
  return reportSnapshot(session, database, 'run', permissions, async (tx) => {
    const clients = await tx.$queryRaw<{ name: string }[]>(
      Prisma.sql`SELECT name_ar name FROM public.clients WHERE id=${client}`,
    );
    if (clients.length !== 1) throw new ReportSelectionError('missing');
    const source =
      kind === 'hearing'
        ? Prisma.sql`
      SELECT m.id,m.id AS "matterId",m.case_number_ar AS "caseNumber",m.subject,NULL::text work,m.row_version::text version,m.is_archived archived FROM public.matters m WHERE m.client_id=${client}`
        : Prisma.sql`
      SELECT w.id,m.id AS "matterId",m.case_number_ar AS "caseNumber",m.subject,w.required_work work,w.row_version::text version,(w.is_archived OR m.is_archived) archived
      FROM public.admin_tasks w JOIN public.matters m ON m.id=w.matter_id WHERE m.client_id=${client}`;
    const parents = await tx.$queryRaw<AdministrativeSelectionParent[]>(
      Prisma.sql`SELECT * FROM (${source}) x WHERE (${parent}::int IS NULL OR id=${parent}) ORDER BY id LIMIT ${parent === null ? 25 : 1} OFFSET ${parent === null ? (page - 1) * 25 : 0}`,
    );
    if (parent !== null && parents.length !== 1) throw new ReportSelectionError('missing');
    const parentCount = (
      await tx.$queryRaw<{ total: number }[]>(
        Prisma.sql`SELECT count(*)::int total FROM (${source}) x`,
      )
    )[0]!.total;
    const recordsSource =
      kind === 'hearing'
        ? Prisma.sql`
      SELECT h.id,h.row_version::text AS "recordVersion",coalesce(s.row_version,0)::text version,coalesce(s.is_selected,false) selected,h.is_archived archived,
        h.hearing_date::text date,h.decision text,c.label_ar court,h.circuit,a.label_ar action,NULL::text person,NULL::int ordinal
      FROM public.hearings h LEFT JOIN public.administrative_hearing_report_selections s ON s.id=h.id
      LEFT JOIN public.lookup_court c ON c.id=h.court_id LEFT JOIN public.lookup_hearing_action a ON a.id=h.action_id
      WHERE h.matter_id=${parent}`
        : Prisma.sql`
      SELECT a.id,NULL::text AS "recordVersion",coalesce(s.row_version,0)::text version,coalesce(s.is_selected,false) selected,a.is_archived archived,
        a.action_date::text date,a.result text,NULL::text court,NULL::text circuit,NULL::text action,p.name_ar person,coalesce(a.current_order,a.source_ordinal) ordinal
      FROM public.task_actions a LEFT JOIN public.administrative_step_report_selections s ON s.id=a.id LEFT JOIN public.people p ON p.id=a.performed_by_person_id WHERE a.task_id=${parent}`;
    const records =
      parent === null
        ? []
        : await tx.$queryRaw<AdministrativeSelectionRecord[]>(
            Prisma.sql`SELECT * FROM (${recordsSource}) x ORDER BY ${kind === 'hearing' ? Prisma.sql`date DESC NULLS LAST,id DESC` : Prisma.sql`ordinal NULLS LAST,id`} LIMIT 25 OFFSET ${(page - 1) * 25}`,
          );
    const counts =
      parent === null
        ? { total: 0, selected: 0 }
        : (
            await tx.$queryRaw<{ total: number; selected: number }[]>(
              Prisma.sql`SELECT count(*)::int total,count(*) FILTER(WHERE selected)::int selected FROM (${recordsSource}) x`,
            )
          )[0]!;
    return {
      kind,
      client,
      name: clients[0]!.name,
      parent,
      page,
      parents,
      parentCount,
      records,
      counts,
    };
  });
}
