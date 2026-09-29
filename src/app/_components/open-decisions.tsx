import Link from 'next/link';
import type { Session } from 'next-auth';
import { openSnapshot } from './dashboard-data';
import { hearingDetailHref, hearingListHref } from '@/lib/hearing-query';
import { Field } from '@/app/clients/client-fields';
import { t } from '@/strings';
import { DashboardError } from './dashboard-error';
import styles from '../home.module.css';

export async function OpenDecisions({
  session,
  instant,
  compact = false,
}: {
  session: Session;
  instant: Date;
  compact?: boolean;
}) {
  let snapshot;
  try {
    snapshot = await openSnapshot(session, instant);
  } catch (error) {
    return (
      <DashboardError
        view={compact ? undefined : 'analytics'}
        error={error}
        title={t.dashboardMetrics.open}
        id="open-title"
      />
    );
  }
  const { date, rows, total, filters } = snapshot;
  return (
    <section className={styles.panel} aria-labelledby="open-title">
      <h2 id="open-title">{t.dashboardMetrics.open}</h2>
      <details className={styles.definition}>
        <summary>{t.ui.definitions}</summary>
        <p>{t.dashboardMetrics.openScope}</p>
      </details>
      <p>
        <time dateTime={date} dir="ltr">
          {date}
        </time>{' '}
        · {t.dashboard.cairo}
      </p>
      <div className={styles.summary}>
        <p>{t.hearings.results(total)}</p>
        <p>{t.dashboard.showing(rows.length, total)}</p>
        <Link className={styles.link} href={hearingListHref(filters)}>
          {t.dashboardMetrics.openAll}
        </Link>
      </div>
      {rows.length ? (
        <div className={styles.compactPreview}>
          <table className={styles.metricTable}>
            <thead>
              <tr>
                <th scope="col">{t.fields.decision}</th>
                <th scope="col">{t.fields.nextHearingDate}</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 2).map((row) => (
                <tr key={row.id}>
                  <th scope="row">
                    <Link href={hearingDetailHref(row.id, filters)}>
                      <bdi className={styles.previewText}>
                        {row.caseNumber?.trim() ? row.caseNumber : t.common.notRecorded}
                      </bdi>
                    </Link>
                    <p className={styles.previewText}>{row.decision ?? t.common.notRecorded}</p>
                  </th>
                  <td>
                    <bdi>{row.nextHearingDate ?? t.common.notRecorded}</bdi>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {rows.length ? (
        <details className={styles.previewExpansion}>
          <summary>{t.ui.expandPreview}</summary>
          <ol className={styles.records}>
            {rows.map((row) => (
              <li key={row.id} className={styles.record} data-open-decision-id={row.id}>
                <h3>
                  <Link className={styles.link} href={hearingDetailHref(row.id, filters)}>
                    {t.hearings.identity(row.id)}
                  </Link>
                </h3>
                <div className={styles.caseNumber} dir="auto">
                  <Link href={`/matters/${row.matterId}`}>
                    {row.caseNumber?.trim() ? row.caseNumber : t.common.notRecorded}
                  </Link>
                </div>
                <dl className={styles.facts}>
                  <Field
                    label={t.fields.client}
                    value={
                      row.clientId ? (
                        <Link className={styles.link} href={`/clients/${row.clientId}`}>
                          {row.clientName?.trim() ? row.clientName : t.common.notRecorded}
                        </Link>
                      ) : null
                    }
                  />
                  <Field label={t.fields.nextHearingDate} value={row.nextHearingDate} />
                  <Field label={t.fields.hearingDate} value={row.hearingDate} />
                  <Field label={t.fields.court} value={row.court} />
                  <Field label={t.fields.circuit} value={row.circuit} />
                  <Field label={t.hearings.action} value={row.action} />
                </dl>
                <dl className={styles.decision}>
                  <Field label={t.fields.decision} value={row.decision} />
                  <Field label={t.dashboardMetrics.shortDecision} value={row.shortDecision} />
                </dl>
                {row.matterArchived ? (
                  <p className={styles.notice}>{t.matters.lifecycle.archived}</p>
                ) : null}
                {row.clientArchived ? (
                  <p className={styles.notice}>{t.clients.archivedNotice}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </details>
      ) : (
        <p className={styles.empty}>{t.dashboardMetrics.openEmpty}</p>
      )}
    </section>
  );
}
