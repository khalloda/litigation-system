import { t } from '@/strings';
import styles from '../staff/staff.module.css';
export default function ClientLoading() {
  return (
    <main className={styles.page}>
      <h1>{t.clients.title}</h1>
      <div
        className={styles.panel}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-busy="true"
      >
        <p>{t.common.loading}</p>
      </div>
    </main>
  );
}
