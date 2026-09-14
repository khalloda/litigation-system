'use client';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ADMIN_TASK_FIELDS,
  ADMIN_STEP_FIELDS,
  type AdminValues,
  type AdminOperation,
} from '@/lib/admin-work-mutation-input';
import type { AdminMutationSnapshot } from '@/lib/admin-work-mutations';
import {
  createAdminTaskAction,
  updateAdminTaskAction,
  createAdminStepAction,
  updateAdminStepAction,
  type AdminActionResult,
} from './actions';
import { t } from '@/strings';
import styles from '../staff/staff.module.css';
import local from '../hearings/hearing-editor.module.css';
import editorStyles from './admin-editor.module.css';
const labels = new Map<string, string>([
  ['required_work', t.adminWorks.requiredWork],
  ['assigned_to_person_id', t.adminWorks.person],
  ['task_created_date', t.adminWorks.createdDate],
  ['execution_date', t.adminWorks.executionDate],
  ['result', t.adminWorks.result],
  ['previous_decision', t.adminWorks.previousDecision],
  ['last_followup', t.adminWorks.lastFollowup],
  ['deadline', t.adminWorks.deadline],
  ['court_id', t.fields.court],
  ['circuit', t.fields.circuit],
  ['destination_id', t.fields.destination],
  ['status', t.adminWorks.status],
  ['alert', t.adminWorks.alert],
  ['action_date', t.adminWorks.stepDate],
  ['performed_by_person_id', t.adminWorks.person],
  ['report', t.adminWorks.report],
]);
export function AdminEditor(props: {
  snapshot: AdminMutationSnapshot;
  operation: AdminOperation;
  submission: string;
  cancel: string;
  reload: string;
  successQuery: string;
}) {
  const router = useRouter();
  const [original] = useState(props),
    { snapshot, operation } = original,
    creating = operation.endsWith('create'),
    step = operation.startsWith('step');
  const [baseline] = useState<AdminValues>(() =>
    structuredClone(
      (step ? snapshot.step : snapshot.task)?.values ??
        (step ? { action_date: null } : { task_created_date: null }),
    ),
  );
  const [values, setValues] = useState<AdminValues>(() => structuredClone(baseline));
  const [matterChosen, setMatterChosen] = useState(operation !== 'task-create');
  const [dateChosen, setDateChosen] = useState(operation !== 'task-create');
  const [result, setResult] = useState<AdminActionResult | null>(null),
    [pending, startTransition] = useTransition();
  const feedback = useRef<HTMLDivElement>(null),
    lastPayload = useRef<string | null>(null),
    submitting = useRef(false),
    prefix = useId();
  const uncertain = result?.code === 'generic',
    disabled = pending || uncertain || result?.kind === 'success';
  useEffect(() => {
    if (result?.kind === 'success' && result.id)
      router.push('/admin-works/' + result.id + original.successQuery);
    else if (result) feedback.current?.focus();
  }, [result, original.successQuery, router]);
  function change(key: string, value: string | number | null) {
    setValues((old) => ({ ...old, [key]: value }));
  }
  function submit() {
    if (submitting.current || result?.kind === 'success') return;
    if (!matterChosen) {
      setResult({
        kind: 'error',
        code: 'invalid',
        field: 'matter_id',
        message: t.adminWorks.manage.chooseMatter,
      });
      return;
    }
    if (!dateChosen) {
      setResult({
        kind: 'error',
        code: 'invalid',
        field: 'task_created_date',
        message: t.adminWorks.manage.dateHint,
      });
      return;
    }
    let payload = lastPayload.current;
    if (!uncertain) {
      const patch = Object.fromEntries(
        Object.entries(values).filter(
          ([key, value]) => creating || value !== new Map(Object.entries(baseline)).get(key),
        ),
      );
      payload = JSON.stringify({
        operation,
        task_id: snapshot.task?.id ?? null,
        step_id: snapshot.step?.id ?? null,
        version: snapshot.task?.version ?? null,
        submission: original.submission,
        values: patch,
      });
      lastPayload.current = payload;
    }
    if (payload === null) return;
    const form = new FormData();
    form.set('payload', payload);
    submitting.current = true;
    const action =
      operation === 'task-create'
        ? createAdminTaskAction
        : operation === 'task-update'
          ? updateAdminTaskAction
          : operation === 'step-create'
            ? createAdminStepAction
            : updateAdminStepAction;
    startTransition(async () => {
      try {
        setResult(await action(form));
      } catch {
        setResult({
          kind: 'error',
          code: 'generic',
          field: '',
          message: t.adminWorks.manage.errors.generic,
        });
      } finally {
        submitting.current = false;
      }
    });
  }
  return (
    <main className={styles.page}>
      <h1>
        {step
          ? creating
            ? t.adminWorks.manage.createStep
            : t.adminWorks.manage.editStep
          : creating
            ? t.adminWorks.manage.create
            : t.adminWorks.manage.edit}
      </h1>
      {snapshot.task ? <p>{t.adminWorks.identity(snapshot.task.id)}</p> : null}
      <a className={styles.link} href={original.cancel}>
        {t.common.cancel}
      </a>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <fieldset disabled={disabled} className={local.fields}>
          <legend>{step ? t.adminWorks.steps : t.adminWorks.details}</legend>
          {!step ? (
            <div className={styles.field}>
              <label htmlFor={prefix + 'matter'}>{t.nav.matters}</label>
              <select
                id={prefix + 'matter'}
                disabled={operation !== 'task-create'}
                value={!matterChosen ? '' : (values.matter_id ?? 'none')}
                aria-invalid={result?.field === 'matter_id' || undefined}
                onChange={(event) => {
                  setMatterChosen(event.target.value !== '');
                  if (event.target.value !== '')
                    change(
                      'matter_id',
                      event.target.value === 'none' ? null : Number(event.target.value),
                    );
                }}
              >
                <option value="" disabled>
                  {t.adminWorks.manage.chooseMatter}
                </option>
                <option value="none">{t.adminWorks.manage.unassigned}</option>
                {snapshot.matters.map((m) => (
                  <option key={m.id} value={m.id} disabled={!m.active}>
                    {m.name ?? t.common.notRecorded}
                    {m.context ? ' — ' + m.context : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {operation === 'task-create' ? <p>{t.adminWorks.manage.dateHint}</p> : null}
          {(step ? ADMIN_STEP_FIELDS : ADMIN_TASK_FIELDS).map((key) => {
            const id = prefix + key,
              value = new Map(Object.entries(values)).get(key) ?? '',
              choices =
                key === 'court_id'
                  ? snapshot.courts
                  : key === 'destination_id'
                    ? snapshot.destinations
                    : key.endsWith('_person_id')
                      ? snapshot.people
                      : null;
            const a11y = {
              'aria-invalid': result?.field === key || undefined,
              'aria-describedby': result?.kind === 'error' ? prefix + 'feedback' : undefined,
            };
            return (
              <div key={key} className={styles.field}>
                <label htmlFor={id}>{labels.get(key)}</label>
                {choices ? (
                  <select
                    {...a11y}
                    id={id}
                    value={value}
                    onChange={(event) =>
                      change(key, event.target.value === '' ? null : Number(event.target.value))
                    }
                  >
                    <option value="">{t.common.notRecorded}</option>
                    {choices.map((c) => (
                      <option
                        key={c.id}
                        value={c.id}
                        disabled={!c.active && c.id !== new Map(Object.entries(baseline)).get(key)}
                      >
                        {c.name}
                        {!c.active ? ' — ' + t.staff.former : ''}
                      </option>
                    ))}
                  </select>
                ) : key.endsWith('_date') || key === 'deadline' ? (
                  <input
                    {...a11y}
                    id={id}
                    type="date"
                    value={value}
                    onChange={(event) => {
                      change(key, event.target.value || null);
                      if (key === 'task_created_date') setDateChosen(Boolean(event.target.value));
                    }}
                  />
                ) : (
                  <textarea
                    {...a11y}
                    id={id}
                    rows={key === 'required_work' || key === 'last_followup' ? 5 : 3}
                    value={value}
                    onChange={(event) => {
                      const incoming = event.target.value,
                        old = new Map(Object.entries(baseline)).get(key);
                      change(
                        key,
                        typeof old === 'string' &&
                          old.replaceAll('\r\n', '\n').replaceAll('\r', '\n') === incoming
                          ? old
                          : incoming === ''
                            ? null
                            : incoming,
                      );
                    }}
                  />
                )}
                {operation === 'task-create' && key === 'task_created_date' ? (
                  <label className={editorStyles.absentDate}>
                    <input
                      type="checkbox"
                      checked={dateChosen && values.task_created_date === null}
                      onChange={(event) => {
                        setDateChosen(event.target.checked);
                        change('task_created_date', null);
                      }}
                    />
                    {t.adminWorks.createdDate + ' — ' + t.common.notRecorded}
                  </label>
                ) : null}
              </div>
            );
          })}
        </fieldset>
        {result ? (
          <div
            id={prefix + 'feedback'}
            ref={feedback}
            tabIndex={-1}
            role={result.kind === 'error' ? 'alert' : 'status'}
            className={styles.notice}
          >
            {result.message}
            {result.code === 'stale' || result.code === 'archived' || result.code === 'session' ? (
              <p>
                <a className={styles.link} href={original.reload}>
                  {t.adminWorks.manage.reload}
                </a>
              </p>
            ) : null}
          </div>
        ) : null}
        <button
          className={styles.button}
          type="submit"
          disabled={pending || result?.kind === 'success'}
        >
          {pending
            ? t.adminWorks.manage.saving
            : uncertain
              ? t.adminWorks.manage.retry
              : t.common.save}
        </button>
      </form>
    </main>
  );
}
