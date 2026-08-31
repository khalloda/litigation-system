import { redirect } from 'next/navigation';
import { auth, signOut } from '@/auth';
import { AuthShell } from '@/app/_components/auth-shell';
import { t } from '@/strings';
import styles from './auth.module.css';

export default async function HomePage() {
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.mustChangePassword) redirect('/change-password');

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
          <strong>{t.auth.role}:</strong> {t.auth.roles[session.user.role]}
        </p>
      </div>
      <form action={logoutAction}>
        <button className={styles.secondaryButton} type="submit">
          {t.auth.logout}
        </button>
      </form>
    </AuthShell>
  );
}
