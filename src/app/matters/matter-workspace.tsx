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
  useEffect(() => {
    if (previousList.current !== listHref) {
      previousList.current = listHref;
      lastSelected.current = null;
      listPosition.current = 0;
    }
    if (selected !== null) {
      lastSelected.current = selected;
      if (window.matchMedia('(max-width: 60rem)').matches) pane.current?.focus();
    } else if (lastSelected.current !== null) {
      document
        .getElementById(`matter-select-${lastSelected.current}`)
        ?.focus({ preventScroll: true });
      window.scrollTo({ top: listPosition.current });
    }
  }, [selected, listHref]);
  return (
    <div className={`${styles.workspace} ${selected === null ? '' : styles.hasSelection}`}>
      <div
        className={styles.resultPane}
        onClickCapture={(event) => {
          if (event.target instanceof Element && event.target.closest('a[id^="matter-select-"]')) {
            // Capture before the narrow-screen list is hidden and the document shrinks.
            listPosition.current = window.scrollY;
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
