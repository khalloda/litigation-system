'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import styles from './staff.module.css';

export function StaffAlert({ children }: { children: ReactNode }) {
  const summary = useRef<HTMLDivElement>(null);
  useEffect(() => {
    summary.current?.focus();
  }, []);
  return (
    <div
      ref={summary}
      tabIndex={-1}
      role="alert"
      className={`${styles.panel} ${styles.error} ${styles.focusTarget}`}
    >
      {children}
    </div>
  );
}
