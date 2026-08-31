import Image from 'next/image';
import firmLogo from '../../../assets/logo.png';
import { t } from '@/strings';
import styles from '../auth.module.css';

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className={styles.screen}>
      <section className={styles.panel} aria-labelledby="auth-title">
        <div className={styles.brand}>
          <Image
            className={styles.logo}
            src={firmLogo}
            alt={t.auth.logoAlt}
            priority
            sizes="(max-width: 40rem) 70vw, 24rem"
          />
          <p className={styles.systemName}>{t.app.system}</p>
        </div>
        <div className={styles.formPanel}>
          <header className={styles.heading}>
            <h1 id="auth-title">{title}</h1>
            <p>{subtitle}</p>
          </header>
          {children}
        </div>
      </section>
    </main>
  );
}
