import { t } from '@/strings';
import styles from '../staff/staff.module.css';
export default function Loading() {
  return (
    <main className={styles.page}>
      <h1>{t.adminWorks.title}</h1>
      <p role="status" aria-live="polite" aria-atomic="true">
        {t.common.loading}
      </p>
    </main>
  );
}
