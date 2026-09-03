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
