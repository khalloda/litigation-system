'use client';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import type { PoaSnapshot } from '@/lib/poa-mutations';
import { POA_FIELDS, type PoaOperation, type PoaValues } from '@/lib/poa-mutation-input';
import {
  createPoaAction,
  updatePoaAction,
  archivePoaAction,
  restorePoaAction,
  type PoaActionResult,
} from './actions';
import { t } from '@/strings';
import styles from '../staff/staff.module.css';
import local from './poa.module.css';
const labels: Record<string, string> = {
  client_id: t.poa.currentClient,
  serial_no: t.poa.serial,
  principal_name: t.poa.principal,
  poa_capacity: t.poa.capacity,
  poa_number: t.poa.number,
  poa_letter: t.poa.letter,
  poa_year: t.poa.year,
  issuing_authority: t.poa.issuer,
  issue_date: t.poa.issueDate,
  copies_count: t.poa.copies,
  notes: t.fields.notes,
  show_on_poa_report: t.poa.report,
};
export function PoaEditor(props: {
  snapshot: PoaSnapshot;
  operation: PoaOperation;
  submission: string;
  cancel: string;
  reload: string;
  query: string;
}) {
  const [original] = useState(props),
    { snapshot: s, operation: op } = original,
    creating = op === 'create',
    lifecycle = op === 'archive' || op === 'restore';
  const [values, setValues] = useState<PoaValues>(() =>
    structuredClone(s.record?.values ?? Object.fromEntries(POA_FIELDS.map((k) => [k, null]))),
  );
  const [lawyers, setLawyers] = useState<number[]>(() =>
    s.lawyers.filter((l) => !l.retired).map((l) => l.personId),
  );
  const [selected, setSelected] = useState(''),
    [result, setResult] = useState<PoaActionResult | null>(null),
    [pending, start] = useTransition();
  const feedback = useRef<HTMLDivElement>(null),
    heading = useRef<HTMLHeadingElement>(null),
    lastPayload = useRef<string | null>(null),
    prefix = useId();
  const uncertain = result?.code === 'generic',
    disabled = pending || uncertain || result?.kind === 'success';
  useEffect(() => {
    if (lifecycle) heading.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) {
        e.preventDefault();
        window.location.assign(original.cancel);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lifecycle, original.cancel, pending]);
  useEffect(() => {
    if (result?.kind === 'success' && result.id) {
      window.location.assign(
        new URL('/powers-of-attorney/' + result.id + original.query, window.location.origin).href,
      );
    } else if (result) feedback.current?.focus();
  }, [result, original.query]);
  const change = (k: string, v: string | number | boolean | null) =>
    setValues((old) => ({ ...old, [k]: v }));
  function submit() {
    if (pending || result?.kind === 'success') return;
    let payload = lastPayload.current;
    if (!uncertain) {
      const patch = lifecycle
        ? {}
        : Object.fromEntries(
            Object.entries(values).filter(
              ([k, v]) => creating || v !== new Map(Object.entries(s.record?.values ?? {})).get(k),
            ),
          );
      const initial = s.lawyers.filter((l) => !l.retired).map((l) => l.personId);
      payload = JSON.stringify({
        operation: op,
        id: s.record?.id ?? null,
        version: s.record?.version ?? null,
        submission: original.submission,
        values: patch,
        lawyers: lifecycle
          ? null
          : creating || JSON.stringify(lawyers) !== JSON.stringify(initial)
            ? lawyers
            : null,
        facts: lifecycle ? s.facts : null,
      });
      lastPayload.current = payload;
    }
    if (!payload) return;
    const form = new FormData();
    form.set('payload', payload);
    start(async () => {
      try {
        setResult(
          await (op === 'create'
            ? createPoaAction(form)
            : op === 'update'
              ? updatePoaAction(form)
              : op === 'archive'
                ? archivePoaAction(form)
                : restorePoaAction(form)),
        );
      } catch {
        setResult({ kind: 'error', code: 'generic', message: t.poa.errors.generic });
      }
    });
  }
  return (
    <form
      noValidate
      className={local.editor}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {lifecycle ? (
        <>
          <h2 ref={heading} tabIndex={-1}>
            {t.poa.confirmTitle}
          </h2>
          <p>{t.poa.lifecycleHelp}</p>
          <dl className={local.fields}>
            {(
              [
                ['id', t.poa.technicalId],
                ['principal', t.poa.principal],
                ['number', t.poa.number],
                ['letter', t.poa.letter],
                ['year', t.poa.year],
                ['clientName', t.poa.currentClient],
                ['current', t.poa.currentLawyers],
                ['retired', t.poa.retiredLawyers],
                ['original', t.poa.originalLawyers],
                ['copies', t.poa.copies],
              ] as const
            ).map(([k, label]) => (
              <div key={k}>
                <dt>{label}</dt>
                <dd className={local.value}>
                  {new Map(Object.entries(s.facts ?? {})).get(k) === null
                    ? t.poa.unknown
                    : String(new Map(Object.entries(s.facts ?? {})).get(k) ?? t.poa.unknown)}
                </dd>
              </div>
            ))}
            <div>
              <dt>{t.poa.report}</dt>
              <dd>
                {s.facts?.report === null
                  ? t.poa.unknown
                  : s.facts?.report
                    ? t.poa.shown
                    : t.poa.hidden}
              </dd>
            </div>
          </dl>
        </>
      ) : (
        <>
          <div className={local.fields}>
            {POA_FIELDS.map((k) => (
              <div className={styles.field} key={k}>
                <label htmlFor={prefix + k}>{new Map(Object.entries(labels)).get(k)}</label>
                {k === 'client_id' ? (
                  <select
                    id={prefix + k}
                    disabled={disabled}
                    value={
                      new Map(Object.entries(values)).get(k) === null
                        ? ''
                        : String(new Map(Object.entries(values)).get(k))
                    }
                    onChange={(e) =>
                      change(k, e.target.value === '' ? null : Number(e.target.value))
                    }
                  >
                    <option value="">{t.poa.unknown}</option>
                    {s.clients.map((c) => (
                      <option value={c.id} key={c.id} disabled={!c.active}>
                        {c.name}
                        {!c.active ? ' · ' + t.poa.archived : ''}
                      </option>
                    ))}
                  </select>
                ) : k === 'show_on_poa_report' ? (
                  <select
                    id={prefix + k}
                    disabled={disabled}
                    value={
                      new Map(Object.entries(values)).get(k) === null
                        ? ''
                        : String(new Map(Object.entries(values)).get(k))
                    }
                    onChange={(e) =>
                      change(k, e.target.value === '' ? null : e.target.value === 'true')
                    }
                  >
                    <option value="">{t.poa.unknown}</option>
                    <option value="true">{t.poa.shown}</option>
                    <option value="false">{t.poa.hidden}</option>
                  </select>
                ) : k === 'copies_count' ? (
                  <input
                    id={prefix + k}
                    disabled={disabled}
                    type="number"
                    min={0}
                    max={2147483647}
                    step={1}
                    value={
                      new Map(Object.entries(values)).get(k) === null
                        ? ''
                        : String(new Map(Object.entries(values)).get(k))
                    }
                    onChange={(e) =>
                      change(k, e.target.value === '' ? null : Number(e.target.value))
                    }
                  />
                ) : k === 'issue_date' ? (
                  <input
                    id={prefix + k}
                    disabled={disabled}
                    type="date"
                    min="0001-01-01"
                    max="9999-12-31"
                    value={String(new Map(Object.entries(values)).get(k) ?? '')}
                    onChange={(e) => change(k, e.target.value || null)}
                  />
                ) : (
                  <textarea
                    id={prefix + k}
                    disabled={disabled}
                    required={creating && k === 'principal_name'}
                    aria-describedby={
                      creating && k === 'principal_name' ? prefix + 'principal-help' : undefined
                    }
                    value={String(new Map(Object.entries(values)).get(k) ?? '')}
                    onChange={(e) => change(k, e.target.value || null)}
                    aria-invalid={result?.field === k || undefined}
                  />
                )}
                {creating && k === 'principal_name' ? (
                  <p id={prefix + 'principal-help'} className={styles.hint}>
                    {t.poa.principalHelp}
                  </p>
                ) : null}
                {k === 'copies_count' ? (
                  <p className={styles.hint}>{t.poa.copiesHelp}</p>
                ) : k === 'show_on_poa_report' ? (
                  <p className={styles.hint}>{t.poa.reportHelp}</p>
                ) : null}
              </div>
            ))}
          </div>
          <fieldset>
            <legend>{t.poa.currentLawyers}</legend>
            <p>{t.poa.noCurrentHint}</p>
            {!lawyers.length ? (
              <p>{t.poa.noCurrent}</p>
            ) : (
              <ul className={local.members}>
                {lawyers.map((id) => {
                  const p = s.people.find((p) => p.id === id)!;
                  return (
                    <li key={id}>
                      {p.name}
                      {!p.staff ? ' · ' + t.poa.external : ''}
                      {!p.active ? ' · ' + t.poa.inactive : ''}{' '}
                      <button
                        className={styles.link}
                        type="button"
                        disabled={disabled}
                        onClick={() => setLawyers((old) => old.filter((x) => x !== id))}
                        aria-label={t.poa.removeLawyer + ' — ' + p.name}
                      >
                        {t.poa.removeLawyer}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className={styles.field}>
              <label htmlFor={prefix + 'lawyers'}>{t.poa.selectLawyer}</label>
              <select
                id={prefix + 'lawyers'}
                value={selected}
                disabled={disabled}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">{t.poa.selectLawyer}</option>
                {s.people
                  .filter((p) => p.active && !lawyers.includes(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {!p.staff ? ' · ' + t.poa.external : ''}
                    </option>
                  ))}
              </select>
            </div>
            <button
              className={styles.link}
              type="button"
              disabled={disabled || !selected}
              onClick={() => {
                setLawyers((old) => [...old, Number(selected)]);
                setSelected('');
              }}
            >
              {t.poa.addLawyer}
            </button>
          </fieldset>
        </>
      )}
      <section className={local.source} aria-label={t.poa.source}>
        <h2>{t.poa.source}</h2>
        <dl className={local.fields}>
          <div>
            <dt>{t.poa.sourceClient}</dt>
            <dd className={local.value}>{s.record?.sourceClient ?? t.poa.noSource}</dd>
          </div>
          <div>
            <dt>{t.poa.sourceLawyers}</dt>
            <dd className={local.value}>{s.record?.sourceLawyers ?? t.poa.noSource}</dd>
          </div>
        </dl>
        <h3>{t.poa.originalLawyers}</h3>
        {s.lawyers.some((l) => l.original) ? (
          <ul>
            {s.lawyers
              .filter((l) => l.original)
              .map((l) => (
                <li key={l.personId}>
                  {s.people.find((p) => p.id === l.personId)?.name ?? t.poa.unknown}
                </li>
              ))}
          </ul>
        ) : (
          <p>{t.poa.noOriginal}</p>
        )}
      </section>
      {result ? (
        <div
          ref={feedback}
          tabIndex={-1}
          role={result.kind === 'error' ? 'alert' : 'status'}
          className={local.feedback}
        >
          <p>{result.message}</p>
          {!uncertain ? (
            <a className={styles.link} href={original.reload}>
              {t.poa.reload}
            </a>
          ) : null}
        </div>
      ) : null}
      <div className={styles.actions}>
        <button
          className={styles.button}
          type="submit"
          disabled={pending || result?.kind === 'success'}
        >
          {pending
            ? t.poa.pending
            : uncertain
              ? t.poa.retry
              : lifecycle
                ? t.poa.confirm
                : t.poa.save}
        </button>
        <a className={styles.link} href={original.cancel}>
          {t.poa.cancel}
        </a>
      </div>
    </form>
  );
}
