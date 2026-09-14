import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import type { Session } from 'next-auth';
import {
  decideAuthorization,
  requireAuthorizedDecision,
  AuthorizationError,
} from './auth/authorization-core';
import { clientId, type ClientSearchParams } from './client-query';
import { matterReturnHref } from './matter-query';

export const ADMIN_PAGE_SIZE = 25;
export const ADMIN_SEARCH_LIMIT = 160;
export const ADMIN_FILTER_KEYS = ['matter', 'client', 'person', 'status'] as const;
export type AdminFilterKey = (typeof ADMIN_FILTER_KEYS)[number];
export type AdminFilters = Record<AdminFilterKey, string> & {
  q: string;
  page: number;
  fromMatter: string;
};
export class AdminFilterError extends Error {}

export function parseAdminFilters(params: ClientSearchParams): AdminFilters {
  const allowed = [...ADMIN_FILTER_KEYS, 'q', 'page', 'fromMatter'];
  for (const key of Object.keys(params))
    if (!allowed.includes(key)) throw new AdminFilterError('unknown filter');
  const one = (key: string, fallback: string) => {
    const value = new Map(Object.entries(params)).get(key);
    if (Array.isArray(value)) throw new AdminFilterError('repeated filter');
    return value ?? fallback;
  };
  const q = one('q', '').trim(),
    page = clientId(one('page', '1'));
  if (page === null || q.length > ADMIN_SEARCH_LIMIT || /[\u0000-\u001f\u007f]/u.test(q))
    throw new AdminFilterError('invalid search');
  const values = ADMIN_FILTER_KEYS.map((key) => {
    const value = one(key, 'all');
    if (key === 'status') {
      // Prefix distinguishes exact stored values from the all/missing sentinels.
      if (
        !['all', 'missing'].includes(value) &&
        (!value.startsWith('value:') || value.length > 166 || /[\u0000-\u001f\u007f]/u.test(value))
      )
        throw new AdminFilterError('invalid status');
    } else if (!['all', 'missing'].includes(value) && clientId(value) === null)
      throw new AdminFilterError('invalid identity');
    return [key, value];
  });
  let fromMatter;
  try {
    fromMatter = matterReturnHref(params.fromMatter);
  } catch {
    throw new AdminFilterError('invalid return');
  }
  return { ...Object.fromEntries(values), q, page, fromMatter } as AdminFilters;
}
export function adminListHref(f: AdminFilters, page = f.page) {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(f))
    if ((ADMIN_FILTER_KEYS as readonly string[]).includes(key) && value !== 'all')
      p.set(key, String(value));
  if (f.q) p.set('q', f.q);
  if (f.fromMatter) p.set('fromMatter', f.fromMatter);
  if (page !== 1) p.set('page', String(page));
  return '/admin-works' + (p.size ? '?' + p.toString() : '');
}
export function adminDetailHref(id: number, f: AdminFilters, stepPage = 1) {
  const query = adminListHref(f).slice('/admin-works'.length);
  return `/admin-works/${id}${query}${stepPage === 1 ? '' : `${query ? '&' : '?'}stepPage=${stepPage}`}`;
}
export function parseAdminDetailParams(params: ClientSearchParams) {
  const { stepPage = '1', ...rest } = params;
  const page = typeof stepPage === 'string' ? clientId(stepPage) : null;
  if (page === null) throw new AdminFilterError('invalid step page');
  return { filters: parseAdminFilters(rest), stepPage: page };
}
export type AdminRow = {
  id: number;
  legacyId: number | null;
  requiredWork: string | null;
  matterId: number | null;
  caseNumber: string | null;
  subject: string | null;
  matterArchived: boolean | null;
  clientId: number | null;
  clientName: string | null;
  clientArchived: boolean | null;
  personId: number | null;
  personName: string | null;
  personActive: boolean | null;
  assigneeRaw: string | null;
  taskCreatedDate: string | null;
  executionDate: string | null;
  status: string | null;
  stepCount: number;
};
export type AdminStep = {
  id: number;
  legacyId: number | null;
  sourceOrdinal: number | null;
  actionDate: string | null;
  personId: number | null;
  personName: string | null;
  personActive: boolean | null;
  performerRaw: string | null;
  result: string | null;
  report: string | null;
};
export type AdminDetail = AdminRow & {
  result: string | null;
  previousDecision: string | null;
  lastFollowup: string | null;
  deadline: string | null;
  court: string | null;
  courtRaw: string | null;
  circuit: string | null;
  destination: string | null;
  destinationRaw: string | null;
  alert: string | null;
  steps: AdminStep[];
  stepPage: number;
  stepPages: number;
};
export type AdminOption = {
  kind: AdminFilterKey;
  value: string;
  label: string | null;
  archived: boolean;
  inactive: boolean;
};
const joins = Prisma.sql`FROM public.admin_tasks a LEFT JOIN public.matters m ON m.id=a.matter_id
  LEFT JOIN public.clients c ON c.id=m.client_id LEFT JOIN public.people p ON p.id=a.assigned_to_person_id`;
const projection = Prisma.sql`a.id,a.legacy_id AS "legacyId",a.required_work AS "requiredWork",
  a.matter_id AS "matterId",m.case_number_ar AS "caseNumber",m.subject,m.is_archived AS "matterArchived",
  m.client_id AS "clientId",c.name_ar AS "clientName",c.is_archived AS "clientArchived",
  a.assigned_to_person_id AS "personId",p.name_ar AS "personName",p.is_active AS "personActive",a.legacy_assignee_raw AS "assigneeRaw",
  a.task_created_date::text AS "taskCreatedDate",a.execution_date::text AS "executionDate",a.status,
  (SELECT count(*)::int FROM public.task_actions s WHERE s.task_id=a.id) AS "stepCount"`;
const pattern = (q: string) =>
  Prisma.sql`('%' || public.ar_normalise(${q.replace(/[\\%_]/gu, '\\$&')}) || '%')`;
function where(f: AdminFilters) {
  const conditions = [Prisma.sql`true`];
  for (const [column, value] of [
    [Prisma.sql`a.matter_id`, f.matter],
    [Prisma.sql`m.client_id`, f.client],
    [Prisma.sql`a.assigned_to_person_id`, f.person],
  ] as const) {
    if (value === 'missing') conditions.push(Prisma.sql`${column} IS NULL`);
    else if (value !== 'all') conditions.push(Prisma.sql`${column}=${Number(value)}`);
  }
  if (f.status === 'missing') conditions.push(Prisma.sql`a.status IS NULL`);
  else if (f.status !== 'all') conditions.push(Prisma.sql`a.status=${f.status.slice(6)}`);
  if (f.q)
    conditions.push(Prisma.sql`(public.ar_normalise(a.required_work) LIKE ${pattern(f.q)}
    OR public.ar_normalise(a.result) LIKE ${pattern(f.q)} OR public.ar_normalise(a.last_followup) LIKE ${pattern(f.q)}
    OR public.ar_normalise(a.legacy_assignee_raw) LIKE ${pattern(f.q)} OR public.ar_normalise(p.name_ar) LIKE ${pattern(f.q)}
    OR m.case_number_ar_normalised LIKE ${pattern(f.q)} OR m.subject_normalised LIKE ${pattern(f.q)}
    OR c.name_ar_normalised LIKE ${pattern(f.q)} OR c.full_name_normalised LIKE ${pattern(f.q)} OR public.ar_normalise(c.name_en) LIKE ${pattern(f.q)}
    OR EXISTS (SELECT 1 FROM public.person_name_alias n WHERE n.person_id=a.assigned_to_person_id AND NOT n.is_retired AND public.ar_normalise(n.alias_ar) LIKE ${pattern(f.q)})
    OR a.id::text=public.ar_normalise(${f.q}) OR a.legacy_id::text=public.ar_normalise(${f.q}))`);
  return Prisma.join(conditions, ' AND ');
}
export function adminCountQuery(f: AdminFilters) {
  return Prisma.sql`SELECT count(*)::int total ${joins} WHERE ${where(f)}`;
}
export function adminRowsQuery(f: AdminFilters, page: number) {
  return Prisma.sql`SELECT ${projection} ${joins} WHERE ${where(f)} ORDER BY a.task_created_date DESC NULLS LAST,a.id DESC LIMIT ${ADMIN_PAGE_SIZE} OFFSET ${(page - 1) * ADMIN_PAGE_SIZE}`;
}
export function adminDetailQuery(id: number) {
  return Prisma.sql`SELECT ${projection},a.result,a.previous_decision AS "previousDecision",a.last_followup AS "lastFollowup",a.deadline::text,
    ct.label_ar AS court,a.legacy_court_raw AS "courtRaw",a.circuit,d.label_ar AS destination,a.legacy_destination_raw AS "destinationRaw",a.alert
    ${joins} LEFT JOIN public.lookup_court ct ON ct.id=a.court_id LEFT JOIN public.lookup_matter_destination d ON d.id=a.destination_id WHERE a.id=${id}`;
}
export function adminStepsQuery(id: number, page: number) {
  return Prisma.sql`SELECT s.id,s.legacy_id AS "legacyId",s.source_ordinal AS "sourceOrdinal",s.action_date::text AS "actionDate",
    s.performed_by_person_id AS "personId",p.name_ar AS "personName",p.is_active AS "personActive",s.legacy_performed_by_raw AS "performerRaw",s.result,s.report
    FROM public.task_actions s LEFT JOIN public.people p ON p.id=s.performed_by_person_id WHERE s.task_id=${id}
    ORDER BY (s.current_order IS NOT NULL),s.source_ordinal ASC NULLS LAST,s.current_order ASC,s.id ASC LIMIT ${ADMIN_PAGE_SIZE} OFFSET ${(page - 1) * ADMIN_PAGE_SIZE}`;
}
export function adminOptionsQuery() {
  return Prisma.sql`SELECT * FROM (
    SELECT 'matter' kind,m.id::text value,m.case_number_ar label,m.is_archived archived,false inactive FROM public.matters m
    UNION ALL SELECT 'client',c.id::text,c.name_ar,c.is_archived,false FROM public.clients c
    UNION ALL SELECT 'person',p.id::text,p.name_ar,false,NOT p.is_active FROM public.people p WHERE EXISTS(SELECT 1 FROM public.admin_tasks a WHERE a.assigned_to_person_id=p.id)
    UNION ALL SELECT DISTINCT 'status','value:'||a.status,a.status,false,false FROM public.admin_tasks a WHERE a.status IS NOT NULL
  ) choices ORDER BY kind,label COLLATE "arabic" NULLS LAST,value LIMIT 4001`;
}
function authorize(session: Session | null) {
  requireAuthorizedDecision(decideAuthorization(session, 'administrativeWorks', 'view'));
  if (!session || !(Date.parse(session.expires) > Date.now()))
    throw new AuthorizationError('unauthenticated');
}
async function snapshot<T>(
  db: PrismaClient,
  session: Session,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
      const accounts = await tx.$queryRaw<
        { id: number }[]
      >(Prisma.sql`SELECT u.id FROM public.user_accounts u JOIN public.people p ON p.id=u.person_id
      WHERE u.id=${Number(session.user.id)} AND u.person_id=${session.user.personId} AND u.role_code=${session.user.role}
      AND u.session_version=${session.user.sessionVersion} AND u.is_enabled AND NOT u.must_change_password AND p.is_active AND p.can_login`);
      if (accounts.length !== 1 || !(Date.parse(session.expires) > Date.now()))
        throw new AuthorizationError('unauthenticated');
      return work(tx);
    },
    { isolationLevel: 'RepeatableRead', timeout: 15000 },
  );
}
export async function readAdminWorks(
  session: Session | null,
  params: ClientSearchParams,
  db: PrismaClient,
) {
  authorize(session);
  const filters = parseAdminFilters(params);
  return snapshot(db, session!, async (tx) => {
    const options = await tx.$queryRaw<AdminOption[]>(Prisma.sql`${adminOptionsQuery()}`);
    if (options.length > 4000) throw new Error('Administrative options bound exceeded');
    for (const [key, value] of Object.entries(filters))
      if (
        (ADMIN_FILTER_KEYS as readonly string[]).includes(key) &&
        !['all', 'missing'].includes(String(value)) &&
        !options.some((o) => o.kind === key && o.value === value)
      )
        throw new AdminFilterError('unknown filter value');
    const counts = await tx.$queryRaw<{ total: number }[]>(Prisma.sql`${adminCountQuery(filters)}`);
    if (counts.length !== 1) throw new Error('Administrative count cardinality differs');
    const total = counts[0]!.total,
      pages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)),
      page = Math.min(filters.page, pages);
    const rows = await tx.$queryRaw<AdminRow[]>(Prisma.sql`${adminRowsQuery(filters, page)}`);
    const expected = Math.min(ADMIN_PAGE_SIZE, Math.max(0, total - (page - 1) * ADMIN_PAGE_SIZE));
    if (rows.length !== expected || new Set(rows.map((r) => r.id)).size !== expected)
      throw new Error('Administrative page cardinality differs');
    return { rows, total, pages, options, filters: { ...filters, page } };
  });
}
export async function readAdminWork(
  session: Session | null,
  rawId: string,
  rawStepPage: string,
  db: PrismaClient,
): Promise<AdminDetail | null> {
  authorize(session);
  const id = clientId(rawId),
    requested = clientId(rawStepPage);
  if (requested === null) throw new AdminFilterError('invalid step page');
  if (id === null) return null;
  return snapshot(db, session!, async (tx) => {
    const rows = await tx.$queryRaw<Omit<AdminDetail, 'steps' | 'stepPage' | 'stepPages'>[]>(
      Prisma.sql`${adminDetailQuery(id)}`,
    );
    if (rows.length > 1) throw new Error('Administrative identity cardinality differs');
    if (!rows[0]) return null;
    const stepPages = Math.max(1, Math.ceil(rows[0].stepCount / ADMIN_PAGE_SIZE)),
      stepPage = Math.min(requested, stepPages);
    const steps = await tx.$queryRaw<AdminStep[]>(Prisma.sql`${adminStepsQuery(id, stepPage)}`);
    const expected = Math.min(
      ADMIN_PAGE_SIZE,
      Math.max(0, rows[0].stepCount - (stepPage - 1) * ADMIN_PAGE_SIZE),
    );
    if (steps.length !== expected || new Set(steps.map((s) => s.id)).size !== expected)
      throw new Error('Step page cardinality differs');
    return { ...rows[0], steps, stepPage, stepPages };
  });
}
