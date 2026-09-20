'use client';
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { t } from '@/strings';
import {
  auditDetails,
  auditGroupTitle,
  auditIdentity,
  auditLabel,
  auditValue,
  auditRecordedValue,
  auditErrorText,
} from '@/lib/audit-history-projection';
import { auditSearchParams, auditParamsObject, parseAuditInput } from '@/lib/audit-history-input';
import {
  AUDIT_FILTER_DEFAULTS,
  type AuditFilters,
  type AuditResult,
  type AuditSubject,
} from '@/lib/audit-history-types';
import styles from './audit-history.module.css';
const s = t.auditHistory;
function subscribe(callback: () => void) {
  window.addEventListener('popstate', callback);
  window.addEventListener('hashchange', callback);
  return () => {
    window.removeEventListener('popstate', callback);
    window.removeEventListener('hashchange', callback);
  };
}
function signal() {
  window.dispatchEvent(new PopStateEvent('popstate'));
}
function displayError(code: string) {
  return auditErrorText(code);
}
function HistoryViewer({
  query,
  subject,
  navigate,
}: {
  query: string;
  subject: AuditSubject | null;
  navigate: (params: URLSearchParams) => void;
}) {
  const id = useId();
  const [revision, setRevision] = useState(0);
  const key = `${query}:${revision}`;
  const [loaded, setLoaded] = useState<{ key: string; result?: AuditResult; error?: string }>({
    key: '',
  });
  const [exportState, setExportState] = useState('');
  const exportInFlight = useRef(false);
  const active = useRef(true);
  const exportController = useRef<AbortController | null>(null);
  const focusAfter = useRef<'results' | 'query' | null>(null);
  const resultsStatus = useRef<HTMLParagraphElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const result = loaded.key === key ? loaded.result : undefined;
  const loading = loaded.key !== key;
  let filters: AuditFilters = AUDIT_FILTER_DEFAULTS;
  try {
    filters = parseAuditInput(auditParamsObject(new URLSearchParams(query))).filters;
  } catch {
    /* Endpoint returns bounded validation feedback. */
  }
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      exportController.current?.abort();
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/audit-history/read?${query}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!controller.signal.aborted)
          setLoaded(response.ok ? { key, result: data } : { key, error: data.error ?? 'generic' });
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setLoaded({ key, error: 'generic' });
      });
    return () => controller.abort();
  }, [key, query]);
  useEffect(() => {
    if (loading || !focusAfter.current) return;
    if (focusAfter.current === 'query')
      form.current?.querySelector<HTMLInputElement>('input[name="q"]')?.focus();
    else resultsStatus.current?.focus();
    focusAfter.current = null;
  }, [loading]);
  function apply(next: AuditFilters, cursor = '') {
    focusAfter.current ??= 'results';
    exportController.current?.abort();
    setExportState('');
    navigate(auditSearchParams(next, subject, cursor));
    setRevision((value) => value + 1);
  }
  async function exportFile(format: 'xlsx' | 'pdf') {
    if (!result || exportInFlight.current) return;
    exportInFlight.current = true;
    const controller = new AbortController();
    exportController.current = controller;
    setExportState('loading');
    try {
      const response = await fetch('/audit-history/export', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format,
          operationId: crypto.randomUUID(),
          query: auditSearchParams(result.filters, subject, result.snapshot).toString(),
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? 'generation');
      }
      const blob = await response.blob();
      if (!active.current) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit-history.${format}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportState('done');
    } catch (error) {
      if (active.current) setExportState(error instanceof Error ? error.message : 'generation');
    } finally {
      exportInFlight.current = false;
    }
  }
  return (
    <section className={styles.viewer} aria-label={s.title}>
      <p>{s.subtitle}</p>
      <p className={styles.muted}>
        {s.timezone} ·{' '}
        {subject ? `${auditLabel('entities', subject.table)} #${subject.id}` : s.global}
      </p>
      <form
        ref={form}
        key={key}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          apply(
            Object.fromEntries(
              Object.keys(AUDIT_FILTER_DEFAULTS).map((k) => [k, String(data.get(k) ?? '')]),
            ) as AuditFilters,
          );
        }}
      >
        <div className={styles.filters}>
          <label className={styles.label} htmlFor={`${id}-q`}>
            {s.search}
            <input id={`${id}-q`} name="q" maxLength={160} defaultValue={filters.q} />
          </label>
          <label className={styles.label} htmlFor={`${id}-actor`}>
            {s.actor}
            <select id={`${id}-actor`} name="actor" defaultValue={filters.actor}>
              <option value="">{s.all}</option>
              {filters.actor && !result?.actors.some((a) => a.id === filters.actor) ? (
                <option value={filters.actor}>{filters.actor}</option>
              ) : null}
              {result?.actors.map((a) => (
                <option key={`${a.id}:${a.name}:${a.username}:${a.role}`} value={a.id}>
                  {a.name} · {a.username} · {a.role} · {a.id}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.label} htmlFor={`${id}-action`}>
            {s.action}
            <select id={`${id}-action`} name="action" defaultValue={filters.action}>
              <option value="">{s.all}</option>
              {Object.keys(s.actions).map((a) => (
                <option key={a} value={a}>
                  {auditLabel('actions', a)}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.label} htmlFor={`${id}-from`}>
            {s.from}
            <input id={`${id}-from`} name="from" type="date" defaultValue={filters.from} />
          </label>
          <label className={styles.label} htmlFor={`${id}-to`}>
            {s.to}
            <input id={`${id}-to`} name="to" type="date" defaultValue={filters.to} />
          </label>
        </div>
        <div className={styles.toolbar}>
          <button className={styles.button} type="submit">
            {s.apply}
          </button>
          <button
            className={styles.button}
            type="button"
            onClick={() => {
              focusAfter.current = 'query';
              apply({ ...AUDIT_FILTER_DEFAULTS });
            }}
          >
            {s.clear}
          </button>
        </div>
      </form>
      <p ref={resultsStatus} tabIndex={-1} role="status" aria-live="polite">
        {loading
          ? s.loading
          : result
            ? `${s.results}: ${result.totalGroups} · ${s.events}: ${result.totalEvents}`
            : ''}
      </p>
      {!loading && loaded.error ? (
        <p role="alert" className={styles.error}>
          {displayError(loaded.error)}
        </p>
      ) : null}
      {result ? (
        <>
          <p className={styles.muted}>{s.groupHelp}</p>
          {result.canExport ? (
            <>
              <p>{s.exportHelp}</p>
              <div className={styles.toolbar}>
                <button
                  type="button"
                  className={styles.button}
                  disabled={exportState === 'loading'}
                  onClick={() => void exportFile('xlsx')}
                >
                  {s.exportExcel}
                </button>
                <button
                  type="button"
                  className={styles.button}
                  disabled={exportState === 'loading'}
                  onClick={() => void exportFile('pdf')}
                >
                  {s.exportPdf}
                </button>
              </div>
            </>
          ) : null}
          {exportState ? (
            <p role="status">
              {exportState === 'loading'
                ? s.exporting
                : exportState === 'done'
                  ? s.exported
                  : displayError(exportState)}
            </p>
          ) : null}
          {result.groups.length === 0 ? <p>{s.empty}</p> : null}
          {result.groups.map((group, index) => (
            <div key={group.key}>
              {index === 0 ||
              result.groups.at(index - 1)!.occurredAt.slice(0, 10) !==
                group.occurredAt.slice(0, 10) ? (
                <h2>
                  <time dir="ltr" dateTime={group.occurredAt.slice(0, 10)}>
                    {group.occurredAt.slice(0, 10)}
                  </time>
                </h2>
              ) : null}
              <article className={styles.group}>
                <h3>
                  {auditGroupTitle(group)} ·{' '}
                  <bdi dir="ltr">
                    <time dateTime={group.occurredAt}>{group.occurredAt}</time>
                  </bdi>
                </h3>
                <p>
                  {auditIdentity(group.events[0]!)} · {s.events}: {group.count}
                </p>
                {group.events.map((event) => (
                  <section
                    key={event.id}
                    className={styles.event}
                    aria-label={`${s.eventId} ${event.id}`}
                  >
                    <h4>
                      {auditLabel('actions', event.action)} · {auditLabel('entities', event.table)}{' '}
                      ·{' '}
                      {event.outcome === 'succeeded'
                        ? s.succeeded
                        : event.outcome === 'failed'
                          ? s.failed
                          : s.blocked}
                    </h4>
                    <p>
                      {s.eventId}: <bdi>{event.id}</bdi> {event.matched ? `· ${s.matched}` : ''}
                    </p>
                    <div className={styles.differences}>
                      {event.fields.map((field) => (
                        <div key={field} className={styles.difference}>
                          <strong>
                            {auditLabel('fields', field)} <bdi>({field})</bdi>
                          </strong>
                          <div className={styles.values}>
                            <div>
                              <strong>{s.before}</strong>
                              <p className={styles.value}>
                                {auditValue(auditRecordedValue(event.before, field))}
                              </p>
                            </div>
                            <div>
                              <strong>{s.after}</strong>
                              <p className={styles.value}>
                                {auditValue(auditRecordedValue(event.after, field))}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <details>
                      <summary>{s.details}</summary>
                      <dl className={styles.details}>
                        {auditDetails(event).map(([label, value]) => (
                          <div key={label}>
                            <dt>{label}</dt>
                            <dd className={styles.value}>{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  </section>
                ))}
              </article>
            </div>
          ))}
          {result.next ? (
            <button
              className={styles.button}
              type="button"
              onClick={() => apply(result.filters, result.next!)}
            >
              {s.more}
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
export function GlobalAuditViewer({ initialQuery }: { initialQuery: string }) {
  const query = useSyncExternalStore(
    subscribe,
    () => window.location.search.slice(1),
    () => initialQuery,
  );
  return (
    <HistoryViewer
      query={query}
      subject={null}
      navigate={(params) => {
        window.history.pushState(
          window.history.state,
          '',
          `${window.location.pathname}${params.size ? '?' + params : ''}`,
        );
        signal();
      }}
    />
  );
}
export function AuditHistoryButton({ subject }: { subject: AuditSubject }) {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => '',
  );
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pushed = useRef(false);
  const prefix = '#audit-history=';
  let params: URLSearchParams | null = null;
  try {
    if (hash.startsWith(prefix))
      params = new URLSearchParams(decodeURIComponent(hash.slice(prefix.length)));
  } catch {
    /* Ignore unrelated/malformed fragments. */
  }
  const anchor = params?.get('anchor');
  params?.delete('anchor');
  const open =
    anchor === id && params?.get('table') === subject.table && params?.get('id') === subject.id;
  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    const old = document.body.style.overflow;
    const opener = trigger.current;
    document.body.style.overflow = 'hidden';
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = old;
      opener?.focus({ preventScroll: true });
    };
  }, [open]);
  function navigate(value: URLSearchParams) {
    value.set('anchor', id);
    window.history.pushState(
      window.history.state,
      '',
      `${window.location.pathname}${window.location.search}${prefix}${encodeURIComponent(value.toString())}`,
    );
    signal();
  }
  function close() {
    pushed.current = false;
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${window.location.search}`,
    );
    signal();
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={styles.button}
        aria-haspopup="dialog"
        data-audit-table={subject.table}
        data-audit-id={subject.id}
        onClick={() => {
          pushed.current = true;
          navigate(auditSearchParams(AUDIT_FILTER_DEFAULTS, subject));
        }}
      >
        {s.open}
      </button>
      {open ? (
        <dialog
          ref={dialog}
          className={styles.sheet}
          aria-labelledby={id}
          onKeyDown={(event) => {
            if (event.key !== 'Tab') return;
            const controls = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex="0"]',
              ),
            ).filter((element) => element.getClientRects().length > 0);
            const first = controls.at(0),
              last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }}
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
        >
          <div className={styles.sheetContent}>
            <div className={`${styles.heading} ${styles.sheetHeader}`}>
              <h2 id={id}>{s.title}</h2>
              <button className={styles.button} type="button" autoFocus onClick={close}>
                {s.close}
              </button>
            </div>
            <HistoryViewer query={params!.toString()} subject={subject} navigate={navigate} />
          </div>
        </dialog>
      ) : null}
    </>
  );
}
