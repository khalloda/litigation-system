'use client';
import { reportChart, reportOutcomeChart } from '@/lib/reports/chart';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
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
import { ReportLabelParts } from './label-parts';

export function ReportForm({
  descriptor,
  options,
  initialClient = '',
  initialMatter = '',
}: {
  descriptor: ReportDescriptor;
  options: ReportOptions;
  initialClient?: string;
  initialMatter?: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const summary = useRef<HTMLDivElement>(null);
  const output = useRef<HTMLElement>(null);
  const abort = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<ReportResult | null>(null);
  const outcomeChart = result ? reportOutcomeChart(result.data) : null;
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null);
  const [selectionClient, setSelectionClient] = useState(initialClient);
  const [reset, setReset] = useState(0);
  const defaults = Object.fromEntries(
    (descriptor.extra ?? []).map((rule) => [rule.key, rule.defaultValue ?? '']),
  );
  const [parameters, setParameters] = useState<Record<string, string>>({
    ...defaults,
    client: initialClient,
    ...(descriptor.parameters.matter ? { matter: initialMatter } : {}),
  });
  const parameterText = (key: string, value: string) => {
    if (['client', 'branch', 'lawyer', 'matter'].includes(key)) {
      const option = referenceOptions(
        options,
        key as 'client' | 'branch' | 'lawyer' | 'matter',
      ).find((option) => String(option.id) === value);
      return option?.parts ? (
        <ReportLabelParts parts={option.parts} />
      ) : (
        (option?.label ?? (value === 'unassigned' ? t.reports.unassigned : t.common.notRecorded))
      );
    }
    return (
      descriptor.extra
        ?.find((rule) => rule.key === key)
        ?.choices.find((choice) => choice.value === value)?.label ?? value
    );
  };
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(
    () => () => {
      if (download) URL.revokeObjectURL(download.url);
    },
    [download],
  );
  function invalidate() {
    if (result || download) setMessage(t.reports.changed);
    else setMessage('');
    setResult(null);
    setDownload(null);
    setErrors([]);
  }
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
  const referenceField = (key: 'client' | 'branch' | 'lawyer' | 'matter') => {
    const rule = referenceRule(descriptor, key);
    return rule ? (
      <div key={key} className={`${styles.field} ${key === 'lawyer' ? styles.fullField : ''}`}>
        <label htmlFor={`report-${key}`}>
          {reportFieldLabel(key)} — {rule.required ? t.reports.required : t.reports.optional}
        </label>
        <ReportReferenceSelect
          id={`report-${key}`}
          name={key}
          label={reportFieldLabel(key)}
          rule={rule}
          options={referenceOptions(options, key)}
          initialValue={
            reset === 0
              ? key === 'client'
                ? initialClient
                : key === 'matter'
                  ? initialMatter
                  : ''
              : ''
          }
          invalid={errors.includes(key)}
          describedBy={help(key)}
        />
        <details className={styles.hint}>
          <summary>{t.ui.definitions}</summary>
          <p id={`report-${key}-help`}>
            {rule.help} · {t.reports.identityHelp}
          </p>
        </details>
        {errors.includes(key) ? (
          <p id={`report-${key}-error`} className={styles.error}>
            {t.reports.invalidField}
          </p>
        ) : null}
      </div>
    ) : null;
  };
  return (
    <>
      <div className={styles.setupLayout}>
        <form
          className={styles.setupForm}
          ref={form}
          noValidate
          onChange={(event) => {
            // Searching option labels changes no submitted parameter.
            const target = event.target;
            if (
              (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) &&
              target.name
            ) {
              invalidate();
              const values = Object.fromEntries(
                [...new FormData(event.currentTarget)].map(([key, value]) => [key, String(value)]),
              );
              setSelectionClient(values.client ?? '');
              setParameters(values);
            }
          }}
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
          <fieldset key={reset} disabled={busy} className={styles.fields}>
            <legend>{t.ui.prepareReport}</legend>
            {(['client', 'branch', 'matter'] as const).map(referenceField)}
            {[...(descriptor.extra ?? [])]
              .sort((a, b) => (a.key === 'extra_mode' ? 1 : b.key === 'extra_mode' ? -1 : 0))
              .map((rule) => (
                <div
                  key={rule.key}
                  className={`${styles.field} ${rule.key === 'extra_mode' ? styles.fullField : ''}`}
                >
                  <label htmlFor={`report-${rule.key}`}>{rule.label}</label>
                  <select
                    id={`report-${rule.key}`}
                    name={rule.key}
                    defaultValue={rule.defaultValue ?? ''}
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
                    <details className={styles.hint}>
                      <summary>{t.ui.definitions}</summary>
                      <p id={`report-${key}-help`}>
                        {descriptor.date!.fieldMeaning} · {t.reports.datesHelp}
                      </p>
                    </details>
                    {errors.includes(key) ? (
                      <p id={`report-${key}-error`} className={styles.error}>
                        {t.reports.invalidField}
                      </p>
                    ) : null}
                  </div>
                ))
              : null}
            {referenceField('lawyer')}
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
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                invalidate();
                setSelectionClient('');
                setParameters(defaults);
                setReset((value) => value + 1);
              }}
            >
              {t.reports.clear}
            </button>
            {busy ? (
              <button type="button" onClick={() => abort.current?.abort()}>
                {t.reports.cancel}
              </button>
            ) : null}
          </div>
          <p className={styles.hint}>{t.ui.noRunOnOpen}</p>
        </form>
        <aside className={styles.setupSummary} aria-label={t.ui.beforeReport}>
          <h2>{t.ui.beforeReport}</h2>
          <dl>
            {Object.entries(parameters)
              .sort(([a], [b]) => (a === 'client' ? -1 : b === 'client' ? 1 : 0))
              .filter(([, value]) => value)
              .map(([key, value]) => (
                <div key={key}>
                  <dt>{label(key)}</dt>
                  <dd dir="auto">{parameterText(key, value)}</dd>
                </div>
              ))}
          </dl>
          {!parameters.client && descriptor.parameters.client ? (
            <p>
              {t.reports.required} — {t.fields.client}
            </p>
          ) : null}
          {descriptor.extra?.some((rule) => rule.key === 'extra_mode') ? (
            <>
              <p>
                {descriptor.id === 'matter-closed'
                  ? t.closedSelection.period
                  : t.reportSelection.period}
              </p>
              {/^[1-9]\d*$/u.test(selectionClient) ? (
                <Link
                  className={styles.secondaryAction}
                  href={`/reports/${descriptor.id === 'matter-closed' ? 'closed-selection' : 'selection'}?client=${selectionClient}`}
                >
                  {descriptor.id === 'matter-closed'
                    ? t.closedSelection.edit
                    : t.reportSelection.edit}
                </Link>
              ) : null}
            </>
          ) : null}
          {descriptor.date ? (
            <p>
              {descriptor.date.fieldMeaning} · {t.reports.datesHelp}
            </p>
          ) : null}
          <p className={styles.hint}>{t.reports.retryHelp}</p>
        </aside>
      </div>
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
                {descriptor.countLabel ?? t.reports.count}: <bdi>{result.rowCount}</bdi>
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
              {descriptor.details?.length ? (
                <dl className={styles.recordDetails}>
                  {descriptor.details.map((column, index) => (
                    <div key={column.key}>
                      <dt>{column.label}</dt>
                      <dd>
                        <bdi>{cellText(result.data.details!.at(index)!)}</bdi>
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {result.data.sections.map((section) => (
                <section key={section.id}>
                  {section.title ? <h3>{section.title}</h3> : null}
                  {reportChart(descriptor, section) ? (
                    <div aria-hidden="true" className={styles.reportChart}>
                      {reportChart(descriptor, section)!.rows.map((row) => (
                        <div key={row.id}>
                          <p>{row.label}</p>
                          {row.values.map((value) => (
                            <div key={value.key} className={styles.chartLine}>
                              <span>
                                {value.label}: {value.value}
                              </span>
                              <span className={styles.chartTrack}>
                                <span
                                  className={
                                    value.key === 'favourable'
                                      ? styles.chartFavourable
                                      : styles.chartAgainst
                                  }
                                  style={{
                                    inlineSize: `${(100 * value.value) / reportChart(descriptor, section)!.maximum}%`,
                                  }}
                                />
                              </span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {section.groups.map((group) => (
                    <div key={group.id}>
                      {group.title ? <h4>{group.title}</h4> : null}
                      {descriptor.layout === 'cover' ? (
                        group.rows.map((row) => (
                          <dl key={row.id} className={styles.recordDetails}>
                            {descriptor.columns.map((column, index) => (
                              <div key={column.key}>
                                <dt>{column.label}</dt>
                                <dd>
                                  <bdi>{cellText(row.cells.at(index)!)}</bdi>
                                </dd>
                              </div>
                            ))}
                          </dl>
                        ))
                      ) : (
                        <div
                          className={styles.scroll}
                          role="region"
                          tabIndex={0}
                          aria-label={group.title || t.reports.result}
                        >
                          <table
                            className={
                              descriptor.id === 'lawyer-upcoming-hearings'
                                ? styles.upcomingTable
                                : undefined
                            }
                          >
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
                      )}
                    </div>
                  ))}
                </section>
              ))}
              {result.rowCount === 0 ? <p>{t.reports.noRows}</p> : null}
              {outcomeChart ? (
                <section aria-label={t.matterReports.outcomeChart}>
                  <h3>{t.matterReports.outcomeChart}</h3>
                  <div aria-hidden="true" className={styles.reportChart}>
                    {outcomeChart.rows.map((row) => (
                      <div key={row.outcome} className={styles.chartLine}>
                        <span>
                          <bdi>{row.label}</bdi>: {row.count} ({row.share}%)
                        </span>
                        <span className={styles.chartTrack}>
                          <span
                            className={row.against ? styles.chartAgainst : styles.chartFavourable}
                            style={{
                              inlineSize: `${(100 * row.count) / outcomeChart.maximum}%`,
                            }}
                          />
                        </span>
                      </div>
                    ))}
                  </div>
                  <div
                    className={styles.scroll}
                    role="region"
                    tabIndex={0}
                    aria-label={t.matterReports.outcomeChart}
                  >
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">{t.matterReports.outcomeLabel}</th>
                          <th scope="col">{t.matterReports.hearingCount}</th>
                          <th scope="col">{t.matterReports.outcomeShare}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {outcomeChart.rows.map((row) => (
                          <tr key={row.outcome}>
                            <th scope="row">
                              <bdi>{row.label}</bdi>
                            </th>
                            <td>{row.count}</td>
                            <td>{row.share}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th scope="row">{t.matterReports.hearingCount}</th>
                          <td>{outcomeChart.total}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </section>
              ) : null}
              {result.data.totals.length ? (
                <dl className={styles.recordDetails}>
                  {result.data.totals.map((total, index) => (
                    <div key={index}>
                      <dt>{total.label}</dt>
                      <dd>
                        <bdi>{cellText(total.value)}</bdi>
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
