import Link from 'next/link';
import { t } from '@/strings';
import styles from '../staff/staff.module.css';
export default function NotFound() {
  return (
    <main className={styles.page}>
      <h1>{t.clients.notFound}</h1>
      <p>{t.matters.notFoundHint}</p>
      <Link className={styles.link} href="/matters">
        {t.matters.back}
      </Link>
    </main>
  );
}
