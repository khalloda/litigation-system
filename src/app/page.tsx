import Link from 'next/link';
import { signOut } from '@/auth';
import { AuthShell } from '@/app/_components/auth-shell';
import { requireAuthenticatedPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { t } from '@/strings';
import styles from './auth.module.css';

export default async function HomePage() {
  const session = await requireAuthenticatedPage();
  const roleLabel = Object.entries(t.auth.roles).find(([role]) => role === session.user.role)?.[1];
  const canViewUsers = hasPermission(session.user.role, 'usersAndRoles', 'view');

  async function logoutAction() {
    'use server';
    await signOut({ redirectTo: '/login' });
  }

  return (
    <AuthShell title={t.auth.signedInTitle} subtitle={t.app.name}>
      <div className={styles.accountSummary}>
        <p>
          <strong>{t.auth.signedInAs}:</strong> {session.user.name}
        </p>
        <p>
          <strong>{t.auth.role}:</strong> {roleLabel}
        </p>
      </div>
      <div className={styles.accountActions}>
        {hasPermission(session.user.role, 'auditHistory', 'view') ? (
          <Link
            className={`${styles.secondaryButton} ${styles.navigationLink}`}
            href="/audit-history"
          >
            {t.auditHistory.global}
          </Link>
        ) : null}
        {hasPermission(session.user.role, 'billing', 'view') ? (
          <Link className={`${styles.secondaryButton} ${styles.navigationLink}`} href="/billing">
            {t.nav.billing}
          </Link>
        ) : null}
        {hasPermission(session.user.role, 'documents', 'view') ? (
          <Link className={`${styles.secondaryButton} ${styles.navigationLink}`} href="/documents">
            {t.nav.documents}
          </Link>
        ) : null}
        {hasPermission(session.user.role, 'feeLetters', 'view') ? (
          <Link
            className={`${styles.secondaryButton} ${styles.navigationLink}`}
            href="/fee-letters"
          >
            {t.nav.feeLetters}
          </Link>
        ) : null}
        {hasPermission(session.user.role, 'powersOfAttorney', 'view') ? (
          <Link
            className={`${styles.secondaryButton} ${styles.navigationLink}`}
            href="/powers-of-attorney"
          >
            {t.poa.title}
          </Link>
        ) : null}
        {hasPermission(session.user.role, 'administrativeWorks', 'view') ? (
          <Link
            className={`${styles.secondaryButton} ${styles.navigationLink}`}
            href="/admin-works"
          >
            {t.nav.adminWorks}
          </Link>
        ) : null}
        {hasPermission(session.user.role, 'hearings', 'view') ? (
          <Link className={`${styles.secondaryButton} ${styles.navigationLink}`} href="/hearings">
            {t.nav.hearings}
          </Link>
        ) : null}
        {hasPermission(session.user.role, 'matters', 'view') ? (
          <Link className={`${styles.secondaryButton} ${styles.navigationLink}`} href="/matters">
            {t.nav.matters}
          </Link>
        ) : null}
        {hasPermission(session.user.role, 'clients', 'view') ? (
          <Link className={`${styles.secondaryButton} ${styles.navigationLink}`} href="/clients">
            {t.nav.clients}
          </Link>
        ) : null}
        {hasPermission(session.user.role, 'staff', 'view') ? (
          <Link className={`${styles.secondaryButton} ${styles.navigationLink}`} href="/staff">
            {t.nav.staff}
          </Link>
        ) : null}
        {canViewUsers ? (
          <Link className={`${styles.secondaryButton} ${styles.navigationLink}`} href="/users">
            {t.nav.users}
          </Link>
        ) : null}
        <form action={logoutAction}>
          <button className={styles.secondaryButton} type="submit">
            {t.auth.logout}
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
