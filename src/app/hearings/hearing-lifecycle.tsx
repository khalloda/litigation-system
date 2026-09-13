'use client';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import type { HearingLifecycleSnapshot, HearingLifecycleAction } from '@/lib/hearing-lifecycle';
import type { HearingActionResult } from './actions';
import { archiveHearingAction, restoreHearingAction } from './lifecycle-actions';
import { t } from '@/strings';
import styles from '../staff/staff.module.css';
import local from '../clients/clients.module.css';
export function HearingLifecycle({
  snapshot,
  action,
  submission,
  detail,
  reload,
}: {
  snapshot: HearingLifecycleSnapshot;
  action: HearingLifecycleAction;
  submission: string;
  detail: string;
  reload: string;
}) {
  const [result, setResult] = useState<HearingActionResult | null>(null),
    [pending, startTransition] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    feedback = useRef<HTMLDivElement>(null),
    cancel = useRef<HTMLButtonElement>(null);
  const id = useId(),
    title = action === 'archive' ? t.hearings.lifecycle.archive : t.hearings.lifecycle.restore;
  const close = () => {
    dialog.current?.close();
    trigger.current?.focus();
  };
  useEffect(() => {
    if (result?.kind === 'success') window.location.assign(detail);
    else if (result) feedback.current?.focus();
  }, [result, detail]);
  const save = () => {
    if (pending || result?.kind === 'success') return;
    close();
    startTransition(async () => {
      try {
        setResult(
          await (action === 'archive' ? archiveHearingAction : restoreHearingAction)({
            id: snapshot.id,
            confirmation: snapshot.id,
            version: snapshot.version,
            submission,
            action,
            facts: snapshot.facts,
          }),
        );
      } catch {
        setResult({
          kind: 'error',
          field: '',
          code: 'generic',
          message: t.hearings.manage.errors.generic,
        });
      }
    });
  };
  const counts = (
    <dl className={styles.facts}>
      {[
        [t.hearings.lifecycle.currentAttendees, snapshot.facts.currentAttendees],
        [t.hearings.lifecycle.retiredAttendees, snapshot.facts.retiredAttendees],
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
          {snapshot.facts.caseNumber?.trim() ? snapshot.facts.caseNumber : t.common.notRecorded}
        </h2>
        <p className={local.multiline} dir="auto">
          {snapshot.facts.hearingDate}
        </p>
        <p>
          {t.clients.systemId}: {snapshot.id}
        </p>
        <p>{t.hearings.lifecycle.help}</p>
        {snapshot.facts.matterArchived ? (
          <p role="status">{t.hearings.manage.parentArchived}</p>
        ) : null}
        {counts}
        <p>{t.hearings.lifecycle.countNote}</p>
        {pending ? <p role="status">{t.hearings.lifecycle.pending}</p> : null}
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
                {t.hearings.lifecycle.reload}
              </a>
            )}
          </div>
        ) : null}
        <div className={styles.actions}>
          <button
            ref={trigger}
            type="button"
            className={styles.button}
            disabled={
              snapshot.facts.matterArchived ||
              pending ||
              result?.kind === 'success' ||
              result?.code === 'stale'
            }
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
          {snapshot.facts.caseNumber?.trim() ? snapshot.facts.caseNumber : t.common.notRecorded} (
          {snapshot.id})
        </p>
        <p className={local.multiline} dir="auto">
          {snapshot.facts.hearingDate}
        </p>
        <p id={`${id}-help`}>{t.hearings.lifecycle.help}</p>
        {counts}
        <p>{t.hearings.lifecycle.countNote}</p>
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
