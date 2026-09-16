'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { t } from '@/strings';

export function PoaFilterClear({ className }: { className?: string }) {
  const link = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    let frame = 0;
    const resetRestoredDraft = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => link.current?.closest('form')?.reset());
    };
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) resetRestoredDraft();
    };
    // Back/Forward can restore a complete document, including unsent drafts.
    // A newly loaded history document may fire pageshow before hydration.
    const navigation = performance.getEntriesByType('navigation')[0] as
      PerformanceNavigationTiming | undefined;
    if (navigation?.type === 'back_forward') resetRestoredDraft();
    window.addEventListener('pageshow', restored);
    window.addEventListener('popstate', resetRestoredDraft);
    return () => {
      window.removeEventListener('pageshow', restored);
      window.removeEventListener('popstate', resetRestoredDraft);
      cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <Link
      ref={link}
      className={className}
      href="/powers-of-attorney"
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        const form = event.currentTarget.closest('form');
        if (!form) return;
        // A same-URL navigation does not remount the form. Reset drafts now,
        // using list defaults rather than the previous filtered defaultValues.
        const query = form.elements.namedItem('q');
        if (query instanceof HTMLInputElement) query.value = '';
        for (const name of ['client', 'lawyer', 'archive', 'copies', 'report']) {
          const control = form.elements.namedItem(name);
          if (control instanceof HTMLSelectElement)
            control.value = name === 'archive' ? 'current' : 'all';
        }
        // The bare list already has the right results. Do not schedule a
        // redundant route refresh that could race the user's next Search.
        if (event.currentTarget.href === window.location.href) event.preventDefault();
      }}
    >
      {t.clients.clear}
    </Link>
  );
}
