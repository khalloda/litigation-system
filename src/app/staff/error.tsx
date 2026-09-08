'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { t } from '@/strings';
import styles from './staff.module.css';

export default function StaffError({ retry }: { retry: () => void }) {
  const summary = useRef<HTMLDivElement>(null);
  useEffect(() => {
    summary.current?.focus();
  }, []);
  return (
    <main className={styles.page}>
      <h1>{t.staff.title}</h1>
      <div
        ref={summary}
        tabIndex={-1}
        role="alert"
        className={`${styles.panel} ${styles.error} ${styles.focusTarget}`}
      >
        <p>{t.staff.loadError}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={retry}>
            {t.staff.retry}
          </button>
          <Link className={styles.link} href="/staff">
            {t.staff.back}
          </Link>
        </div>
      </div>
    </main>
  );
}
