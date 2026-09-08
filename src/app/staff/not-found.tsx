import Link from 'next/link';
import { t } from '@/strings';
import styles from './staff.module.css';

export default function StaffNotFound() {
  return (
    <main className={styles.page}>
      <h1>{t.staff.notFound}</h1>
      <p>{t.staff.notFoundHint}</p>
      <Link className={styles.link} href="/staff">
        {t.staff.back}
      </Link>
    </main>
  );
}
