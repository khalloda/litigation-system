'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export function ListFilterClear({
  href,
  label,
  defaults,
  className,
}: {
  href: string;
  label: string;
  defaults: Record<string, string>;
  className?: string;
}) {
  useEffect(() => {
    const synchronize = () => {
      const form = document.querySelector<HTMLFormElement>(`form[data-filter-form="${href}"]`);
      if (!form || window.location.pathname !== href) return;
      const query = new URLSearchParams(window.location.search);
      for (const [name, value] of Object.entries(defaults)) {
        const control = form.elements.namedItem(name);
        if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement)
          control.value = query.get(name) ?? value;
      }
    };
    const history = () => queueMicrotask(synchronize);
    window.addEventListener('pageshow', synchronize);
    window.addEventListener('popstate', history);
    return () => {
      window.removeEventListener('pageshow', synchronize);
      window.removeEventListener('popstate', history);
    };
  }, [defaults, href]);

  return (
    <Link
      className={className}
      href={href}
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        const form = event.currentTarget.closest('form');
        if (!form) return;
        for (const [name, value] of Object.entries(defaults)) {
          const control = form.elements.namedItem(name);
          if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement)
            control.value = value;
        }
        if (event.currentTarget.href === window.location.href) event.preventDefault();
      }}
    >
      {label}
    </Link>
  );
}
