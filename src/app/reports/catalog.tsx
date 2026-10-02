'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useRef } from 'react';
import type { CatalogCategory } from '@/lib/reports/catalog';
import { reportSearchText } from '@/lib/reports/search';
import { t } from '@/strings';
import styles from './catalog.module.css';

export function ReportCatalog({
  categories,
  clientContext,
}: {
  categories: readonly CatalogCategory[];
  clientContext: boolean;
}) {
  const params = useSearchParams();
  const input = useRef<HTMLInputElement>(null);
  const query = params.get('q') ?? '';
  const needle = reportSearchText(query.trim());
  const expanded = new Set(
    params.has('open') ? params.get('open')!.split(',') : clientContext ? ['clients'] : [],
  );
  const change = (key: string, value: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set(key, value);
    // Store this catalog entry before navigating to a form; Back restores it.
    window.history.replaceState(null, '', url);
  };
  const groups = categories
    .map((g) => ({
      ...g,
      reports: g.reports.filter(
        (r) => !needle || reportSearchText(`${r.title} ${r.description}`).includes(needle),
      ),
    }))
    .filter((g) => g.reports.length);
  const total = groups.reduce((n, g) => n + g.reports.length, 0);
  return (
    <div className={styles.catalog}>
      <div className={styles.search} role="search" aria-label={t.reportCatalog.search}>
        <label htmlFor="catalog-search">{t.reportCatalog.search}</label>
        <div className={styles.searchControls}>
          <input
            ref={input}
            id="catalog-search"
            type="search"
            value={query}
            onChange={(e) => change('q', e.target.value)}
            aria-describedby="catalog-search-help"
          />
          <button
            type="button"
            onClick={() => {
              change('q', '');
              input.current?.focus();
            }}
            disabled={!query}
          >
            {t.reportCatalog.clear}
          </button>
        </div>
        <p id="catalog-search-help">{t.reportCatalog.searchHelp}</p>
      </div>
      <div className={styles.toolbar}>
        <p role="status" aria-live="polite">
          {needle ? t.reportCatalog.matches : t.reportCatalog.available}: <bdi>{total}</bdi>
        </p>
        {!needle && categories.length ? (
          <div>
            <button
              type="button"
              onClick={() => change('open', categories.map((g) => g.id).join(','))}
            >
              {t.reportCatalog.expandAll}
            </button>
            <button type="button" onClick={() => change('open', '')}>
              {t.reportCatalog.collapseAll}
            </button>
          </div>
        ) : null}
      </div>
      {groups.length ? (
        <div className={styles.groups}>
          {groups.map((group) => {
            const open = Boolean(needle) || expanded.has(group.id);
            return (
              <section key={group.id} className={styles.group}>
                <h2>
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={`catalog-${group.id}`}
                    aria-disabled={Boolean(needle)}
                    onClick={() => {
                      if (needle) return;
                      if (open) expanded.delete(group.id);
                      else expanded.add(group.id);
                      change('open', [...expanded].join(','));
                    }}
                  >
                    <span>
                      <span className={styles.title}>{group.title}</span>
                      <span className={styles.description}>{group.description}</span>
                    </span>
                    <span className={styles.count}>
                      {group.reports.length}
                      <span className={styles.srOnly}> {t.reportCatalog.reports}</span>
                    </span>
                    <span aria-hidden="true" className={styles.chevron}>
                      {open ? '−' : '+'}
                    </span>
                  </button>
                </h2>
                <div id={`catalog-${group.id}`} hidden={!open}>
                  {group.tools.length ? (
                    <nav
                      className={styles.tools}
                      aria-label={`${t.reportCatalog.selectionTools} — ${group.title}`}
                    >
                      {group.tools.map((tool) => (
                        <Link key={tool.href} href={tool.href}>
                          {tool.title}
                        </Link>
                      ))}
                    </nav>
                  ) : null}
                  <ul>
                    {group.reports.map((report) => (
                      <li key={report.id} data-report-id={report.id}>
                        <div>
                          <h3 id={`title-${report.id}`}>{report.title}</h3>
                          <p>{report.description}</p>
                        </div>
                        <Link
                          href={report.href}
                          aria-labelledby={`prepare-${report.id} title-${report.id}`}
                        >
                          <span id={`prepare-${report.id}`}>{t.ui.prepareReport}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <p className={styles.empty}>
          {needle ? t.reportCatalog.noMatches : t.reports.emptyCatalog}
        </p>
      )}
    </div>
  );
}
