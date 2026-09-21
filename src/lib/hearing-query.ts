import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import type { Session } from 'next-auth';
import {
  decideAuthorization,
  requireAuthorizedDecision,
  AuthorizationError,
} from './auth/authorization-core';
import { clientId, type ClientSearchParams } from './client-query';
import { matterReturnHref } from './matter-query';
import { openDecisionPredicate } from './open-decision-predicate';

export const HEARING_PAGE_SIZE = 25;
export const HEARING_SEARCH_LIMIT = 160;
export const HEARING_FILTER_KEYS = ['matter', 'client', 'court', 'attendee'] as const;
export type HearingFilterKey = (typeof HEARING_FILTER_KEYS)[number];
export type HearingFilters = Record<HearingFilterKey, string> & {
  q: string;
  page: number;
  dateField: 'hearing' | 'next';
  archive: 'current' | 'archived' | 'all';
  from: string;
  to: string;
  fromMatter: string;
  openBefore: string;
};
export class HearingFilterError extends Error {}

function date(value: string) {
  if (!value) return value;
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u.test(value) || value < '0001-01-01')
    throw new HearingFilterError('invalid date');
  const parsed = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    throw new HearingFilterError('invalid date');
  return value;
}
export function parseHearingFilters(params: ClientSearchParams): HearingFilters {
  const allowed = [
    ...HEARING_FILTER_KEYS,
    'q',
    'page',
    'dateField',
    'from',
    'to',
    'fromMatter',
    'archive',
    'openBefore',
  ];
  for (const key of Object.keys(params))
    if (!allowed.includes(key)) throw new HearingFilterError('unknown filter');
  const inputs = new Map(Object.entries(params));
  const one = (key: string, fallback: string) => {
    const v = inputs.get(key);
    if (Array.isArray(v)) throw new HearingFilterError('repeated filter');
    return v ?? fallback;
  };
  const q = one('q', '').trim(),
    page = clientId(one('page', '1'));
  if (page === null || q.length > HEARING_SEARCH_LIMIT || /[\u0000-\u001f\u007f]/u.test(q))
    throw new HearingFilterError('invalid search');
  const dateField = one('dateField', 'hearing');
  if (dateField !== 'hearing' && dateField !== 'next')
    throw new HearingFilterError('invalid date field');
  const archive = one('archive', 'current');
  if (!['current', 'archived', 'all'].includes(archive))
    throw new HearingFilterError('invalid archive filter');
  const from = date(one('from', '')),
    to = date(one('to', ''));
  const openBefore = date(one('openBefore', ''));
  if (openBefore && archive !== 'current')
    throw new HearingFilterError('open decisions require current hearings');
  if (from && to && from > to) throw new HearingFilterError('reversed date range');
  const values = HEARING_FILTER_KEYS.map((key) => {
    const value = one(key, 'all');
    if (value !== 'all' && value !== 'missing' && clientId(value) === null)
      throw new HearingFilterError('invalid identity');
    return [key, value];
  });
  let fromMatter;
  try {
    fromMatter = matterReturnHref(params.fromMatter);
  } catch {
    throw new HearingFilterError('invalid return');
  }
  return {
    ...Object.fromEntries(values),
    q,
    page,
    dateField,
    archive,
    from,
    to,
    fromMatter,
    openBefore,
  } as HearingFilters;
}
export function hearingListHref(f: HearingFilters, page = f.page): string {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(f)) {
    if ((HEARING_FILTER_KEYS as readonly string[]).includes(key) && value !== 'all')
      p.set(key, String(value));
    if (['q', 'from', 'to', 'fromMatter', 'openBefore'].includes(key) && value)
      p.set(key, String(value));
  }
  if (f.archive !== 'current') p.set('archive', f.archive);
  if (f.dateField !== 'hearing') p.set('dateField', f.dateField);
  if (page !== 1) p.set('page', String(page));
  return '/hearings' + (p.size ? '?' + p.toString() : '');
}
export function hearingDetailHref(id: number, f: HearingFilters) {
  return `/hearings/${id}${hearingListHref(f).slice('/hearings'.length)}`;
}
export function hearingReturnHref(value: string | string[] | undefined): string {
  if (!value) return '';
  if (
    Array.isArray(value) ||
    value.length > 6000 ||
    !/^\/hearings(?:\/[1-9]\d{0,9})?(?:\?|$)/u.test(value)
  )
    throw new HearingFilterError('invalid hearing return');
  const url = new URL(value, 'http://localhost');
  if (url.hash) throw new HearingFilterError('invalid hearing return');
  const entries = new Map<string, string>();
  for (const [key, item] of url.searchParams) {
    if (entries.has(key)) throw new HearingFilterError('duplicate return filter');
    entries.set(key, item);
  }
  const filters = parseHearingFilters(Object.fromEntries(entries));
  if (url.pathname === '/hearings') return hearingListHref(filters);
  const id = clientId(url.pathname.slice('/hearings/'.length));
  if (id === null) throw new HearingFilterError('invalid hearing return');
  return hearingDetailHref(id, filters);
}
export type HearingRow = {
  id: number;
  legacyId: number | null;
  matterId: number | null;
  caseNumber: string | null;
  subject: string | null;
  matterArchived: boolean | null;
  hearingArchived: boolean;
  clientId: number | null;
  clientName: string | null;
  clientArchived: boolean | null;
  hearingDate: string | null;
  nextHearingDate: string | null;
  court: string | null;
  action: string | null;
  decision: string | null;
  attendeeCount: number;
};
export type HearingAttendee = {
  id: number;
  personId: number | null;
  ordinal: number | null;
  name: string | null;
  active: boolean | null;
  retired: boolean;
};
export type HearingDetail = HearingRow & {
  destination: string | null;
  circuit: string | null;
  notes: string | null;
  outcome: string | null;
  attendees: HearingAttendee[];
  retiredAttendees: HearingAttendee[];
};
export type HearingOption = {
  kind: HearingFilterKey;
  value: string;
  label: string | null;
  archived: boolean;
  inactive: boolean;
};
const joins = Prisma.sql`FROM public.hearings h LEFT JOIN public.matters m ON m.id=h.matter_id
  LEFT JOIN public.clients c ON c.id=m.client_id LEFT JOIN public.lookup_court ct ON ct.id=h.court_id
  LEFT JOIN public.lookup_hearing_action a ON a.id=h.action_id`;
const projection = Prisma.sql`h.is_archived AS "hearingArchived",h.id,h.legacy_id AS "legacyId",h.matter_id AS "matterId",m.case_number_ar AS "caseNumber",m.subject,
  m.is_archived AS "matterArchived",m.client_id AS "clientId",c.name_ar AS "clientName",c.is_archived AS "clientArchived",
  h.hearing_date::text AS "hearingDate",h.next_hearing_date::text AS "nextHearingDate",ct.label_ar AS court,a.label_ar AS action,h.decision,
  (SELECT count(*)::int FROM public.hearing_attendees ha WHERE NOT coalesce((to_jsonb(ha)->>'is_retired')::boolean,false) AND ha.hearing_id=h.id) AS "attendeeCount"`;
const pattern = (q: string) =>
  Prisma.sql`('%' || public.ar_normalise(${q.replace(/[\\%_]/gu, '\\$&')}) || '%')`;
function where(f: HearingFilters) {
  const conditions = [Prisma.sql`true`];
  if (f.openBefore) conditions.push(openDecisionPredicate(f.openBefore));
  if (f.archive !== 'all') conditions.push(Prisma.sql`h.is_archived=${f.archive === 'archived'}`);
  for (const [column, value] of [
    [Prisma.sql`h.matter_id`, f.matter],
    [Prisma.sql`m.client_id`, f.client],
    [Prisma.sql`h.court_id`, f.court],
  ] as const) {
    if (value === 'missing') conditions.push(Prisma.sql`${column} IS NULL`);
    else if (value !== 'all') conditions.push(Prisma.sql`${column}=${Number(value)}`);
  }
  if (f.attendee === 'missing')
    conditions.push(
      Prisma.sql`NOT EXISTS (SELECT 1 FROM public.hearing_attendees ha WHERE NOT coalesce((to_jsonb(ha)->>'is_retired')::boolean,false) AND ha.hearing_id=h.id)`,
    );
  else if (f.attendee !== 'all')
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM public.hearing_attendees ha WHERE NOT coalesce((to_jsonb(ha)->>'is_retired')::boolean,false) AND ha.hearing_id=h.id AND ha.person_id=${Number(f.attendee)})`,
    );
  const column =
    f.dateField === 'next' ? Prisma.sql`h.next_hearing_date` : Prisma.sql`h.hearing_date`;
  if (f.from) conditions.push(Prisma.sql`${column}>=${f.from}::date`);
  if (f.to) conditions.push(Prisma.sql`${column}<=${f.to}::date`);
  if (f.q)
    conditions.push(Prisma.sql`(public.ar_normalise(h.decision) LIKE ${pattern(f.q)}
    OR public.ar_normalise(h.notes) LIKE ${pattern(f.q)} OR public.ar_normalise(h.circuit) LIKE ${pattern(f.q)}
    OR m.case_number_ar_normalised LIKE ${pattern(f.q)} OR m.subject_normalised LIKE ${pattern(f.q)}
    OR c.name_ar_normalised LIKE ${pattern(f.q)} OR c.full_name_normalised LIKE ${pattern(f.q)} OR public.ar_normalise(c.name_en) LIKE ${pattern(f.q)}
    OR h.id::text=${f.q} OR h.legacy_id::text=${f.q})`);
  return Prisma.join(conditions, ' AND ');
}
export function hearingCountQuery(f: HearingFilters) {
  return Prisma.sql`SELECT count(*)::int total ${joins} WHERE ${where(f)}`;
}
/** Historical/report inclusion deliberately ignores the operational archive default. */
export function hearingHistoricalCountQuery(f: HearingFilters) {
  return hearingCountQuery({ ...f, archive: 'all' });
}
export function hearingRowsQuery(f: HearingFilters, page: number) {
  const order = f.openBefore
    ? Prisma.sql`h.next_hearing_date,h.id`
    : Prisma.sql`h.hearing_date DESC NULLS LAST,h.id DESC`;
  return Prisma.sql`SELECT ${projection} ${joins} WHERE ${where(f)} ORDER BY ${order} LIMIT ${HEARING_PAGE_SIZE} OFFSET ${(page - 1) * HEARING_PAGE_SIZE}`;
}
export function hearingDetailQuery(id: number) {
  return Prisma.sql`SELECT ${projection},ds.label_ar AS destination,h.circuit,h.notes,h.outcome ${joins}
    LEFT JOIN public.lookup_matter_destination ds ON ds.id=h.destination_id WHERE h.id=${id}`;
}
export function hearingOptionsQuery() {
  return Prisma.sql`SELECT * FROM (
    SELECT 'matter' kind,m.id::text value,m.case_number_ar label,m.is_archived archived,false inactive FROM public.matters m
    UNION ALL SELECT 'client',c.id::text,c.name_ar,c.is_archived,false FROM public.clients c
    UNION ALL SELECT 'court',ct.id::text,ct.label_ar,false,NOT ct.is_active FROM public.lookup_court ct
    UNION ALL SELECT 'attendee',p.id::text,p.name_ar,false,NOT p.is_active FROM public.people p
      WHERE EXISTS (SELECT 1 FROM public.hearing_attendees ha WHERE NOT coalesce((to_jsonb(ha)->>'is_retired')::boolean,false) AND ha.person_id=p.id)
  ) options ORDER BY kind,label COLLATE "arabic" NULLS LAST,value LIMIT 4001`;
}
function authorize(session: Session | null) {
  requireAuthorizedDecision(decideAuthorization(session, 'hearings', 'view'));
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
        AND u.session_version=${session.user.sessionVersion} AND u.is_enabled AND NOT u.must_change_password
        AND p.is_active AND p.can_login`);
      if (accounts.length !== 1 || !(Date.parse(session.expires) > Date.now()))
        throw new AuthorizationError('unauthenticated');
      return work(tx);
    },
    { isolationLevel: 'RepeatableRead', timeout: 15000 },
  );
}
export async function readHearings(
  session: Session | null,
  params: ClientSearchParams,
  db: PrismaClient,
) {
  authorize(session);
  const filters = parseHearingFilters(params);
  return snapshot(db, session!, async (tx) => {
    const options = await tx.$queryRaw<HearingOption[]>(Prisma.sql`${hearingOptionsQuery()}`);
    if (options.length > 4000) throw new Error('Hearing options bound exceeded');
    for (const [key, value] of Object.entries(filters))
      if (
        (HEARING_FILTER_KEYS as readonly string[]).includes(key) &&
        !['all', 'missing'].includes(String(value)) &&
        !options.some((o) => o.kind === key && o.value === value)
      )
        throw new HearingFilterError('unknown identity');
    const counts = await tx.$queryRaw<{ total: number }[]>(
      Prisma.sql`${hearingCountQuery(filters)}`,
    );
    if (counts.length !== 1) throw new Error('Hearing count cardinality differs');
    const total = counts[0]!.total,
      pages = Math.max(1, Math.ceil(total / HEARING_PAGE_SIZE)),
      page = Math.min(filters.page, pages);
    const rows = await tx.$queryRaw<HearingRow[]>(Prisma.sql`${hearingRowsQuery(filters, page)}`);
    const expected = Math.min(
      HEARING_PAGE_SIZE,
      Math.max(0, total - (page - 1) * HEARING_PAGE_SIZE),
    );
    if (rows.length !== expected || new Set(rows.map((r) => r.id)).size !== expected)
      throw new Error('Hearing page cardinality differs');
    return { rows, total, pages, options, filters: { ...filters, page } };
  });
}
export async function readHearing(
  session: Session | null,
  rawId: string,
  db: PrismaClient,
): Promise<HearingDetail | null> {
  authorize(session);
  const id = clientId(rawId);
  if (id === null) return null;
  return snapshot(db, session!, async (tx) => {
    const rows = await tx.$queryRaw<Omit<HearingDetail, 'attendees' | 'retiredAttendees'>[]>(
      Prisma.sql`${hearingDetailQuery(id)}`,
    );
    if (rows.length > 1) throw new Error('Hearing identity cardinality differs');
    if (!rows[0]) return null;
    const attendees = await tx.$queryRaw<
      HearingAttendee[]
    >(Prisma.sql`SELECT ha.id,ha.person_id AS "personId",ha.ordinal,coalesce(p.name_ar,ha.legacy_name_raw) AS name,p.is_active AS active,ha.is_retired AS retired
      FROM public.hearing_attendees ha LEFT JOIN public.people p ON p.id=ha.person_id WHERE ha.hearing_id=${id} ORDER BY coalesce((to_jsonb(ha)->>'current_order')::integer,ha.ordinal) NULLS LAST,ha.id LIMIT 1001`);
    if (
      attendees.length > 1000 ||
      attendees.filter((a) => !a.retired).length !== rows[0].attendeeCount
    )
      throw new Error('Hearing attendee cardinality differs');
    return {
      ...rows[0],
      attendees: attendees.filter((a) => !a.retired),
      retiredAttendees: attendees.filter((a) => a.retired),
    };
  });
}
