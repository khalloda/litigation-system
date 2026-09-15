'use client';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import type { AdminLifecycleSnapshot, AdminLifecycleOperation } from '@/lib/admin-lifecycle';
import type { AdminActionResult } from './actions';
import {
  archiveAdminTaskAction,
  restoreAdminTaskAction,
  archiveAdminStepAction,
  restoreAdminStepAction,
} from './lifecycle-actions';
import { t } from '@/strings';
import styles from '../staff/staff.module.css';
import local from '../clients/clients.module.css';
export function AdminLifecycle({
  snapshot,
  action,
  submission,
  detail,
  reload,
}: {
  snapshot: AdminLifecycleSnapshot;
  action: AdminLifecycleOperation;
  submission: string;
  detail: string;
  reload: string;
}) {
  const [result, setResult] = useState<AdminActionResult | null>(null),
    [pending, startTransition] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    feedback = useRef<HTMLDivElement>(null),
    cancel = useRef<HTMLButtonElement>(null);
  const id = useId(),
    title =
      action === 'task-archive'
        ? t.adminWorks.lifecycle.archive
        : action === 'task-restore'
          ? t.adminWorks.lifecycle.restore
          : action === 'step-archive'
            ? t.adminWorks.lifecycle.archiveStep
            : t.adminWorks.lifecycle.restoreStep;
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
        const input = {
          task_id: snapshot.id,
          step_id: snapshot.stepId,
          confirmation: snapshot.stepId ?? snapshot.id,
          version: snapshot.version,
          submission,
          operation: action,
          facts: snapshot.facts,
        };
        if (action === 'task-archive') setResult(await archiveAdminTaskAction(input));
        else if (action === 'task-restore') setResult(await restoreAdminTaskAction(input));
        else if (action === 'step-archive') setResult(await archiveAdminStepAction(input));
        else setResult(await restoreAdminStepAction(input));
      } catch {
        setResult({
          kind: 'error',
          field: '',
          code: 'generic',
          message: t.adminWorks.manage.errors.generic,
        });
      }
    });
  };
  const counts = (
    <dl className={styles.facts}>
      {[
        [
          t.adminWorks.lifecycle.totalSteps,
          snapshot.facts.currentSteps + snapshot.facts.archivedSteps,
        ],
        [t.adminWorks.lifecycle.currentSteps, snapshot.facts.currentSteps],
        [t.adminWorks.lifecycle.archivedSteps, snapshot.facts.archivedSteps],
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
          {snapshot.facts.requiredWork}
        </p>
        {snapshot.stepId !== null ? (
          <>
            <p>{t.adminWorks.stepIdentity(snapshot.stepId)}</p>
            <p className={local.multiline} dir="auto">
              {snapshot.facts.result}
            </p>
            <p className={local.multiline} dir="auto">
              {snapshot.facts.report}
            </p>
          </>
        ) : null}
        <p className={local.multiline} dir="auto">
          {snapshot.stepId === null ? snapshot.facts.taskCreatedDate : snapshot.facts.actionDate}
        </p>
        <p>
          {t.clients.systemId}: {snapshot.id}
        </p>
        <p>{t.adminWorks.lifecycle.help}</p>
        {snapshot.facts.taskArchived && snapshot.stepId !== null ? (
          <p role="status">{t.adminWorks.lifecycle.parentArchived}</p>
        ) : null}
        {snapshot.facts.matterArchived ? (
          <p role="status">{t.adminWorks.manage.parentArchived}</p>
        ) : null}
        {counts}
        <p>{t.adminWorks.lifecycle.countNote}</p>
        {pending ? <p role="status">{t.adminWorks.lifecycle.pending}</p> : null}
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
                {t.adminWorks.lifecycle.reload}
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
              (snapshot.facts.taskArchived && snapshot.stepId !== null) ||
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
          {snapshot.facts.requiredWork}
        </p>
        {snapshot.stepId !== null ? (
          <>
            <p>{t.adminWorks.stepIdentity(snapshot.stepId)}</p>
            <p className={local.multiline} dir="auto">
              {snapshot.facts.result}
            </p>
            <p className={local.multiline} dir="auto">
              {snapshot.facts.report}
            </p>
          </>
        ) : null}
        <p className={local.multiline} dir="auto">
          {snapshot.stepId === null ? snapshot.facts.taskCreatedDate : snapshot.facts.actionDate}
        </p>
        <p id={`${id}-help`}>{t.adminWorks.lifecycle.help}</p>
        {counts}
        <p>{t.adminWorks.lifecycle.countNote}</p>
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
