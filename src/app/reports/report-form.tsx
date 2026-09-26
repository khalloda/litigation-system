'use client';
import { useRef, useState } from 'react';
import { t } from '@/strings';
import { referenceRule, referenceOptions, reportFieldLabel } from '@/lib/reports/fields';
import { cellText } from '@/lib/reports/result';
import type {
  ReportDescriptor,
  ReportOptions,
  ReportResult,
  ReportFormat,
} from '@/lib/reports/types';
import styles from './reports.module.css';
import { ReportReferenceSelect } from './reference-select';

export function ReportForm({
  descriptor,
  options,
}: {
  descriptor: ReportDescriptor;
  options: ReportOptions;
}) {
  const form = useRef<HTMLFormElement>(null);
  const summary = useRef<HTMLDivElement>(null);
  const output = useRef<HTMLElement>(null);
  const abort = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null);
  async function execute(format: ReportFormat) {
    if (busy || !form.current) return;
    const body = new URLSearchParams();
    for (const [key, value] of new FormData(form.current))
      if (typeof value === 'string') body.append(key, value);
    body.set('format', format);
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setErrors([]);
    setMessage(t.reports.busy);
    setResult(null);
    if (download) {
      URL.revokeObjectURL(download.url);
      setDownload(null);
    }
    try {
      const response = await fetch(
        `/reports/${descriptor.id}/${format === 'preview' ? 'run' : 'export'}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
          signal: controller.signal,
          cache: 'no-store',
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
          fields?: string[];
        } | null;
        setMessage(payload?.message ?? t.reports.errors.denied);
        setErrors(payload?.fields ?? []);
        requestAnimationFrame(() => summary.current?.focus());
        return;
      }
      if (format === 'preview') {
        setResult((await response.json()) as ReportResult);
        setMessage(t.reports.ready);
        requestAnimationFrame(() => output.current?.focus());
      } else {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setDownload({ url, name: `${descriptor.id}.${format}` });
        setMessage(t.reports.saved);
        requestAnimationFrame(() => output.current?.focus());
      }
    } catch (error) {
      setMessage(
        error instanceof Error && error.name === 'AbortError'
          ? t.reports.cancelled
          : t.reports.errors.generation,
      );
      requestAnimationFrame(() => summary.current?.focus());
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }
  const help = (key: string) =>
    errors.includes(key) ? `report-${key}-help report-${key}-error` : `report-${key}-help`;
  const label = (key: string) =>
    key in t.reports.fields
      ? reportFieldLabel(key)
      : (descriptor.extra?.find((x) => x.key === key)?.label ?? t.reports.validation);
  return (
    <>
      <form
        ref={form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void execute('preview');
        }}
        aria-busy={busy}
      >
        <div
          ref={summary}
          tabIndex={-1}
          className={styles.summary}
          role="status"
          aria-live="polite"
        >
          <p>{message}</p>
          {errors.length > 0 ? (
            <>
              <p>{t.reports.validation}</p>
              <ul>
                {errors.map((key) => (
                  <li key={key}>
                    <a href={`#report-${key}`}>{label(key)}</a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
        <fieldset disabled={busy} className={styles.fields}>
          <legend>{t.reports.filters}</legend>
          {descriptor.date
            ? (['from', 'to'] as const).map((key) => (
                <div key={key} className={styles.field}>
                  <label htmlFor={`report-${key}`}>
                    {reportFieldLabel(key)} —{' '}
                    {descriptor.date!.required ? t.reports.required : t.reports.optional}
                  </label>
                  <input
                    type="date"
                    id={`report-${key}`}
                    name={key}
                    min="0001-01-01"
                    max="9998-12-31"
                    dir="ltr"
                    aria-required={descriptor.date!.required}
                    aria-invalid={errors.includes(key)}
                    aria-describedby={help(key)}
                  />
                  <p id={`report-${key}-help`}>
                    {descriptor.date!.fieldMeaning} · {t.reports.datesHelp}
                  </p>
                  {errors.includes(key) ? (
                    <p id={`report-${key}-error`} className={styles.error}>
                      {t.reports.invalidField}
                    </p>
                  ) : null}
                </div>
              ))
            : null}
          {(['client', 'branch', 'lawyer'] as const).map((key) => {
            const rule = referenceRule(descriptor, key);
            return rule ? (
              <div key={key} className={styles.field}>
                <label htmlFor={`report-${key}`}>
                  {reportFieldLabel(key)} —{' '}
                  {rule.required ? t.reports.required : t.reports.optional}
                </label>
                <ReportReferenceSelect
                  id={`report-${key}`}
                  name={key}
                  label={reportFieldLabel(key)}
                  rule={rule}
                  options={referenceOptions(options, key)}
                  invalid={errors.includes(key)}
                  describedBy={help(key)}
                />
                <p id={`report-${key}-help`}>
                  {rule.help} · {t.reports.identityHelp}
                </p>
                {errors.includes(key) ? (
                  <p id={`report-${key}-error`} className={styles.error}>
                    {t.reports.invalidField}
                  </p>
                ) : null}
              </div>
            ) : null;
          })}
          {(descriptor.extra ?? []).map((rule) => (
            <div key={rule.key} className={styles.field}>
              <label htmlFor={`report-${rule.key}`}>{rule.label}</label>
              <select
                id={`report-${rule.key}`}
                name={rule.key}
                aria-required={rule.required}
                aria-invalid={errors.includes(rule.key)}
                aria-describedby={help(rule.key)}
              >
                <option value="">{rule.required ? t.reports.required : t.reports.all}</option>
                {rule.choices.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              </select>
              <p id={`report-${rule.key}-help`}>
                {rule.required ? t.reports.required : t.reports.optional}
              </p>
              {errors.includes(rule.key) ? (
                <p id={`report-${rule.key}-error`} className={styles.error}>
                  {t.reports.invalidField}
                </p>
              ) : null}
            </div>
          ))}
        </fieldset>
        <div className={styles.actions}>
          <button type="submit" disabled={busy}>
            {t.reports.run}
          </button>
          <button type="button" disabled={busy} onClick={() => void execute('xlsx')}>
            {t.reports.xlsx}
          </button>
          <button type="button" disabled={busy} onClick={() => void execute('pdf')}>
            {t.reports.pdf}
          </button>
          {busy ? (
            <button type="button" onClick={() => abort.current?.abort()}>
              {t.reports.cancel}
            </button>
          ) : null}
        </div>
        <p>{t.reports.retryHelp}</p>
      </form>
      {result || download ? (
        <section ref={output} tabIndex={-1} aria-label={t.reports.result} className={styles.result}>
          {download ? (
            <a href={download.url} download={download.name}>
              {download.name.endsWith('.pdf') ? t.reports.pdf : t.reports.xlsx}
            </a>
          ) : null}
          {result ? (
            <>
              <h2>{t.reports.result}</h2>
              <p>
                {t.reports.count}: <bdi>{result.rowCount}</bdi>
              </p>
              <p>
                {t.reports.generatedAt}:{' '}
                <bdi>
                  {new Intl.DateTimeFormat('en-GB', {
                    timeZone: 'Africa/Cairo',
                    dateStyle: 'short',
                    timeStyle: 'medium',
                  }).format(new Date(result.generatedAt))}
                </bdi>
              </p>
              <p>{t.reports.previewHelp}</p>
              {result.data.sections.map((section) => (
                <section key={section.id}>
                  <h3>{section.title}</h3>
                  {section.groups.map((group) => (
                    <div key={group.id}>
                      <h4>{group.title}</h4>
                      <div
                        className={styles.scroll}
                        role="region"
                        tabIndex={0}
                        aria-label={group.title || t.reports.result}
                      >
                        <table>
                          <thead>
                            <tr>
                              <th scope="col">{t.reports.rowNumber}</th>
                              {descriptor.columns.map((c) => (
                                <th key={c.key} scope="col">
                                  {c.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {group.rows.map((row, index) => (
                              <tr key={row.id}>
                                <td>{index + 1}</td>
                                {row.cells.map((cell, i) => (
                                  <td key={descriptor.columns.at(i)!.key}>
                                    <bdi>{cellText(cell)}</bdi>
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </section>
              ))}
              {result.rowCount === 0 ? <p>{t.reports.noRows}</p> : null}
            </>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
