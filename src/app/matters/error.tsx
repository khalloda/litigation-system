'use client';
import Link from 'next/link';
import { t } from '@/strings';
import { ClientAlert } from '../clients/client-alert';
import styles from '../staff/staff.module.css';
export default function MatterError({ retry }: { retry: () => void }) {
  return (
    <main className={styles.page}>
      <h1>{t.matters.title}</h1>
      <ClientAlert>
        <p>{t.clients.loadError}</p>
        <div className={styles.actions}>
          <button className={styles.button} type="button" onClick={retry}>
            {t.clients.retry}
          </button>
          <Link className={styles.link} href="/matters">
            {t.matters.back}
          </Link>
        </div>
      </ClientAlert>
    </main>
  );
}
