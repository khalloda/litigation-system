'use client';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { FeeLetterSnapshot, MatterFeeReferenceSnapshot } from '@/lib/fee-letter-mutations';
import {
  FEE_LETTER_FIELDS,
  type FeeLetterOperation,
  type FeeLetterValues,
  type MatterFeeReferenceOperation,
} from '@/lib/fee-letter-mutation-input';
import {
  createFeeLetterAction,
  updateFeeLetterAction,
  archiveFeeLetterAction,
  restoreFeeLetterAction,
  addCoveredMatterAction,
  retireCoveredMatterAction,
  restoreCoveredMatterAction,
  setMatterFeeReferenceAction,
  clearMatterFeeReferenceAction,
  replaceMatterFeeReferenceAction,
  type FeeLetterActionResult,
} from './actions';
import { t } from '@/strings';
import styles from '../staff/staff.module.css';
import local from '../powers-of-attorney/poa.module.css';
const labels: Record<string, string> = {
  client_id: t.feeLettersModule.client,
  mfiles_id: t.feeLettersModule.mfilesId,
  contract_type: t.feeLettersModule.type,
  contract_date: t.feeLettersModule.date,
  contract_details: t.feeLettersModule.detailsField,
  contract_structure: t.feeLettersModule.structure,
};
function Feedback({
  result,
  reload,
  feedback,
}: {
  result: FeeLetterActionResult | null;
  reload: string;
  feedback: React.RefObject<HTMLDivElement | null>;
}) {
  return result ? (
    <div
      ref={feedback}
      tabIndex={-1}
      role={result.kind === 'error' ? 'alert' : 'status'}
      className={local.feedback}
    >
      <p>{result.message}</p>
      {result.code !== 'generic' ? (
        <a className={styles.link} href={reload}>
          {t.feeLettersModule.reload}
        </a>
      ) : null}
    </div>
  ) : null;
}
export function FeeLetterEditor({
  snapshot: s,
  operation,
  submission,
  cancel,
  reload,
  query,
}: {
  snapshot: FeeLetterSnapshot;
  operation: FeeLetterOperation;
  submission: string;
  cancel: string;
  reload: string;
  query: string;
}) {
  const router = useRouter();
  const lifecycle = operation === 'archive' || operation === 'restore',
    creating = operation === 'create',
    prefix = useId();
  const [values, setValues] = useState<FeeLetterValues>(() =>
    structuredClone(
      s.record?.values ?? Object.fromEntries(FEE_LETTER_FIELDS.map((k) => [k, null])),
    ),
  );
  const [result, setResult] = useState<FeeLetterActionResult | null>(null),
    [pending, start] = useTransition();
  const feedback = useRef<HTMLDivElement>(null),
    heading = useRef<HTMLHeadingElement>(null),
    contractDateInput = useRef<HTMLInputElement>(null),
    last = useRef<string | null>(null),
    uncertain = result?.code === 'generic',
    disabled = pending || uncertain || result?.kind === 'success';
  useEffect(() => {
    if (result?.kind === 'success' && result.id) router.push('/fee-letters/' + result.id + query);
    else if (result) feedback.current?.focus();
  }, [result, query, router]);
  useEffect(() => {
    if (lifecycle) heading.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) {
        event.preventDefault();
        router.push(cancel);
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [cancel, lifecycle, pending, router]);
  function submit() {
    if (disabled && !uncertain) return;
    let payload = last.current;
    if (!uncertain) {
      if (!lifecycle && contractDateInput.current && !contractDateInput.current.validity.valid) {
        setResult({
          kind: 'error',
          code: 'invalid',
          field: 'contract_date',
          message: labels.contract_date + ' — ' + t.feeLettersModule.errors.invalid,
        });
        return;
      }
      const original = s.record?.values ?? {};
      const patch = lifecycle
        ? {}
        : Object.fromEntries(
            Object.entries(values).filter(
              ([k, v]) => creating || v !== new Map(Object.entries(original)).get(k),
            ),
          );
      payload = JSON.stringify({
        operation,
        id: s.record?.id ?? null,
        version: s.record?.version ?? null,
        submission,
        values: patch,
        related: null,
        facts: lifecycle ? s.record?.facts : null,
      });
      last.current = payload;
    }
    if (!payload) return;
    const form = new FormData();
    form.set('payload', payload);
    start(async () => {
      try {
        setResult(
          await (operation === 'create'
            ? createFeeLetterAction(form)
            : operation === 'update'
              ? updateFeeLetterAction(form)
              : operation === 'archive'
                ? archiveFeeLetterAction(form)
                : restoreFeeLetterAction(form)),
        );
      } catch {
        setResult({ kind: 'error', code: 'generic', message: t.feeLettersModule.errors.generic });
      }
    });
  }
  if (lifecycle)
    return (
      <form
        className={local.editor}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h2 ref={heading} tabIndex={-1}>
          {t.feeLettersModule.confirmTitle}
        </h2>
        <p>{t.feeLettersModule.lifecycleHelp}</p>
        <Feedback result={result} reload={reload} feedback={feedback} />
        <Actions pending={pending} uncertain={uncertain} cancel={cancel} />
      </form>
    );
  return (
    <form
      noValidate
      className={local.editor}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className={local.fields}>
        {FEE_LETTER_FIELDS.map((key) => (
          <div className={styles.field} key={key}>
            <label htmlFor={prefix + key}>{new Map(Object.entries(labels)).get(key)}</label>
            {key === 'client_id' ? (
              <select
                id={prefix + key}
                required={creating}
                aria-describedby={creating ? prefix + 'client-help' : undefined}
                aria-invalid={result?.field === key || undefined}
                disabled={disabled}
                value={String(new Map(Object.entries(values)).get(key) ?? '')}
                onChange={(e) =>
                  setValues((v) => ({
                    ...v,
                    [key]: e.target.value ? Number(e.target.value) : null,
                  }))
                }
              >
                <option value="">{t.feeLettersModule.unknown}</option>
                {s.clients.map((o) => (
                  <option
                    key={o.id}
                    value={o.id}
                    disabled={!o.active && o.id !== new Map(Object.entries(values)).get(key)}
                  >
                    {o.name}
                  </option>
                ))}
              </select>
            ) : key === 'contract_date' ? (
              <input
                ref={contractDateInput}
                id={prefix + key}
                type="date"
                min="0001-01-01"
                max="9999-12-31"
                disabled={disabled}
                defaultValue={String(s.record?.values.contract_date ?? '')}
                aria-invalid={result?.field === key || undefined}
                onChange={(e) => {
                  if (e.target.validity.valid)
                    setValues((v) => ({ ...v, [key]: e.target.value || null }));
                }}
              />
            ) : (
              <textarea
                id={prefix + key}
                disabled={disabled}
                value={String(new Map(Object.entries(values)).get(key) ?? '')}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [key]: e.target.value === '' ? null : e.target.value }))
                }
              />
            )}
            {creating && key === 'client_id' ? (
              <p id={prefix + 'client-help'} className={styles.hint}>
                {t.feeLettersModule.createHelp}
              </p>
            ) : null}
          </div>
        ))}
      </div>
      <Feedback result={result} reload={reload} feedback={feedback} />
      <Actions pending={pending} uncertain={uncertain} cancel={cancel} />
    </form>
  );
}
function Actions({
  pending,
  uncertain,
  cancel,
}: {
  pending: boolean;
  uncertain: boolean;
  cancel: string;
}) {
  return (
    <div className={styles.actions}>
      <button className={styles.button} type="submit" disabled={pending}>
        {pending
          ? t.feeLettersModule.pending
          : uncertain
            ? t.feeLettersModule.retry
            : t.feeLettersModule.save}
      </button>
      <a className={styles.link} href={cancel}>
        {t.feeLettersModule.cancel}
      </a>
    </div>
  );
}
export function CoveredMatterEditor({
  snapshot: s,
  reload,
}: {
  snapshot: FeeLetterSnapshot;
  reload: string;
}) {
  const record = s.record!,
    [matter, setMatter] = useState(''),
    [result, setResult] = useState<FeeLetterActionResult | null>(null),
    [pending, start] = useTransition();
  const feedback = useRef<HTMLDivElement>(null),
    frozen = useRef<{ operation: FeeLetterOperation; payload: string } | null>(null),
    uncertain = result?.code === 'generic',
    disabled = pending || uncertain;
  const current = record.covered.filter((x) => !x.retired).map((x) => x.matterId);
  useEffect(() => {
    if (result) feedback.current?.focus();
  }, [result]);
  function send(
    operation?: FeeLetterOperation,
    membershipId?: number | null,
    matterId?: number | null,
  ) {
    const retry = frozen.current;
    if (uncertain && !retry) return;
    const exact = retry ?? {
      operation: operation!,
      payload: JSON.stringify({
        operation,
        id: record.id,
        version: record.version,
        submission: crypto.randomUUID(),
        values: {},
        related: { membershipId, matterId },
        facts: null,
      }),
    };
    frozen.current = exact;
    const form = new FormData();
    form.set('payload', exact.payload);
    start(async () => {
      try {
        const r = await (exact.operation === 'covered-add'
          ? addCoveredMatterAction(form)
          : exact.operation === 'covered-retire'
            ? retireCoveredMatterAction(form)
            : restoreCoveredMatterAction(form));
        setResult(r);
        if (r.kind === 'success') window.location.reload();
        else if (r.code !== 'generic') frozen.current = null;
      } catch {
        setResult({ kind: 'error', code: 'generic', message: t.feeLettersModule.errors.generic });
      }
    });
  }
  return (
    <section className={local.source}>
      <h2>{t.feeLettersModule.covered}</h2>
      <p>{t.feeLettersModule.relationshipHelp}</p>
      <ul className={local.members}>
        {record.covered.map((x) => (
          <li key={x.id}>
            {s.matters.find((m) => m.id === x.matterId)?.name ?? x.matterId} ·{' '}
            {x.retired ? t.feeLettersModule.retired : t.feeLettersModule.current}
            {x.original ? ' · ' + t.feeLettersModule.original : ''}{' '}
            <button
              className={styles.link}
              type="button"
              disabled={disabled}
              onClick={() => send(x.retired ? 'covered-restore' : 'covered-retire', x.id, null)}
            >
              {x.retired ? t.feeLettersModule.restoreCovered : t.feeLettersModule.retireCovered}
            </button>
          </li>
        ))}
      </ul>
      <div className={styles.field}>
        <label htmlFor="covered-matter">{t.feeLettersModule.chooseMatter}</label>
        <select
          id="covered-matter"
          value={matter}
          onChange={(e) => setMatter(e.target.value)}
          disabled={disabled}
        >
          <option value="">{t.feeLettersModule.chooseMatter}</option>
          {s.matters
            .filter((m) => m.active && !current.includes(m.id))
            .map((m) => (
              <option value={m.id} key={m.id}>
                {m.name ?? m.id}
              </option>
            ))}
        </select>
      </div>
      <button
        className={styles.button}
        type="button"
        disabled={disabled || !matter}
        onClick={() => send('covered-add', null, Number(matter))}
      >
        {t.feeLettersModule.addCovered}
      </button>
      <Feedback result={result} reload={reload} feedback={feedback} />
      {uncertain ? (
        <button className={styles.button} type="button" disabled={pending} onClick={() => send()}>
          {pending ? t.feeLettersModule.pending : t.feeLettersModule.retry}
        </button>
      ) : null}
    </section>
  );
}
export function MatterFeeReferenceEditor({
  snapshot: s,
  cancel,
}: {
  snapshot: MatterFeeReferenceSnapshot;
  cancel: string;
}) {
  const current = s.references.find((r) => !r.is_retired)?.fee_letter_id ?? null,
    [selected, setSelected] = useState(current ? String(current) : ''),
    [result, setResult] = useState<FeeLetterActionResult | null>(null),
    [pending, start] = useTransition();
  const feedback = useRef<HTMLDivElement>(null),
    frozen = useRef<{ operation: MatterFeeReferenceOperation; payload: string } | null>(null),
    uncertain = result?.code === 'generic',
    currentName = s.feeLetters.find((f) => f.id === current),
    selectedName = s.feeLetters.find((f) => f.id === Number(selected));
  useEffect(() => {
    if (result) feedback.current?.focus();
  }, [result]);
  function submit() {
    const next = selected ? Number(selected) : null;
    const exact =
      frozen.current ??
      (() => {
        const operation: MatterFeeReferenceOperation =
          current === null ? 'set' : next === null ? 'clear' : 'replace';
        return {
          operation,
          payload: JSON.stringify({
            operation,
            id: s.matterId,
            version: s.version,
            submission: crypto.randomUUID(),
            values: {},
            related: { oldFeeLetterId: current, newFeeLetterId: next },
            facts: null,
          }),
        };
      })();
    frozen.current = exact;
    const form = new FormData();
    form.set('payload', exact.payload);
    start(async () => {
      try {
        const r = await (exact.operation === 'set'
          ? setMatterFeeReferenceAction(form)
          : exact.operation === 'clear'
            ? clearMatterFeeReferenceAction(form)
            : replaceMatterFeeReferenceAction(form));
        setResult(r);
        if (r.kind === 'success') window.location.assign(cancel);
        else if (r.code !== 'generic') frozen.current = null;
      } catch {
        setResult({ kind: 'error', code: 'generic', message: t.feeLettersModule.errors.generic });
      }
    });
  }
  return (
    <form
      className={local.editor}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h2>{t.feeLettersModule.matterReferenceTitle}</h2>
      <p>{t.feeLettersModule.relationshipHelp}</p>
      <div className={styles.field}>
        <label htmlFor="matter-fee-letter">{t.feeLettersModule.chooseFeeLetter}</label>
        <select
          id="matter-fee-letter"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={pending || uncertain}
        >
          <option value="">{t.feeLettersModule.unknown}</option>
          {s.feeLetters.map((f) => (
            <option key={f.id} value={f.id} disabled={!f.active && f.id !== current}>
              {f.contractId ?? f.id} · {f.clientName ?? t.feeLettersModule.unknown}
            </option>
          ))}
        </select>
      </div>
      <dl className={local.fields}>
        <ValueName label={t.feeLettersModule.referenceFrom} value={feeName(currentName)} />
        <ValueName label={t.feeLettersModule.referenceTo} value={feeName(selectedName)} />
      </dl>
      <Feedback result={result} reload={cancel} feedback={feedback} />
      <Actions
        pending={pending || selected === String(current ?? '')}
        uncertain={uncertain}
        cancel={cancel}
      />
    </form>
  );
}

function feeName(value: MatterFeeReferenceSnapshot['feeLetters'][number] | undefined) {
  return value
    ? `${value.contractId ?? value.id} · ${value.clientName ?? t.feeLettersModule.unknown}`
    : t.feeLettersModule.unknown;
}

function ValueName({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
