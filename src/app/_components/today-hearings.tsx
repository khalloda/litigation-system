import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Session } from 'next-auth';
import { getTodayHearings } from '@/lib/today-hearings';
import { AuthorizationError } from '@/lib/auth/authorization-core';
import { hearingDetailHref, hearingListHref } from '@/lib/hearing-query';
import { Field } from '@/app/clients/client-fields';
import { t } from '@/strings';
import styles from '../home.module.css';

export async function TodayHearings({ session }: { session: Session }) {
  let snapshot;
  try {
    snapshot = await getTodayHearings(session);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      if (error.reason === 'unauthenticated') redirect('/login');
      if (error.reason === 'password-change-required') redirect('/change-password');
      redirect('/forbidden');
    }
    return (
      <section className={styles.panel} aria-labelledby="today-title">
        <h2 id="today-title">{t.dashboard.today}</h2>
        <p role="alert">{t.dashboard.error}</p>
        <form action="/" method="get">
          <button className={styles.button} type="submit">
            {t.dashboard.refresh}
          </button>
        </form>
      </section>
    );
  }
  const { date, total, rows, filters } = snapshot;
  return (
    <section className={styles.panel} aria-labelledby="today-title">
      <header className={styles.panelHeader}>
        <div>
          <h2 id="today-title">{t.dashboard.today}</h2>
          <p>
            <time dateTime={date} dir="ltr">
              {date}
            </time>{' '}
            · {t.dashboard.cairo}
          </p>
          <p>{t.dashboard.snapshotHint}</p>
        </div>
        <form action="/" method="get">
          <button className={styles.button} type="submit">
            {t.dashboard.refresh}
          </button>
        </form>
      </header>
      <div className={styles.summary}>
        <p role="status">{t.hearings.results(total)}</p>
        <p>{t.dashboard.showing(rows.length, total)}</p>
        <Link className={styles.link} href={hearingListHref(filters)}>
          {t.dashboard.all}
        </Link>
      </div>
      {rows.length ? (
        <ol className={styles.records}>
          {rows.map((row) => (
            <li key={row.id} className={styles.record}>
              <h3>
                <Link className={styles.link} href={hearingDetailHref(row.id, filters)}>
                  {t.hearings.identity(row.id)}
                </Link>
              </h3>
              <div className={styles.caseNumber} dir="auto">
                {row.matterId ? (
                  <Link href={`/matters/${row.matterId}`}>
                    {row.caseNumber?.trim() ? row.caseNumber : t.common.notRecorded}
                  </Link>
                ) : (
                  t.hearings.unassigned
                )}
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
      ) : (
        <p className={styles.empty}>{t.dashboard.empty}</p>
      )}
    </section>
  );
}
