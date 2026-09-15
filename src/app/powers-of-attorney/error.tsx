'use client';
import Link from 'next/link';
import { t } from '@/strings';
import styles from '../staff/staff.module.css';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className={styles.page}>
      <h1>{t.poa.title}</h1>
      <p role="alert">{t.poa.errors.generic}</p>
      <button className={styles.button} onClick={reset}>
        {t.poa.reload}
      </button>
      <Link className={styles.link} href="/powers-of-attorney">
        {t.poa.back}
      </Link>
    </main>
  );
}
