'use client';
import { useEffect, useRef } from 'react';
import { t } from '@/strings';
import styles from './matters.module.css';
export function MatterFilterPanel({ children }: { children: React.ReactNode }) {
  const panel = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 60rem)');
    const adapt = () => {
      if (panel.current) panel.current.open = !media.matches;
    };
    adapt();
    media.addEventListener('change', adapt);
    return () => media.removeEventListener('change', adapt);
  }, []);
  return (
    <details ref={panel} open className={styles.filterPanel}>
      <summary>{t.reports.filters}</summary>
      {children}
    </details>
  );
}
