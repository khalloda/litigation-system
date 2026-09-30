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

export type ClosedSelectionInput = {
  scope: 'closed';
  client: number;
  id: number;
  version: string;
  matterVersion: string;
  hearingId: number | null;
  hearingVersion: string | null;
  selected: boolean;
  submission: string;
};
import { ReportSelectionError } from './selection';
const permissions = [
  { area: 'matters', action: 'view' },
  { area: 'hearings', action: 'view' },
  { area: 'clients', action: 'view' },
] as const;
function positive(v: unknown): v is number {
  return Number.isInteger(v) && Number(v) > 0 && Number(v) <= 2147483647;
}
export function parseClosedSelectionInput(value: unknown): ClosedSelectionInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ReportSelectionError('invalid');
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).sort().join(',') !==
      'client,hearingId,hearingVersion,id,matterVersion,scope,selected,submission,version' ||
    v.scope !== 'closed' ||
    !positive(v.client) ||
    !positive(v.id) ||
    (v.hearingId !== null && !positive(v.hearingId)) ||
    typeof v.selected !== 'boolean' ||
    typeof v.version !== 'string' ||
    !/^(0|[1-9]\d{0,17})$/u.test(v.version) ||
    typeof v.matterVersion !== 'string' ||
    !/^[1-9]\d{0,17}$/u.test(v.matterVersion) ||
    (v.hearingId === null
      ? v.hearingVersion !== null
      : typeof v.hearingVersion !== 'string' || !/^[1-9]\d{0,17}$/u.test(v.hearingVersion)) ||
    typeof v.submission !== 'string' ||
    !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/u.test(v.submission)
  )
    throw new ReportSelectionError('invalid');
  return v as ClosedSelectionInput;
}
export async function saveClosedReportSelection(
  session: Session | null,
  value: unknown,
  dependencies: { auditMetadata: AuditRequestMetadata; database?: PrismaClient },
) {
  const actor = reportSession(session, 'run', permissions);
  requireAuthorizedDecision(decideAuthorization(actor, 'matters', 'update'));
  requireAuthorizedDecision(decideAuthorization(actor, 'hearings', 'update'));
  const input = parseClosedSelectionInput(value),
    database = dependencies.database ?? db;
  try {
    return await withSerializableRetry(() =>
      database.$transaction(
        async (tx) => {
          await setHumanAuditContext(tx, Number(actor.user.id), dependencies.auditMetadata);
          const rows = await tx.$queryRaw<
            { result: { id: number; version: string; changed: boolean } }[]
          >(Prisma.sql`
        SELECT public.closed_report_selection_save(${Number(actor.user.id)}::integer,${actor.user.personId}::integer,
        ${actor.user.sessionVersion}::integer,${actor.user.role}::text,${actor.expires}::timestamptz,${JSON.stringify(input)}::jsonb) AS result`);
          if (rows.length !== 1) throw new Error('Selection gateway cardinality differs');
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
export type SelectionMatter = {
  id: number;
  caseNumber: string | null;
  subject: string | null;
  archived: boolean;
  eligible: boolean;
  matterVersion: string;
  selected: boolean;
  version: string;
  hearingId: number | null;
  hearingVersion: string | null;
  date: string | null;
  decision: string | null;
  hearingArchived: boolean | null;
};
export type SelectionHearing = {
  id: number;
  version: string;
  date: string | null;
  decision: string | null;
  court: string | null;
  circuit: string | null;
  action: string | null;
  archived: boolean;
};
export async function readClosedReportSelection(
  session: Session | null,
  client: number,
  id: number | null,
  page: number,
  database: PrismaClient = db,
) {
  reportSession(session, 'run', permissions);
  if (!positive(client) || (id !== null && !positive(id)) || !positive(page) || page > 100000)
    throw new ReportSelectionError('invalid');
  return reportSnapshot(session, database, 'run', permissions, async (tx) => {
    const clients = await tx.$queryRaw<{ name: string }[]>(
      Prisma.sql`SELECT name_ar AS name FROM public.clients WHERE id=${client}`,
    );
    if (clients.length !== 1) throw new ReportSelectionError('missing');
    const counts = await tx.$queryRaw<
      { total: number; selected: number; incomplete: number }[]
    >(Prisma.sql`SELECT count(*)::int total,
      count(*) FILTER(WHERE s.is_selected)::int selected,count(*) FILTER(WHERE s.is_selected AND (h.id IS NULL OR h.matter_id<>m.id OR h.hearing_date IS NULL OR m.status IS DISTINCT FROM 'منتهية'))::int incomplete
      FROM public.matters m LEFT JOIN public.closed_report_selections s ON s.id=m.id LEFT JOIN public.hearings h ON h.id=s.hearing_id WHERE m.client_id=${client}`);
    const matters = await tx.$queryRaw<
      SelectionMatter[]
    >(Prisma.sql`SELECT m.id,m.case_number_ar AS "caseNumber",m.subject,(m.status='منتهية') IS TRUE AS eligible,m.is_archived AS archived,m.row_version::text AS "matterVersion",
      coalesce(s.is_selected,false) selected,coalesce(s.row_version,0)::text AS version,s.hearing_id AS "hearingId",h.row_version::text AS "hearingVersion",h.hearing_date::text date,h.decision,h.is_archived AS "hearingArchived"
      FROM public.matters m LEFT JOIN public.closed_report_selections s ON s.id=m.id LEFT JOIN public.hearings h ON h.id=s.hearing_id
      WHERE m.client_id=${client} AND (${id}::int IS NULL OR m.id=${id}) ORDER BY m.id LIMIT ${id === null ? 25 : 1} OFFSET ${id === null ? (page - 1) * 25 : 0}`);
    if (id !== null && matters.length !== 1) throw new ReportSelectionError('missing');
    const hearings =
      id === null
        ? []
        : await tx.$queryRaw<
            SelectionHearing[]
          >(Prisma.sql`SELECT h.id,h.row_version::text version,h.hearing_date::text date,h.decision,c.label_ar court,h.circuit,a.label_ar action,h.is_archived archived
      FROM public.hearings h LEFT JOIN public.lookup_court c ON c.id=h.court_id LEFT JOIN public.lookup_hearing_action a ON a.id=h.action_id
      WHERE h.matter_id=${id} ORDER BY h.hearing_date DESC NULLS LAST,h.id DESC LIMIT 26 OFFSET ${(page - 1) * 25}`);
    return {
      client,
      name: clients[0]!.name,
      counts: counts[0]!,
      matters,
      hearings: hearings.slice(0, 25),
      moreHearings: hearings.length > 25,
      page,
    };
  });
}
