import Link from 'next/link';
import { Suspense } from 'react';
import { TodayHearings } from '@/app/_components/today-hearings';
import { DashboardSummary } from '@/app/_components/dashboard-summary';
import { CurrentOutcomes, FiveYearOutcomes } from '@/app/_components/current-outcomes';
import { TopClients } from '@/app/_components/top-clients';
import { LawyerWorkload } from '@/app/_components/lawyer-workload';
import { OpenDecisions } from '@/app/_components/open-decisions';
import { requireAuthenticatedPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { t } from '@/strings';
import styles from './home.module.css';

export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await requireAuthenticatedPage();
  const instant = new Date();
  const detailed = (await searchParams).view === 'analytics';
  return (
    <main className={`${styles.page} ${detailed ? styles.detailed : styles.compact}`} data-reviewed>
      <a className={styles.skip} href="#today-panel">
        {t.dashboard.skip}
      </a>
      <header className={styles.header}>
        <div>
          <h1>{detailed ? t.ui.analytics : t.ui.overview}</h1>
          <p>{t.dashboard.cairo}</p>
        </div>
        <Link className={styles.button} href={detailed ? '/' : '/?view=analytics'}>
          {detailed ? t.ui.overview : t.ui.analytics}
        </Link>
      </header>
      {!detailed ? (
        <Suspense fallback={<p role="status">{t.common.loading}</p>}>
          <DashboardSummary session={session} instant={instant} />
        </Suspense>
      ) : null}
      <details className={styles.sectionLinks}>
        <summary>{t.dashboardMetrics.sections}</summary>
        <nav
          className={`${styles.navigation} ${detailed ? '' : styles.sectionNavigation}`}
          aria-label={t.dashboardMetrics.sections}
        >
          <a href="#today-panel">{t.dashboard.today}</a>
          <a href="#open-title">{t.dashboardMetrics.open}</a>
          <a href="#workload-title">{t.dashboardMetrics.workload}</a>
          <a href="#top-clients-title">{t.dashboardMetrics.topClients}</a>
          <a href="#outcomes-current-title">{t.dashboardMetrics.currentOutcomes}</a>
          <a href="#outcomes-five-year-title">{t.dashboardMetrics.fiveYearOutcomes}</a>
        </nav>
      </details>
      <div className={styles.metrics}>
        {!detailed ? (
          <>
            <div id="today-panel">
              {hasPermission(session.user.role, 'hearings', 'view') ? (
                <Suspense fallback={<p role="status">{t.common.loading}</p>}>
                  <TodayHearings session={session} compact={!detailed} />
                </Suspense>
              ) : null}
            </div>
            <Suspense fallback={<p role="status">{t.common.loading}</p>}>
              <OpenDecisions session={session} compact={!detailed} instant={instant} />
            </Suspense>
          </>
        ) : null}
        <Suspense fallback={<p role="status">{t.common.loading}</p>}>
          <LawyerWorkload session={session} compact={!detailed} />
        </Suspense>
        <Suspense fallback={<p role="status">{t.common.loading}</p>}>
          <TopClients session={session} compact={!detailed} />
        </Suspense>
        <Suspense fallback={<p role="status">{t.common.loading}</p>}>
          <CurrentOutcomes session={session} compact={!detailed} instant={instant} />
        </Suspense>
        <Suspense fallback={<p role="status">{t.common.loading}</p>}>
          <FiveYearOutcomes session={session} compact={!detailed} instant={instant} />
        </Suspense>
        {detailed ? (
          <>
            <div id="today-panel">
              {hasPermission(session.user.role, 'hearings', 'view') ? (
                <Suspense fallback={<p role="status">{t.common.loading}</p>}>
                  <TodayHearings session={session} compact={!detailed} />
                </Suspense>
              ) : null}
            </div>
            <Suspense fallback={<p role="status">{t.common.loading}</p>}>
              <OpenDecisions session={session} compact={!detailed} instant={instant} />
            </Suspense>
          </>
        ) : null}
      </div>
    </main>
  );
}
