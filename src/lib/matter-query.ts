import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import type { Session } from 'next-auth';
import {
  decideAuthorization,
  requireAuthorizedDecision,
  AuthorizationError,
} from '@/lib/auth/authorization-core';
import {
  clientId,
  clientDetailHref,
  parseClientFilters,
  type ClientSearchParams,
} from './client-query';

export const MATTER_PAGE_SIZE = 25;
export const MATTER_SEARCH_LIMIT = 160;
export const MATTER_FILTER_KEYS = [
  'client',
  'status',
  'type',
  'category',
  'degree',
  'venue',
  'branch',
  'lawyer',
] as const;
export type MatterFilterKey = (typeof MATTER_FILTER_KEYS)[number];
export type MatterFilters = Record<MatterFilterKey, string> & {
  q: string;
  page: number;
  fromClient: string;
};
export class MatterFilterError extends Error {}

// Return destinations are reconstructed from known local routes and bounded
// filters. Arbitrary URLs, nested return chains and duplicate parameters fail.
export function matterClientReturn(value: string | string[] | undefined): string {
  if (value === undefined || value === '') return '';
  if (
    Array.isArray(value) ||
    value.length > 1500 ||
    !/^\/clients\/[1-9]\d{0,9}(?:\?|$)/u.test(value)
  )
    throw new MatterFilterError('invalid client return');
  const url = new URL(value, 'http://localhost');
  const id = clientId(url.pathname.slice('/clients/'.length));
  if (id === null || url.hash) throw new MatterFilterError('invalid client return');
  const entries = new Map<string, string>();
  for (const [key, item] of url.searchParams) {
    if (!['q', 'status', 'archive', 'page', 'contactsPage'].includes(key) || entries.has(key))
      throw new MatterFilterError('invalid client return');
    entries.set(key, item);
  }
  try {
    const filters = parseClientFilters(Object.fromEntries(entries));
    const contactsPage = clientId(entries.get('contactsPage') ?? '1');
    if (!contactsPage) throw new Error('invalid contacts page');
    return clientDetailHref(id, filters) + `&contactsPage=${contactsPage}`;
  } catch {
    throw new MatterFilterError('invalid client return');
  }
}
export function parseMatterFilters(params: ClientSearchParams): MatterFilters {
  const entries = new Map(Object.entries(params));
  const single = (key: string, fallback: string) => {
    const v = entries.get(key);
    if (Array.isArray(v)) throw new MatterFilterError('repeated filter');
    return v ?? fallback;
  };
  const q = single('q', '').trim();
  const page = clientId(single('page', '1'));
  if (q.length > MATTER_SEARCH_LIMIT || /[\u0000-\u001f\u007f]/u.test(q) || page === null)
    throw new MatterFilterError('invalid search');
  const values = new Map<MatterFilterKey, string>();
  for (const key of MATTER_FILTER_KEYS) {
    const value = single(key, 'all');
    if (
      value !== 'all' &&
      value !== 'missing' &&
      (key === 'status'
        ? value.length > 160 || !value || /[\u0000-\u001f\u007f]/u.test(value)
        : clientId(value) === null)
    )
      throw new MatterFilterError('invalid filter');
    values.set(key, value);
  }
  return {
    ...Object.fromEntries(values),
    q,
    page,
    fromClient: matterClientReturn(params.fromClient),
  } as MatterFilters;
}
export function matterListHref(filters: MatterFilters, page = filters.page): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if ((MATTER_FILTER_KEYS as readonly string[]).includes(key) && value !== 'all')
      params.set(key, String(value));
  if (filters.q) params.set('q', filters.q);
  if (page !== 1) params.set('page', String(page));
  if (filters.fromClient) params.set('fromClient', filters.fromClient);
  return '/matters' + (params.size ? '?' + params.toString() : '');
}
export function matterDetailHref(id: number, filters: MatterFilters): string {
  return `/matters/${id}${matterListHref(filters).slice('/matters'.length)}`;
}
export function matterReturnHref(value: string | string[] | undefined): string {
  if (!value) return '';
  if (
    Array.isArray(value) ||
    value.length > 3000 ||
    !/^\/matters(?:\/[1-9]\d{0,9})?(?:\?|$)/u.test(value)
  )
    throw new MatterFilterError('invalid matter return');
  const url = new URL(value, 'http://localhost');
  const entries = new Map<string, string>();
  for (const [key, item] of url.searchParams) {
    if (![...MATTER_FILTER_KEYS, 'q', 'page', 'fromClient'].includes(key) || entries.has(key))
      throw new MatterFilterError('invalid matter return');
    entries.set(key, item);
  }
  if (url.hash) throw new MatterFilterError('invalid matter return');
  const filters = parseMatterFilters(Object.fromEntries(entries));
  if (url.pathname === '/matters') return matterListHref(filters);
  const id = clientId(url.pathname.slice('/matters/'.length));
  if (id === null) throw new MatterFilterError('invalid matter return');
  return matterDetailHref(id, filters);
}

export type MatterRow = {
  id: number;
  legacyId: number | null;
  caseNumber: string | null;
  subject: string | null;
  clientId: number | null;
  clientName: string | null;
  clientArchived: boolean | null;
  status: string | null;
  type: string | null;
  category: string | null;
  degree: string | null;
  venue: string | null;
  branch: string | null;
  lawyerCount: number;
  matches: string[];
};
export type MatterLawyer = {
  id: number;
  personId: number;
  name: string;
  role: 'lead' | 'co_lead' | 'support';
  position: number | null;
  active: boolean;
};
export type MatterParty = {
  id: number;
  side: 'client' | 'opponent';
  name: string | null;
  gender: string | null;
  ordinal: number | null;
  roles: { id: number; roleId: number; name: string; ordinal: number | null }[];
};
export type MatterDetail = Omit<MatterRow, 'matches'> & {
  court: string | null;
  circuit: string | null;
  circuitSecretary: string | null;
  courtFloor: string | null;
  courtHall: string | null;
  courtShelf: string | null;
  courtSecretaryRoom: string | null;
  importance: string | null;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  askedAmount: string | null;
  judgedAmount: string | null;
  currentStatus: string | null;
  evaluation: string | null;
  legalOpinion: string | null;
  notes1: string | null;
  notes2: string | null;
  lawyers: MatterLawyer[];
  parties: MatterParty[];
};
export type MatterOption = {
  kind: MatterFilterKey;
  value: string;
  label: string;
  archived: boolean;
  inactive: boolean;
};

const joins = Prisma.sql`FROM public.matters m
  LEFT JOIN public.clients c ON c.id=m.client_id
  LEFT JOIN public.lookup_matter_type mt ON mt.id=m.matter_type_id
  LEFT JOIN public.lookup_matter_category mc ON mc.id=m.matter_category_id
  LEFT JOIN public.lookup_degree d ON d.id=m.degree_id
  LEFT JOIN public.lookup_venue v ON v.id=m.venue_id
  LEFT JOIN public.lookup_client_branch b ON b.id=m.branch_id`;
const projection = Prisma.sql`m.id,m.legacy_id AS "legacyId",m.case_number_ar AS "caseNumber",m.subject,
  m.client_id AS "clientId",c.name_ar AS "clientName",c.is_archived AS "clientArchived",m.status,
  mt.label_ar AS type,mc.label_ar AS category,d.label_ar AS degree,v.label_ar AS venue,b.label_ar AS branch,
  (SELECT count(*)::int FROM public.matter_lawyers ml WHERE ml.matter_id=m.id) AS "lawyerCount"`;
const pattern = (q: string) =>
  Prisma.sql`('%' || public.ar_normalise(${q.replace(/[\\%_]/gu, '\\$&')}) || '%')`;
function where(f: MatterFilters) {
  const predicates = [Prisma.sql`true`];
  const columns = [
    [Prisma.sql`m.client_id`, f.client],
    [Prisma.sql`m.matter_type_id`, f.type],
    [Prisma.sql`m.matter_category_id`, f.category],
    [Prisma.sql`m.degree_id`, f.degree],
    [Prisma.sql`m.venue_id`, f.venue],
    [Prisma.sql`m.branch_id`, f.branch],
  ] as const;
  for (const [column, value] of columns) {
    if (value === 'missing') predicates.push(Prisma.sql`${column} IS NULL`);
    else if (value !== 'all') predicates.push(Prisma.sql`${column}=${Number(value)}`);
  }
  if (f.status === 'missing') predicates.push(Prisma.sql`(m.status IS NULL OR m.status='')`);
  else if (f.status !== 'all') predicates.push(Prisma.sql`m.status=${f.status}`);
  if (f.lawyer === 'missing')
    predicates.push(
      Prisma.sql`NOT EXISTS (SELECT 1 FROM public.matter_lawyers ml WHERE ml.matter_id=m.id)`,
    );
  else if (f.lawyer !== 'all')
    predicates.push(
      Prisma.sql`EXISTS (SELECT 1 FROM public.matter_lawyers ml WHERE ml.matter_id=m.id AND ml.person_id=${Number(f.lawyer)})`,
    );
  if (f.q)
    predicates.push(Prisma.sql`(m.case_number_ar_normalised LIKE ${pattern(f.q)} OR m.subject_normalised LIKE ${pattern(f.q)}
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id=m.client_id AND (c.name_ar_normalised LIKE ${pattern(f.q)} OR c.full_name_normalised LIKE ${pattern(f.q)} OR public.ar_normalise(c.name_en) LIKE ${pattern(f.q)}))
    OR EXISTS (SELECT 1 FROM public.matter_lawyers ml JOIN public.person_name_alias a ON a.person_id=ml.person_id WHERE ml.matter_id=m.id AND NOT a.is_retired AND a.alias_ar_normalised LIKE ${pattern(f.q)}))`);
  return Prisma.join(predicates, ' AND ');
}
// EXISTS keeps parent identities distinct even when several aliases match.
export function matterCountQuery(f: MatterFilters) {
  return Prisma.sql`SELECT count(*)::int total FROM public.matters m WHERE ${where(f)}`;
}
export function matterRowsQuery(f: MatterFilters, page: number) {
  const matches = f.q
    ? Prisma.sql`ARRAY(SELECT DISTINCT text FROM (
    SELECT a.alias_ar AS text FROM public.matter_lawyers ml JOIN public.person_name_alias a ON a.person_id=ml.person_id
      WHERE ml.matter_id=m.id AND NOT a.is_retired AND a.alias_ar_normalised LIKE ${pattern(f.q)}
    UNION ALL SELECT x FROM (VALUES (m.case_number_ar),(m.subject),(c.name_ar),(c.full_name),(c.name_en)) s(x)
      WHERE public.ar_normalise(x) LIKE ${pattern(f.q)} AND position(${f.q} in x)=0
    ) matches ORDER BY text LIMIT 20)`
    : Prisma.sql`ARRAY[]::text[]`;
  return Prisma.sql`SELECT ${projection},${matches} AS matches ${joins} WHERE ${where(f)}
    ORDER BY m.case_number_ar COLLATE "arabic" NULLS LAST,m.id LIMIT ${MATTER_PAGE_SIZE} OFFSET ${(page - 1) * MATTER_PAGE_SIZE}`;
}
export function matterDetailQuery(id: number) {
  return Prisma.sql`SELECT ${projection},ct.label_ar AS court,m.circuit,m.circuit_secretary AS "circuitSecretary",
    m.court_floor AS "courtFloor",m.court_hall AS "courtHall",m.court_shelf AS "courtShelf",m.court_secretary_room AS "courtSecretaryRoom",
    i.label_ar AS importance,ds.label_ar AS destination,m.start_date::text AS "startDate",m.end_date::text AS "endDate",
    m.asked_amount::text AS "askedAmount",m.judged_amount::text AS "judgedAmount",m.current_status AS "currentStatus",
    m.evaluation,m.legal_opinion AS "legalOpinion",m.notes_1 AS "notes1",m.notes_2 AS "notes2"
    ${joins} LEFT JOIN public.lookup_court ct ON ct.id=m.court_id LEFT JOIN public.lookup_importance i ON i.id=m.importance_id
    LEFT JOIN public.lookup_matter_destination ds ON ds.id=m.destination_id WHERE m.id=${id}`;
}
export function matterOptionsQuery() {
  return Prisma.sql`SELECT * FROM (
    SELECT 'client' kind,c.id::text value,c.name_ar label,c.is_archived archived,false inactive FROM public.clients c
    UNION ALL SELECT 'status',status,status,false,false FROM public.matters WHERE status IS NOT NULL AND status<>'' GROUP BY status
    UNION ALL SELECT 'type',id::text,label_ar,false,NOT is_active FROM public.lookup_matter_type
    UNION ALL SELECT 'category',id::text,label_ar,false,NOT is_active FROM public.lookup_matter_category
    UNION ALL SELECT 'degree',id::text,label_ar,false,NOT is_active FROM public.lookup_degree
    UNION ALL SELECT 'venue',id::text,label_ar,false,NOT is_active FROM public.lookup_venue
    UNION ALL SELECT 'branch',id::text,label_ar,false,NOT is_active FROM public.lookup_client_branch
    UNION ALL SELECT 'lawyer',p.id::text,p.name_ar,false,NOT p.is_active FROM public.people p
      WHERE EXISTS (SELECT 1 FROM public.matter_lawyers ml WHERE ml.person_id=p.id)
    ) options ORDER BY kind,label COLLATE "arabic",value LIMIT 2001`;
}
async function snapshot<T>(
  database: PrismaClient,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return database.$transaction(
    async (tx) => {
      await tx.$queryRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
      return work(tx);
    },
    { isolationLevel: 'RepeatableRead' },
  );
}
export async function readMatters(
  session: Session | null,
  params: ClientSearchParams,
  database: PrismaClient,
) {
  requireAuthorizedDecision(decideAuthorization(session, 'matters', 'view'));
  if (!session || !(Date.parse(session.expires) > Date.now()))
    throw new AuthorizationError('unauthenticated');
  const filters = parseMatterFilters(params);
  return snapshot(database, async (tx) => {
    const options = await tx.$queryRaw<MatterOption[]>(Prisma.sql`${matterOptionsQuery()}`);
    if (options.length > 2000) throw new Error('Matter filter option bound exceeded');
    for (const [key, value] of Object.entries(filters))
      if (
        (MATTER_FILTER_KEYS as readonly string[]).includes(key) &&
        value !== 'all' &&
        value !== 'missing' &&
        !options.some((o) => o.kind === key && o.value === value)
      )
        throw new MatterFilterError('unknown filter');
    const counts = await tx.$queryRaw<{ total: number }[]>(
      Prisma.sql`${matterCountQuery(filters)}`,
    );
    if (counts.length !== 1) throw new Error('Matter count cardinality differs');
    const total = counts[0]!.total;
    const pages = Math.max(1, Math.ceil(total / MATTER_PAGE_SIZE));
    const page = Math.min(filters.page, pages);
    const rows = await tx.$queryRaw<MatterRow[]>(Prisma.sql`${matterRowsQuery(filters, page)}`);
    const expected = Math.min(MATTER_PAGE_SIZE, Math.max(0, total - (page - 1) * MATTER_PAGE_SIZE));
    if (rows.length !== expected || new Set(rows.map((r) => r.id)).size !== expected)
      throw new Error('Matter page cardinality differs');
    return { rows, total, pages, options, filters: { ...filters, page } };
  });
}
export async function readMatter(
  session: Session | null,
  rawId: string,
  database: PrismaClient,
): Promise<MatterDetail | null> {
  requireAuthorizedDecision(decideAuthorization(session, 'matters', 'view'));
  if (!session || !(Date.parse(session.expires) > Date.now()))
    throw new AuthorizationError('unauthenticated');
  const id = clientId(rawId);
  if (id === null) return null;
  return snapshot(database, async (tx) => {
    const rows = await tx.$queryRaw<Omit<MatterDetail, 'lawyers' | 'parties'>[]>(
      Prisma.sql`${matterDetailQuery(id)}`,
    );
    if (rows.length > 1) throw new Error('Matter identity cardinality differs');
    if (!rows[0]) return null;
    const lawyers = await tx.$queryRaw<MatterLawyer[]>(
      Prisma.sql`SELECT ml.id,ml.person_id AS "personId",p.name_ar AS name,ml.role,ml.position,p.is_active AS active FROM public.matter_lawyers ml JOIN public.people p ON p.id=ml.person_id WHERE ml.matter_id=${id} ORDER BY CASE ml.role WHEN 'lead' THEN 0 WHEN 'co_lead' THEN 1 ELSE 2 END,ml.position NULLS LAST,ml.id LIMIT 1001`,
    );
    const parties = await tx.$queryRaw<
      MatterParty[]
    >(Prisma.sql`SELECT p.id,p.side,p.party_name AS name,p.gender,p.ordinal,
      coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'roleId',r.role_id,'name',CASE WHEN p.gender='f' THEN l.label_ar_f ELSE l.label_ar_m END,'ordinal',r.ordinal) ORDER BY r.ordinal NULLS LAST,r.id) FROM public.matter_party_roles r JOIN public.lookup_party_role l ON l.id=r.role_id WHERE r.party_id=p.id),'[]'::jsonb) roles
      FROM public.matter_parties p WHERE p.matter_id=${id} ORDER BY p.side,p.ordinal NULLS LAST,p.id LIMIT 1001`);
    if (lawyers.length > 1000 || parties.length > 1000)
      throw new Error('Matter relationship bound exceeded');
    if (lawyers.length !== rows[0].lawyerCount)
      throw new Error('Matter lawyer cardinality differs');
    return { ...rows[0], lawyers, parties };
  });
}
