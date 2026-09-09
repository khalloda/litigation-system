'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import styles from '../staff/staff.module.css';
export function ClientAlert({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className={`${styles.panel} ${styles.error} ${styles.focusTarget}`}
    >
      {children}
    </div>
  );
}
