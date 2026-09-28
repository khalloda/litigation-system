'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useRef } from 'react';
import logo from '../../../assets/logo.png';
import { t } from '@/strings';
import { Icon, type IconName } from './icon';
import { logoutAction } from './logout';
import styles from './app-shell.module.css';

const icons: Record<string, IconName> = {
  '/': 'Home',
  '/matters': 'Scale',
  '/hearings': 'CalendarDays',
  '/clients': 'Users',
  '/admin-works': 'FileText',
  '/reports': 'ChartColumn',
};

export type NavigationItem = { href: string; label: string; primary: boolean };
export function AppShell({
  children,
  items,
  name,
  role,
}: {
  children: React.ReactNode;
  items: NavigationItem[];
  name: string;
  role: string;
}) {
  const pathname = usePathname();
  const mobile = useRef<HTMLDetailsElement>(null);
  const more = useRef<HTMLDetailsElement>(null);
  const active = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');
  const current = items.find((item) => active(item.href));
  function close(event: React.KeyboardEvent<HTMLDetailsElement>) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.currentTarget.open = false;
    event.currentTarget.querySelector('summary')?.focus();
  }
  const link = (item: NavigationItem) => (
    <Link
      key={item.href}
      href={item.href}
      aria-current={active(item.href) ? 'page' : undefined}
      onClick={() => {
        if (mobile.current) mobile.current.open = false;
        if (more.current) more.current.open = false;
      }}
    >
      <Icon name={icons[item.href] ?? 'FileText'} />
      <span>{item.label}</span>
    </Link>
  );
  return (
    <div className={styles.shell}>
      <a href="#application-content" className={styles.skip}>
        {t.ui.skip}
      </a>
      <header className={styles.header}>
        <Link href="/" aria-label={t.nav.dashboard}>
          <Image src={logo} alt={t.app.name} priority className={styles.logo} />
        </Link>
        <details className={styles.account} onKeyDown={close}>
          <summary>
            {name} — {role}
          </summary>
          <form action={logoutAction} data-leaves-editor>
            <button type="submit">{t.auth.logout}</button>
          </form>
        </details>
      </header>
      <nav className={styles.rail} aria-label={t.dashboard.navigation}>
        {items.filter((item) => item.primary).map(link)}
        <details ref={more} onKeyDown={close}>
          <summary>
            <Icon name="Ellipsis" />
            <span>{t.ui.more}</span>
          </summary>
          <div className={styles.more}>{items.filter((item) => !item.primary).map(link)}</div>
        </details>
      </nav>
      <details ref={mobile} className={styles.mobile} onKeyDown={close}>
        <summary>
          <Icon name="Menu" /> {t.ui.menu} — {current?.label ?? t.app.system}
        </summary>
        <nav aria-label={t.dashboard.navigation}>{items.map(link)}</nav>
      </details>
      <div id="application-content" tabIndex={-1} className={styles.content}>
        <div className={styles.location}>{current?.label ?? t.app.system}</div>
        {children}
      </div>
    </div>
  );
}
