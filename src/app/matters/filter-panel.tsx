'use client';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { t } from '@/strings';
import styles from './matters.module.css';
export function MatterFilterClear({ className }: { className?: string }) {
  return (
    <Link
      className={className}
      href="/matters"
      onClick={(event) => {
        if (
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey
        ) {
          // Reset only this filter form, including its externally associated search input.
          // This also handles Clear at the bare URL, where navigation cannot change the key.
          event.currentTarget.closest('form')?.reset();
        }
      }}
    >
      {t.clients.clear}
    </Link>
  );
}
export function MatterFilterPanel({ children }: { children: React.ReactNode }) {
  const panel = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const restoreAppliedFilters = () => panel.current?.querySelector('form')?.reset();
    const navigation = performance.getEntriesByType('navigation')[0] as
      PerformanceNavigationTiming | undefined;
    // A full-document Back can restore dirty native input values before hydration.
    // Reset only this filter form to its server-rendered applied values.
    if (navigation?.type === 'back_forward') restoreAppliedFilters();
    const restoredPage = (event: PageTransitionEvent) => {
      if (event.persisted) restoreAppliedFilters();
    };
    window.addEventListener('pageshow', restoredPage);
    const media = window.matchMedia('(max-width: 60rem)');
    const adapt = () => {
      if (panel.current) panel.current.open = !media.matches;
    };
    adapt();
    media.addEventListener('change', adapt);
    return () => {
      media.removeEventListener('change', adapt);
      window.removeEventListener('pageshow', restoredPage);
    };
  }, []);
  return (
    <details ref={panel} open className={styles.filterPanel}>
      <summary>{t.reports.filters}</summary>
      {children}
    </details>
  );
}
