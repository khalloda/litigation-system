import Link from 'next/link';
import { t } from '@/strings';
import styles from '../staff/staff.module.css';
export default function NotFound() {
  return (
    <main className={styles.page}>
      <h1>{t.poa.errors['not-found']}</h1>
      <Link className={styles.link} href="/powers-of-attorney">
        {t.poa.back}
      </Link>
    </main>
  );
}
