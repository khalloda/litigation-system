'use client';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { DocumentSnapshot } from '@/lib/document-mutations';
import {
  DOCUMENT_FIELDS,
  type DocumentOperation,
  type DocumentValues,
} from '@/lib/document-mutation-input';
import {
  createDocumentAction,
  updateDocumentAction,
  archiveDocumentAction,
  restoreDocumentAction,
  type DocumentActionResult,
} from './actions';
import { t } from '@/strings';
import styles from '../staff/staff.module.css';
import local from '../powers-of-attorney/poa.module.css';
const labels: Record<string, string> = {
  matter_id: t.documentsModule.currentMatter,
  client_id: t.documentsModule.currentClient,
  responsible_person_id: t.documentsModule.responsible,
  description: t.documentsModule.description,
  document_date: t.documentsModule.documentDate,
  page_count: t.documentsModule.pageCount,
  deposit_date: t.documentsModule.depositDate,
  movement_card: t.documentsModule.movementCard,
  storage_location: t.documentsModule.storageLocation,
  notes: t.fields.notes,
  mfiles_id: t.documentsModule.mfilesId,
};
export function DocumentEditor({
  snapshot: s,
  operation,
  submission,
  cancel,
  reload,
  query,
}: {
  snapshot: DocumentSnapshot;
  operation: DocumentOperation;
  submission: string;
  cancel: string;
  reload: string;
  query: string;
}) {
  const router = useRouter();
  const lifecycle = operation === 'archive' || operation === 'restore',
    creating = operation === 'create',
    prefix = useId();
  const [values, setValues] = useState<DocumentValues>(() =>
    structuredClone(s.record?.values ?? Object.fromEntries(DOCUMENT_FIELDS.map((k) => [k, null]))),
  );
  const [related, setRelated] = useState(() =>
    structuredClone(s.record?.related ?? { matterIds: [], responsiblePersonIds: [] }),
  );
  const [result, setResult] = useState<DocumentActionResult | null>(null),
    [pending, start] = useTransition();
  const feedback = useRef<HTMLDivElement>(null),
    heading = useRef<HTMLHeadingElement>(null),
    pageCountInput = useRef<HTMLInputElement>(null),
    documentDateInput = useRef<HTMLInputElement>(null),
    depositDateInput = useRef<HTMLInputElement>(null),
    last = useRef<string | null>(null);
  const uncertain = result?.code === 'generic',
    disabled = pending || uncertain || result?.kind === 'success';
  useEffect(() => {
    if (result?.kind === 'success' && result.id) router.push('/documents/' + result.id + query);
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
  const change = (key: string, value: string | number | null) =>
    setValues((old) => ({ ...old, [key]: value }));
  function submit() {
    if (disabled && !uncertain) return;
    let payload = last.current;
    if (!uncertain) {
      if (!lifecycle) {
        for (const [field, input] of [
          ['page_count', pageCountInput.current],
          ['document_date', documentDateInput.current],
          ['deposit_date', depositDateInput.current],
        ] as const) {
          if (input && !input.validity.valid) {
            setResult({
              kind: 'error',
              code: 'invalid',
              field,
              message:
                new Map(Object.entries(labels)).get(field) +
                ' — ' +
                t.documentsModule.errors.invalid,
            });
            return;
          }
        }
      }
      const original = s.record?.values ?? {};
      const patch = lifecycle
        ? {}
        : Object.fromEntries(
            Object.entries(values).filter(
              ([k, v]) =>
                !['matter_id', 'responsible_person_id'].includes(k) &&
                (creating || v !== new Map(Object.entries(original)).get(k)),
            ),
          );
      payload = JSON.stringify({
        operation,
        id: s.record?.id ?? null,
        version: s.record?.version ?? null,
        submission,
        values: patch,
        related: lifecycle ? null : related,
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
            ? createDocumentAction(form)
            : operation === 'update'
              ? updateDocumentAction(form)
              : operation === 'archive'
                ? archiveDocumentAction(form)
                : restoreDocumentAction(form)),
        );
      } catch {
        setResult({ kind: 'error', code: 'generic', message: t.documentsModule.errors.generic });
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
          {t.documentsModule.confirmTitle}
        </h2>
        <p>{t.documentsModule.lifecycleHelp}</p>
        <p className={local.value}>
          {String(s.record?.facts.description ?? t.documentsModule.unknown)}
        </p>
        <Feedback result={result} reload={reload} refValue={feedback} />
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
        {(['matterIds', 'responsiblePersonIds'] as const).map((key) => (
          <RelatedChoices
            key={key}
            label={
              key === 'matterIds' ? t.documentsModule.currentMatter : t.documentsModule.responsible
            }
            selected={key === 'matterIds' ? related.matterIds : related.responsiblePersonIds}
            original={
              (key === 'matterIds'
                ? s.record?.related.matterIds
                : s.record?.related.responsiblePersonIds) ?? []
            }
            disabled={disabled}
            options={
              key === 'matterIds'
                ? s.matters
                : s.people.map((p) => ({ ...p, active: p.active && p.staff }))
            }
            change={(ids) => setRelated((old) => ({ ...old, [key]: ids }))}
          />
        ))}
        {DOCUMENT_FIELDS.filter(
          (key) => key !== 'matter_id' && key !== 'responsible_person_id',
        ).map((key) => (
          <div className={styles.field} key={key}>
            <label htmlFor={prefix + key}>{new Map(Object.entries(labels)).get(key)}</label>
            {key === 'client_id' ? (
              <select
                id={prefix + key}
                disabled={disabled}
                value={String(values.client_id ?? '')}
                onChange={(e) => change(key, e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">{t.documentsModule.unknown}</option>
                {s.clients.map((o) => (
                  <option key={o.id} value={o.id} disabled={!o.active && o.id !== values.client_id}>
                    {o.name}
                  </option>
                ))}
              </select>
            ) : key === 'page_count' ? (
              <input
                ref={pageCountInput}
                id={prefix + key}
                type="number"
                min={0}
                max={2147483647}
                step={1}
                disabled={disabled}
                defaultValue={String(s.record?.values.page_count ?? '')}
                aria-invalid={result?.field === key || undefined}
                onChange={(e) => {
                  if (e.target.validity.valid)
                    change(key, e.target.value === '' ? null : Number(e.target.value));
                }}
              />
            ) : key === 'document_date' || key === 'deposit_date' ? (
              <input
                ref={key === 'document_date' ? documentDateInput : depositDateInput}
                id={prefix + key}
                type="date"
                min="0001-01-01"
                max="9999-12-31"
                disabled={disabled}
                defaultValue={String(
                  new Map(Object.entries(s.record?.values ?? {})).get(key) ?? '',
                )}
                aria-invalid={result?.field === key || undefined}
                onChange={(e) => {
                  if (e.target.validity.valid) change(key, e.target.value || null);
                }}
              />
            ) : (
              <textarea
                id={prefix + key}
                required={creating && key === 'description'}
                aria-describedby={
                  creating && key === 'description' ? prefix + 'description-help' : undefined
                }
                aria-invalid={result?.field === key || undefined}
                disabled={disabled}
                value={String(new Map(Object.entries(values)).get(key) ?? '')}
                onChange={(e) => change(key, e.target.value === '' ? null : e.target.value)}
              />
            )}{' '}
            {creating && key === 'description' ? (
              <p id={prefix + 'description-help'} className={styles.hint}>
                {t.documentsModule.createHelp}
              </p>
            ) : null}
          </div>
        ))}
      </div>
      <Feedback result={result} reload={reload} refValue={feedback} />
      <Actions pending={pending} uncertain={uncertain} cancel={cancel} />
    </form>
  );
}
function Feedback({
  result,
  reload,
  refValue,
}: {
  result: DocumentActionResult | null;
  reload: string;
  refValue: React.RefObject<HTMLDivElement | null>;
}) {
  return result ? (
    <div
      ref={refValue}
      tabIndex={-1}
      role={result.kind === 'error' ? 'alert' : 'status'}
      className={local.feedback}
    >
      <p>{result.message}</p>
      {result.code !== 'generic' ? (
        <a className={styles.link} href={reload}>
          {t.documentsModule.reload}
        </a>
      ) : null}
    </div>
  ) : null;
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
          ? t.documentsModule.pending
          : uncertain
            ? t.documentsModule.retry
            : t.documentsModule.save}
      </button>
      <a className={styles.link} href={cancel}>
        {t.documentsModule.cancel}
      </a>
    </div>
  );
}

function RelatedChoices({
  label,
  selected,
  original,
  options,
  disabled,
  change,
}: {
  label: string;
  selected: number[];
  original: number[];
  options: { id: number; name: string | null; active: boolean }[];
  disabled: boolean;
  change: (ids: number[]) => void;
}) {
  const id = useId(),
    names = new Map(options.map((o) => [o.id, o]));
  const move = (index: number, offset: number) => {
    const ids = [...selected];
    const current = ids.at(index)!;
    ids.splice(index, 1, ids.at(index + offset)!);
    ids.splice(index + offset, 1, current);
    change(ids);
  };
  return (
    <fieldset className={styles.field} disabled={disabled}>
      <legend>{label}</legend>
      <ol>
        {selected.map((value, index) => (
          <li key={value}>
            <span className={local.value}>{names.get(value)?.name ?? String(value)}</span>
            <button type="button" onClick={() => change(selected.filter((x) => x !== value))}>
              {t.matters.manage.remove}
            </button>
            <button
              type="button"
              disabled={disabled || index === 0}
              onClick={() => move(index, -1)}
            >
              {t.matters.manage.up}
            </button>
            <button
              type="button"
              disabled={disabled || index === selected.length - 1}
              onClick={() => move(index, 1)}
            >
              {t.matters.manage.down}
            </button>
          </li>
        ))}
      </ol>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value=""
        onChange={(e) => {
          if (e.target.value) change([...selected, Number(e.target.value)]);
        }}
      >
        <option value="">{t.documentsModule.unknown}</option>
        {options
          .filter((o) => !selected.includes(o.id) && (o.active || original.includes(o.id)))
          .map((o) => (
            <option key={o.id} value={o.id}>
              {o.name ?? String(o.id)}
            </option>
          ))}
      </select>
    </fieldset>
  );
}
