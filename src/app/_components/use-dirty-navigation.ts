'use client';
import { useEffect } from 'react';
import { t } from '@/strings';

/** Guard application links and tab closure; never persists or submits a draft. */
export function useDirtyNavigation(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const navigate = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
      const next = new URL(link.href, window.location.href);
      if (next.pathname === location.pathname && next.search === location.search && next.hash)
        return;
      if (!window.confirm(t.ui.discard)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const leaveByForm = (event: SubmitEvent) => {
      if (
        !(event.target instanceof HTMLFormElement) ||
        !event.target.hasAttribute('data-leaves-editor')
      )
        return;
      if (!window.confirm(t.ui.discard)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', navigate, true);
    document.addEventListener('submit', leaveByForm, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', navigate, true);
      document.removeEventListener('submit', leaveByForm, true);
    };
  }, [dirty]);
}
