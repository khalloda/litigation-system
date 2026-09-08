import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePagePermission } from '@/lib/auth/authorization';
import { readStaffManagement, StaffMutationError } from '@/lib/staff-mutations';
import { t } from '@/strings';
import { StaffEditor } from '../../staff-editor';
import styles from '../../staff.module.css';

export const metadata: Metadata = { title: t.staff.manage.edit };
export default async function EditStaffPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePagePermission({ area: 'staff', action: 'manage' });
  let snapshot;
  try {
    snapshot = await readStaffManagement(session, (await params).id);
  } catch (error) {
    if (error instanceof StaffMutationError && ['invalid', 'not-found'].includes(error.code))
      notFound();
    throw error;
  }
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p>{t.staff.manage.edit}</p>
          <h1>{snapshot.person!.nameAr}</h1>
          <p>{snapshot.person!.isActive ? t.staff.active : t.staff.former}</p>
        </div>
        <Link className={styles.link} href={`/staff/${snapshot.person!.id}`}>
          {t.staff.manage.view}
        </Link>
      </header>
      <StaffEditor snapshot={snapshot} />
    </main>
  );
}
