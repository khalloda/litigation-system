import Link from 'next/link';
import { signOut } from '@/auth';
import { Suspense } from 'react';
import { TodayHearings } from '@/app/_components/today-hearings';
import { CurrentOutcomes, FiveYearOutcomes } from '@/app/_components/current-outcomes';
import { TopClients } from '@/app/_components/top-clients';
import { LawyerWorkload } from '@/app/_components/lawyer-workload';
import { OpenDecisions } from '@/app/_components/open-decisions';
import { requireAuthenticatedPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { t } from '@/strings';
import styles from './home.module.css';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await requireAuthenticatedPage();
  const instant = new Date();
  const roleLabel = Object.entries(t.auth.roles).find(([role]) => role === session.user.role)?.[1];
  const canViewUsers = hasPermission(session.user.role, 'usersAndRoles', 'view');

  async function logoutAction() {
    'use server';
    await signOut({ redirectTo: '/login' });
  }

  return (
    <main className={styles.page}>
      <a className={styles.skip} href="#today-panel">
        {t.dashboard.skip}
      </a>
      <header className={styles.header}>
        <div className={styles.brand}>
          <p>{t.app.name}</p>
          <h1>{t.nav.dashboard}</h1>
          <p>{t.app.system}</p>
        </div>
        <div className={styles.account}>
          <p>
            <strong>{t.auth.signedInAs}:</strong> {session.user.name}
          </p>
          <p>
            <strong>{t.auth.role}:</strong> {roleLabel}
          </p>
        </div>
      </header>
      <nav className={styles.navigation} aria-label={t.dashboard.navigation}>
        {hasPermission(session.user.role, 'auditHistory', 'view') ? (
          <Link className={styles.link} href="/audit-history">
            {t.auditHistory.global}
          </Link>
        ) : null}
        {hasPermission(session.user.role, 'billing', 'view') ? (
          <Link className={styles.link} href="/billing">
            {t.nav.billing}
          </Link>
        ) : null}
        {hasPermission(session.user.role, 'documents', 'view') ? (
          <Link className={styles.link} href="/documents">
            {t.nav.documents}
          </Link>
        ) : null}
        {hasPermission(session.user.role, 'feeLetters', 'view') ? (
          <Link className={styles.link} href="/fee-letters">
            {t.nav.feeLetters}
          </Link>
        ) : null}
        {hasPermission(session.user.role, 'powersOfAttorney', 'view') ? (
          <Link className={styles.link} href="/powers-of-attorney">
            {t.poa.title}
          </Link>
        ) : null}
        {hasPermission(session.user.role, 'administrativeWorks', 'view') ? (
          <Link className={styles.link} href="/admin-works">
            {t.nav.adminWorks}
          </Link>
        ) : null}
        {hasPermission(session.user.role, 'hearings', 'view') ? (
          <Link className={styles.link} href="/hearings">
            {t.nav.hearings}
          </Link>
        ) : null}
        {hasPermission(session.user.role, 'matters', 'view') ? (
          <Link className={styles.link} href="/matters">
            {t.nav.matters}
          </Link>
        ) : null}
        {hasPermission(session.user.role, 'clients', 'view') ? (
          <Link className={styles.link} href="/clients">
            {t.nav.clients}
          </Link>
        ) : null}
        {hasPermission(session.user.role, 'staff', 'view') ? (
          <Link className={styles.link} href="/staff">
            {t.nav.staff}
          </Link>
        ) : null}
        {canViewUsers ? (
          <Link className={styles.link} href="/users">
            {t.nav.users}
          </Link>
        ) : null}
        <form action={logoutAction}>
          <button className={styles.button} type="submit">
            {t.auth.logout}
          </button>
        </form>
      </nav>
      <nav className={styles.navigation} aria-label={t.dashboardMetrics.sections}>
        <a href="#today-panel">{t.dashboard.today}</a>
        <a href="#open-title">{t.dashboardMetrics.open}</a>
        <a href="#workload-title">{t.dashboardMetrics.workload}</a>
        <a href="#top-clients-title">{t.dashboardMetrics.topClients}</a>
        <a href="#outcomes-current-title">{t.dashboardMetrics.currentOutcomes}</a>
        <a href="#outcomes-five-year-title">{t.dashboardMetrics.fiveYearOutcomes}</a>
      </nav>
      <div id="today-panel">
        {hasPermission(session.user.role, 'hearings', 'view') ? (
          <Suspense fallback={<p role="status">{t.common.loading}</p>}>
            <TodayHearings session={session} />
          </Suspense>
        ) : null}
      </div>
      <div className={styles.metrics}>
        <Suspense fallback={<p role="status">{t.common.loading}</p>}>
          <OpenDecisions session={session} instant={instant} />
        </Suspense>
        <Suspense fallback={<p role="status">{t.common.loading}</p>}>
          <LawyerWorkload session={session} />
        </Suspense>
        <Suspense fallback={<p role="status">{t.common.loading}</p>}>
          <TopClients session={session} />
        </Suspense>
        <Suspense fallback={<p role="status">{t.common.loading}</p>}>
          <CurrentOutcomes session={session} instant={instant} />
        </Suspense>
        <Suspense fallback={<p role="status">{t.common.loading}</p>}>
          <FiveYearOutcomes session={session} instant={instant} />
        </Suspense>
      </div>
    </main>
  );
}
