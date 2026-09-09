import Link from 'next/link';
import { t } from '@/strings';
import styles from '../staff/staff.module.css';
export default function ClientNotFound() {
  return (
    <main className={styles.page}>
      <h1>{t.clients.notFound}</h1>
      <div className={styles.panel}>
        <p>{t.clients.notFoundHint}</p>
        <Link className={styles.link} href="/clients">
          {t.clients.back}
        </Link>
      </div>
    </main>
  );
}
