'use client';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import type { MatterLifecycleSnapshot, MatterLifecycleAction } from '@/lib/matter-lifecycle';
import type { MatterActionResult } from './actions';
import { archiveMatterAction, restoreMatterAction } from './lifecycle-actions';
import { t } from '@/strings';
import styles from '../staff/staff.module.css';
import local from '../clients/clients.module.css';
export function MatterLifecycle({
  snapshot,
  action,
  submission,
  detail,
  reload,
}: {
  snapshot: MatterLifecycleSnapshot;
  action: MatterLifecycleAction;
  submission: string;
  detail: string;
  reload: string;
}) {
  const [result, setResult] = useState<MatterActionResult | null>(null),
    [pending, startTransition] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    feedback = useRef<HTMLDivElement>(null),
    cancel = useRef<HTMLButtonElement>(null);
  const id = useId(),
    title = action === 'archive' ? t.matters.lifecycle.archive : t.matters.lifecycle.restore;
  const close = () => {
    dialog.current?.close();
    trigger.current?.focus();
  };
  useEffect(() => {
    if (result) feedback.current?.focus();
  }, [result]);
  const save = () => {
    if (pending || result?.kind === 'success') return;
    close();
    startTransition(async () => {
      try {
        setResult(
          await (action === 'archive' ? archiveMatterAction : restoreMatterAction)({
            id: snapshot.id,
            confirmation: snapshot.id,
            version: snapshot.version,
            submission,
            action,
            counts: snapshot.counts,
          }),
        );
      } catch {
        setResult({
          kind: 'error',
          field: '',
          code: 'generic',
          message: t.matters.manage.errors.generic,
        });
      }
    });
  };
  const counts = (
    <dl className={styles.facts}>
      {[
        [t.matters.lifecycle.counts.hearings, snapshot.counts.hearings],
        [t.matters.lifecycle.counts.tasks, snapshot.counts.tasks],
        [t.matters.lifecycle.counts.steps, snapshot.counts.steps],
        [t.matters.lifecycle.counts.documents, snapshot.counts.documents],
        [t.matters.lifecycle.counts.feeLetters, snapshot.counts.feeLetters],
        [t.matters.lifecycle.counts.parties, snapshot.counts.parties],
        [t.matters.lifecycle.counts.capacities, snapshot.counts.capacities],
        [t.matters.lifecycle.counts.lawyers, snapshot.counts.lawyers],
      ].map(([label, count]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{count}</dd>
        </div>
      ))}
    </dl>
  );
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>{title}</h1>
        <Link className={styles.link} href={detail}>
          {t.clients.manage.backRecord}
        </Link>
      </header>
      <section className={styles.panel}>
        <h2 className={local.multiline} dir="auto">
          {snapshot.caseNumber?.trim() ? snapshot.caseNumber : t.common.notRecorded}
        </h2>
        <p className={local.multiline} dir="auto">
          {snapshot.subject}
        </p>
        <p>
          {t.clients.systemId}: {snapshot.id}
        </p>
        <p>{t.matters.lifecycle.help}</p>
        {counts}
        <p>{t.matters.lifecycle.countNote}</p>
        {pending ? <p role="status">{t.matters.manage.pending}</p> : null}
        {result ? (
          <div
            ref={feedback}
            tabIndex={-1}
            className={styles.focusTarget}
            role={result.kind === 'error' ? 'alert' : 'status'}
          >
            <p>{result.message}</p>
            {result.kind === 'success' ? (
              <Link className={styles.link} href={detail}>
                {t.clients.manage.backRecord}
              </Link>
            ) : (
              <a className={styles.link} href={reload}>
                {t.matters.lifecycle.reload}
              </a>
            )}
          </div>
        ) : null}
        <div className={styles.actions}>
          <button
            ref={trigger}
            type="button"
            className={styles.button}
            disabled={pending || result?.kind === 'success' || result?.code === 'stale'}
            onClick={() => {
              dialog.current?.showModal();
              cancel.current?.focus();
            }}
          >
            {title}
          </button>
          <Link className={styles.link} href={detail}>
            {t.common.cancel}
          </Link>
        </div>
      </section>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-help`}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        <h2 id={`${id}-title`}>{t.clients.manage.confirmation}</h2>
        <p>{title}</p>
        <p className={local.multiline} dir="auto">
          {snapshot.caseNumber?.trim() ? snapshot.caseNumber : t.common.notRecorded} ({snapshot.id})
        </p>
        <p className={local.multiline} dir="auto">
          {snapshot.subject}
        </p>
        <p id={`${id}-help`}>{t.matters.lifecycle.help}</p>
        {counts}
        <p>{t.matters.lifecycle.countNote}</p>
        <div className={styles.actions}>
          <button ref={cancel} type="button" className={styles.link} onClick={close}>
            {t.common.cancel}
          </button>
          <button type="button" className={styles.button} onClick={save}>
            {t.clients.manage.confirm}
          </button>
        </div>
      </dialog>
    </main>
  );
}
