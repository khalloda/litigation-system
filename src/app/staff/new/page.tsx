import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePagePermission } from '@/lib/auth/authorization';
import { readStaffManagement } from '@/lib/staff-mutations';
import { t } from '@/strings';
import { StaffEditor } from '../staff-editor';
import styles from '../staff.module.css';

export const metadata: Metadata = { title: t.staff.manage.create };
export default async function NewStaffPage() {
  const session = await requirePagePermission({ area: 'staff', action: 'manage' });
  const snapshot = await readStaffManagement(session, null);
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>{t.staff.manage.create}</h1>
        <Link className={styles.link} href="/staff">
          {t.staff.back}
        </Link>
      </header>
      <StaffEditor snapshot={snapshot} />
    </main>
  );
}
