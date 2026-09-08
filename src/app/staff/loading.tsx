import { t } from '@/strings';
import styles from './staff.module.css';

export default function StaffLoading() {
  return (
    <main className={styles.page}>
      <h1>{t.staff.title}</h1>
      <p role="status">{t.common.loading}</p>
    </main>
  );
}
