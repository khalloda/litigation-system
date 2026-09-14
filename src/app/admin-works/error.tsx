'use client';
import Link from 'next/link';
import { t } from '@/strings';
import { ClientAlert } from '../clients/client-alert';
import styles from '../staff/staff.module.css';
export default function AdminWorkError({ retry }: { retry: () => void }) {
  return (
    <main className={styles.page}>
      <h1>{t.adminWorks.title}</h1>
      <ClientAlert>
        <p>{t.clients.loadError}</p>
        <div className={styles.actions}>
          <button className={styles.button} type="button" onClick={retry}>
            {t.clients.retry}
          </button>
          <Link className={styles.link} href="/admin-works">
            {t.adminWorks.back}
          </Link>
        </div>
      </ClientAlert>
    </main>
  );
}
