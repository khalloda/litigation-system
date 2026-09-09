'use client';
import Link from 'next/link';
import { t } from '@/strings';
import styles from '../staff/staff.module.css';
import { ClientAlert } from './client-alert';
export default function ClientError({ retry }: { retry: () => void }) {
  return (
    <main className={styles.page}>
      <h1>{t.clients.title}</h1>
      <ClientAlert>
        <p>{t.clients.loadError}</p>
        <div className={styles.actions}>
          <button className={styles.button} type="button" onClick={retry}>
            {t.clients.retry}
          </button>
          <Link className={styles.link} href="/clients">
            {t.clients.back}
          </Link>
        </div>
      </ClientAlert>
    </main>
  );
}
