'use client';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { t } from '@/strings';
import styles from './matters.module.css';

export function MatterWorkspace({
  children,
  detail,
  selected,
  listHref,
}: {
  children: React.ReactNode;
  detail: React.ReactNode;
  selected: number | null;
  listHref: string;
}) {
  const pane = useRef<HTMLElement>(null);
  const lastSelected = useRef<number | null>(null);
  const listPosition = useRef(0);
  const previousList = useRef(listHref);
  const restored = useRef(false);
  const storageKey = `matter-workspace:${listHref}`;
  function remember(id: number, position: number) {
    // Bounded per-tab UI metadata only: never cache a client or matter body.
    try {
      const keys = Object.keys(sessionStorage).filter((key) => key.startsWith('matter-workspace:'));
      for (const key of keys.slice(0, Math.max(0, keys.length - 9))) sessionStorage.removeItem(key);
      sessionStorage.setItem(storageKey, JSON.stringify({ id, position, at: Date.now() }));
    } catch {
      /* Storage may be disabled; URL selection and ordinary browser history still work. */
    }
  }
  useEffect(() => {
    if (previousList.current !== listHref) {
      previousList.current = listHref;
      lastSelected.current = null;
      listPosition.current = 0;
      restored.current = false;
    }
    if (!restored.current) {
      restored.current = true;
      try {
        const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
        if (
          saved &&
          Number.isSafeInteger(saved.id) &&
          saved.id > 0 &&
          saved.id <= 2147483647 &&
          Number.isFinite(saved.position) &&
          saved.position >= 0 &&
          saved.position <= 1000000 &&
          Date.now() - saved.at >= 0 &&
          Date.now() - saved.at < 86400000 &&
          (selected === null || selected === saved.id)
        ) {
          lastSelected.current = saved.id;
          listPosition.current = saved.position;
          if (!window.matchMedia('(max-width: 60rem)').matches || selected === null) {
            const row = document.getElementById(`matter-select-${saved.id}`);
            if (row) {
              row.focus({ preventScroll: true });
              window.scrollTo({ top: saved.position });
            }
          }
        }
      } catch {
        /* Ignore unavailable or malformed presentation-only state. */
      }
    }
    if (selected !== null) {
      lastSelected.current = selected;
      if (window.matchMedia('(max-width: 60rem)').matches) {
        pane.current?.focus({ preventScroll: true });
        window.scrollTo({ top: 0 });
      }
    } else if (lastSelected.current !== null) {
      document
        .getElementById(`matter-select-${lastSelected.current}`)
        ?.focus({ preventScroll: true });
      window.scrollTo({ top: listPosition.current });
    }
  }, [selected, listHref, storageKey]);
  return (
    <div className={`${styles.workspace} ${selected === null ? '' : styles.hasSelection}`}>
      <div
        className={styles.resultPane}
        onClickCapture={(event) => {
          if (event.target instanceof Element && event.target.closest('a[id^="matter-select-"]')) {
            // Capture before the narrow-screen list is hidden and the document shrinks.
            listPosition.current = window.scrollY;
            const link = event.target.closest('a[id^="matter-select-"]');
            const id = Number(link?.id.replace('matter-select-', ''));
            if (Number.isSafeInteger(id) && id > 0) remember(id, listPosition.current);
          }
        }}
      >
        {children}
      </div>
      <aside ref={pane} tabIndex={-1} className={styles.readingPane} aria-label={t.matters.details}>
        {selected !== null ? (
          <Link href={listHref} scroll={false} className={styles.returnList}>
            {t.matters.back}
          </Link>
        ) : null}
        {detail}
      </aside>
    </div>
  );
}
