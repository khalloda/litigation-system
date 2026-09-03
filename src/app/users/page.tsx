import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePagePermission } from '@/lib/auth/authorization';
import { listUserManagementSnapshot } from '@/lib/auth/user-management';
import { t } from '@/strings';
import { UserManagement } from './user-management';
import styles from './users.module.css';

export const metadata: Metadata = { title: t.users.title };

export default async function UsersPage() {
  const session = await requirePagePermission({ area: 'usersAndRoles', action: 'view' });
  const snapshot = await listUserManagementSnapshot();
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{t.app.system}</p>
          <h1>{t.users.title}</h1>
          <p className={styles.subtitle}>{t.users.subtitle}</p>
        </div>
        <Link className={styles.backLink} href="/">
          {t.users.back}
        </Link>
      </header>
      <UserManagement
        accounts={snapshot.accounts}
        eligibleStaff={snapshot.eligibleStaff}
        currentAccountId={Number(session.user.id)}
      />
    </main>
  );
}
