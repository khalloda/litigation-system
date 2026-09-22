import type { Session } from 'next-auth';
import { getCurrentOutcomes, getFiveYearOutcomes } from '@/lib/dashboard';
import { t } from '@/strings';
import { DashboardError } from './dashboard-error';
import styles from '../home.module.css';
type Props = { session: Session; instant: Date };
export function CurrentOutcomes(props: Props) {
  return <OutcomePanel {...props} fiveYear={false} />;
}
export function FiveYearOutcomes(props: Props) {
  return <OutcomePanel {...props} fiveYear={true} />;
}
async function OutcomePanel({ session, instant, fiveYear }: Props & { fiveYear: boolean }) {
  const title = fiveYear ? t.dashboardMetrics.fiveYearOutcomes : t.dashboardMetrics.currentOutcomes,
    id = fiveYear ? 'outcomes-five-year-title' : 'outcomes-current-title';
  let snapshot;
  try {
    snapshot = fiveYear
      ? await getFiveYearOutcomes(session, instant)
      : await getCurrentOutcomes(session, instant);
  } catch (error) {
    return <DashboardError error={error} title={title} id={id} />;
  }
  const { window, rows, sums, coverage } = snapshot,
    max = Math.max(1, ...rows.flatMap((r) => [r.favour, r.against]));
  return (
    <section className={styles.panel} aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <p>{t.dashboardMetrics.outcomeScope}</p>
      <p>{fiveYear ? t.dashboardMetrics.fiveYearNote : t.dashboardMetrics.fullYearNote}</p>
      <p>
        {t.dashboardMetrics.windowLabel}
        <time dateTime={window.start} dir="ltr">
          {window.start}
        </time>
        {t.dashboardMetrics.exclusiveEnd}
        <time dateTime={window.end} dir="ltr">
          {window.end}
        </time>
      </p>
      <p>
        {t.dashboardMetrics.anchor}
        <time dateTime={window.anchor} dir="ltr">
          {window.anchor}
        </time>{' '}
        · {t.dashboard.cairo}
      </p>
      <p>{t.dashboardMetrics.recognizedCounts(sums.favour, sums.against)}</p>
      <p>{t.dashboardMetrics.unknownCounts(sums.missing, sums.empty, sums.other)}</p>
      <p>
        {t.dashboardMetrics.outcomeCoverage(
          coverage.total,
          coverage.inside,
          coverage.outside,
          coverage.undated,
        )}
      </p>
      {sums.favour + sums.against === 0 ? (
        <p className={styles.empty}>{t.dashboardMetrics.outcomesEmpty}</p>
      ) : null}
      <div aria-hidden="true" className={styles.outcomeChart}>
        <p>{t.dashboardMetrics.scale(max)}</p>
        {rows.map((r) => (
          <div key={r.period} className={styles.chartBucket}>
            <p dir="ltr">{r.period}</p>
            <div>
              {(['favour', 'against'] as const).map((series) => (
                <div key={series} className={styles.chartSeries}>
                  <span>
                    {series === 'favour' ? t.values.for : t.values.against}:{' '}
                    {series === 'favour' ? r.favour : r.against}
                  </span>
                  <span className={styles.barTrack}>
                    <span
                      className={series === 'favour' ? styles.favourBar : styles.againstBar}
                      style={{
                        inlineSize: `${(100 * (series === 'favour' ? r.favour : r.against)) / max}%`,
                      }}
                      data-outcome-period={r.period}
                      data-outcome-series={series}
                      data-outcome-value={series === 'favour' ? r.favour : r.against}
                    />
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className={styles.tableScroll} role="region" aria-label={title} tabIndex={0}>
        <table className={styles.metricTable}>
          <caption>{t.dashboardMetrics.outcomeTable}</caption>
          <thead>
            <tr>
              <th scope="col">{t.dashboardMetrics.period}</th>
              <th scope="col">{t.values.for}</th>
              <th scope="col">{t.values.against}</th>
              <th scope="col">{t.dashboardMetrics.unclassified}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.period} data-outcome-row={r.period}>
                <th scope="row">
                  <bdi>{r.period}</bdi>
                  {r.period >= window.anchor.slice(0, fiveYear ? 4 : 7) ? (
                    <span className={styles.metricNote}>
                      {r.period === window.anchor.slice(0, fiveYear ? 4 : 7)
                        ? t.dashboardMetrics.incompletePeriod
                        : t.dashboardMetrics.futurePeriod}
                    </span>
                  ) : null}
                </th>
                <td>{r.favour}</td>
                <td>{r.against}</td>
                <td>{r.missing + r.empty + r.other}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">{t.dashboardMetrics.total}</th>
              <td>{sums.favour}</td>
              <td>{sums.against}</td>
              <td>{sums.missing + sums.empty + sums.other}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
