import Link from 'next/link';
import type { Session } from 'next-auth';
import { workloadSnapshot } from './dashboard-data';
import { t } from '@/strings';
import { DashboardError } from './dashboard-error';
import styles from '../home.module.css';
export async function LawyerWorkload({
  session,
  compact = false,
}: {
  session: Session;
  compact?: boolean;
}) {
  let snapshot;
  try {
    snapshot = await workloadSnapshot(session);
  } catch (error) {
    return <DashboardError error={error} title={t.dashboardMetrics.workload} id="workload-title" />;
  }
  return (
    <section className={styles.panel} aria-labelledby="workload-title">
      <h2 id="workload-title">{t.dashboardMetrics.workload}</h2>
      <p>{t.dashboardMetrics.workloadScope}</p>
      <p>{t.dashboardMetrics.overlap}</p>
      <p>{t.dashboardMetrics.matterPopulation(snapshot.total, snapshot.unassigned)}</p>
      {compact ? (
        <div className={styles.compactPreview}>
          <table className={styles.metricTable}>
            <thead>
              <tr>
                <th scope="col">{t.fields.lawyer}</th>
                <th scope="col">{t.dashboardMetrics.distinctTotal}</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.rows.slice(0, 2).map((r) => (
                <tr key={r.id}>
                  <th scope="row">
                    <bdi>{r.name.trim() ? r.name : t.common.notRecorded}</bdi>
                  </th>
                  <td>{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {snapshot.rows.length ? (
        <details open={!compact}>
          <summary>{t.ui.fullDetails}</summary>{' '}
          <div
            className={styles.tableScroll}
            role="region"
            aria-label={t.dashboardMetrics.workload}
            tabIndex={0}
          >
            <table className={styles.metricTable}>
              <caption>{t.dashboardMetrics.workloadCaption}</caption>
              <thead>
                <tr>
                  <th scope="col">{t.fields.lawyer}</th>
                  <th scope="col">{t.matters.lawyerRoles.lead}</th>
                  <th scope="col">{t.matters.lawyerRoles.co_lead}</th>
                  <th scope="col">{t.matters.lawyerRoles.support}</th>
                  <th scope="col">{t.dashboardMetrics.distinctTotal}</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.rows.map((r) => (
                  <tr key={r.id} data-lawyer-id={r.id}>
                    <th scope="row">
                      <bdi>
                        {r.staff ? (
                          <Link className={styles.link} href={`/staff/${r.id}`}>
                            {r.name.trim() ? r.name : t.common.notRecorded}
                          </Link>
                        ) : r.name.trim() ? (
                          r.name
                        ) : (
                          t.common.notRecorded
                        )}
                      </bdi>
                      {!r.active ? (
                        <span className={styles.metricNote}>
                          {t.dashboardMetrics.inactivePerson}
                        </span>
                      ) : null}
                      {!r.staff ? (
                        <span className={styles.metricNote}>
                          {t.dashboardMetrics.externalPerson}
                        </span>
                      ) : null}
                    </th>
                    <td>{r.lead}</td>
                    <td>{r.coLead}</td>
                    <td>{r.support}</td>
                    <td>{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : (
        <p className={styles.empty}>{t.dashboardMetrics.workloadEmpty}</p>
      )}
    </section>
  );
}
