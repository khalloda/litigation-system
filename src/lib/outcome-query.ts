import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import type { Session } from 'next-auth';
import { dashboardRead } from './dashboard-read';
import { cairoDate } from './cairo-date';
export type OutcomeBucket = {
  period: string;
  favour: number;
  against: number;
  missing: number;
  empty: number;
  other: number;
  total: number;
};
export type OutcomeWindow = {
  anchor: string;
  start: string;
  end: string;
  periods: string[];
  granularity: 'month' | 'year';
};
/** Internal clock only. No request/header/environment override. */
export function currentOutcomeWindow(instant: Date): OutcomeWindow {
  const anchor = cairoDate(instant),
    year = Number(anchor.slice(0, 4));
  return {
    anchor,
    start: `${year}-01-01`,
    end: `${year + 1}-01-01`,
    periods: Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`),
    granularity: 'month',
  };
}
/** Owner decision: current Cairo calendar year and four preceding years. */
export function fiveYearOutcomeWindow(instant: Date): OutcomeWindow {
  const anchor = cairoDate(instant),
    year = Number(anchor.slice(0, 4));
  return {
    anchor,
    start: `${year - 4}-01-01`,
    end: `${year + 1}-01-01`,
    periods: Array.from({ length: 5 }, (_, i) => String(year - 4 + i)),
    granularity: 'year',
  };
}
export function outcomeBucketsQuery(window: OutcomeWindow) {
  const format = window.granularity === 'month' ? 'YYYY-MM' : 'YYYY';
  return Prisma.sql`SELECT to_char(h.hearing_date,${format}) period,
  count(*) FILTER(WHERE h.outcome='صالح')::int favour,
  count(*) FILTER(WHERE h.outcome='ضد')::int against,
  count(*) FILTER(WHERE h.outcome IS NULL)::int missing,
  count(*) FILTER(WHERE h.outcome IS NOT NULL AND btrim(h.outcome)='')::int empty,
  count(*) FILTER(WHERE h.outcome IS NOT NULL AND btrim(h.outcome)<>'' AND h.outcome NOT IN('صالح','ضد'))::int other,
  count(*)::int total FROM public.hearings h
  WHERE h.hearing_date>=${window.start}::date AND h.hearing_date<${window.end}::date
  GROUP BY period ORDER BY period`;
}
export function outcomeCoverageQuery(window: OutcomeWindow) {
  return Prisma.sql`SELECT count(*)::int total,
  count(*) FILTER(WHERE hearing_date IS NULL)::int undated,
  count(*) FILTER(WHERE hearing_date<${window.start}::date OR hearing_date>=${window.end}::date)::int outside,
  count(*) FILTER(WHERE hearing_date>=${window.start}::date AND hearing_date<${window.end}::date)::int inside
  FROM public.hearings`;
}
export function readCurrentOutcomes(
  session: Session | null,
  db: PrismaClient,
  clock: () => Date = () => new Date(),
) {
  return readOutcomeWindow(session, db, currentOutcomeWindow(clock()));
}
export function readFiveYearOutcomes(
  session: Session | null,
  db: PrismaClient,
  clock: () => Date = () => new Date(),
) {
  return readOutcomeWindow(session, db, fiveYearOutcomeWindow(clock()));
}
async function readOutcomeWindow(session: Session | null, db: PrismaClient, window: OutcomeWindow) {
  return dashboardRead(session, db, ['hearings'], async (tx) => {
    const raw = await tx.$queryRaw<OutcomeBucket[]>(Prisma.sql`${outcomeBucketsQuery(window)}`);
    const coverage = await tx.$queryRaw<
      { total: number; undated: number; outside: number; inside: number }[]
    >(Prisma.sql`${outcomeCoverageQuery(window)}`);
    const rows = window.periods.map(
      (period) =>
        raw.find((r) => r.period === period) ?? {
          period,
          favour: 0,
          against: 0,
          missing: 0,
          empty: 0,
          other: 0,
          total: 0,
        },
    );
    const sums = rows.reduce(
      (sum, r) => ({
        favour: sum.favour + r.favour,
        against: sum.against + r.against,
        missing: sum.missing + r.missing,
        empty: sum.empty + r.empty,
        other: sum.other + r.other,
        total: sum.total + r.total,
      }),
      { favour: 0, against: 0, missing: 0, empty: 0, other: 0, total: 0 },
    );
    if (
      coverage.length !== 1 ||
      new Set(raw.map((r) => r.period)).size !== raw.length ||
      raw.some((r) => !window.periods.includes(r.period)) ||
      rows.some((r) => r.favour + r.against + r.missing + r.empty + r.other !== r.total) ||
      coverage[0]!.inside !== sums.total ||
      coverage[0]!.total !== coverage[0]!.inside + coverage[0]!.outside + coverage[0]!.undated
    )
      throw new Error('Outcome reconciliation differs');
    return { window, rows, sums, coverage: coverage[0]! };
  });
}
