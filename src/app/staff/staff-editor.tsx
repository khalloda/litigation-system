'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import type { StaffManagementSnapshot } from '@/lib/staff-mutations';
import { t } from '@/strings';
import {
  createStaffAction,
  updateStaffAction,
  renameStaffAction,
  addStaffAliasAction,
  retireStaffAliasAction,
  restoreStaffAliasAction,
  deactivateStaffAction,
  reactivateStaffAction,
  setStaffReviewerAction,
  type StaffActionResult,
} from './actions';
import styles from './staff.module.css';

type Field = {
  key: string;
  label: string;
  value: string;
  type?: 'email' | 'textarea';
  ltr?: boolean;
  max?: number;
  required?: boolean;
  options?: { value: string; label: string }[];
};
function StaffForm({
  title,
  hint,
  fields = [],
  hidden = {},
  confirm = false,
  personName = '',
  action,
}: {
  title: string;
  hint: string;
  fields?: Field[];
  hidden?: Record<string, string>;
  confirm?: boolean;
  personName?: string;
  action: (form: FormData) => Promise<StaffActionResult>;
}) {
  const formId = useId();
  const form = useRef<HTMLFormElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const summary = useRef<HTMLDivElement>(null);
  const pendingFeedback = useRef<HTMLParagraphElement>(null);
  // Keep the version paired with the values originally displayed. A server
  // action can refresh surrounding RSC props while another form has unsaved input.
  const [tokens] = useState(hidden);
  const [values, setValues] = useState(
    () => new Map(fields.map((field) => [field.key, field.value])),
  );
  const [result, setResult] = useState<StaffActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (pending) pendingFeedback.current?.focus();
    else if (result) summary.current?.focus();
  }, [pending, result]);
  const close = () => {
    dialog.current?.close();
    trigger.current?.focus();
  };
  const save = () => {
    const data = new FormData(form.current!);
    if (confirm) data.set('confirmation', tokens.personId!);
    close();
    startTransition(async () => {
      try {
        setResult(await action(data));
      } catch {
        setResult({ kind: 'error', message: t.staff.manage.errors.generic, field: '' });
      }
    });
  };
  const fieldError = fields.find((field) => field.key === result?.field);
  return (
    <section className={styles.panel} aria-labelledby={`${formId}-heading`}>
      <h2 id={`${formId}-heading`}>{title}</h2>
      <p id={`${formId}-hint`}>{hint}</p>
      <form
        ref={form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (pending || result?.kind === 'success') return;
          if (confirm) dialog.current?.showModal();
          else save();
        }}
        aria-describedby={`${formId}-hint`}
      >
        {result ? (
          <div
            ref={summary}
            id={`${formId}-feedback`}
            tabIndex={-1}
            className={`${styles.feedback} ${styles.focusTarget} ${result.kind === 'error' ? styles.error : ''}`}
            role={result.kind === 'error' ? 'alert' : 'status'}
          >
            {result.kind === 'error' ? <h3>{t.staff.manage.errorsTitle}</h3> : null}
            <p>{result.message}</p>
            {fieldError ? (
              <a
                className={styles.nameLink}
                href={`#${formId}-${fieldError.key}`}
                onClick={() => document.getElementById(`${formId}-${fieldError.key}`)?.focus()}
              >
                {fieldError.label}
              </a>
            ) : null}
            {result.personId ? (
              <a className={styles.link} href={`/staff/${result.personId}`}>
                {t.staff.manage.view}
              </a>
            ) : null}
            <p>{t.staff.manage.reloadHint}</p>
            <a
              className={styles.link}
              href={hidden.personId ? `/staff/${hidden.personId}/edit` : '/staff/new'}
            >
              {t.staff.manage.reload}
            </a>
          </div>
        ) : null}
        {Object.entries(tokens).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
        <fieldset
          className={styles.formFields}
          aria-label={title}
          disabled={pending || result?.kind === 'success'}
        >
          {fields.map((field) => {
            const props = {
              id: `${formId}-${field.key}`,
              name: field.key,
              'aria-required': field.required || undefined,
              value: values.get(field.key) ?? '',
              onChange: (
                event: React.ChangeEvent<
                  HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
                >,
              ) => setValues((current) => new Map(current).set(field.key, event.target.value)),
              'aria-invalid': result?.kind === 'error' && result.field === field.key,
              'aria-describedby':
                result?.kind === 'error' && result.field === field.key
                  ? `${formId}-hint ${formId}-feedback`
                  : `${formId}-hint`,
              className: field.ltr ? styles.ltr : undefined,
            };
            return (
              <div className={styles.field} key={field.key}>
                <label htmlFor={props.id}>{field.label}</label>
                {field.options ? (
                  <select {...props}>
                    {field.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : field.type === 'textarea' ? (
                  <textarea {...props} maxLength={field.max} rows={3} />
                ) : (
                  <input {...props} type={field.type ?? 'text'} maxLength={field.max ?? 256} />
                )}
              </div>
            );
          })}
          <div className={styles.actions}>
            <button ref={trigger} className={styles.button} type="submit">
              {pending ? t.staff.manage.saving : title}
            </button>
          </div>
        </fieldset>
        {pending ? (
          <p ref={pendingFeedback} role="status" tabIndex={-1} className={styles.focusTarget}>
            {t.staff.manage.saving}
          </p>
        ) : null}
      </form>
      {confirm ? (
        <dialog
          ref={dialog}
          className={styles.dialog}
          aria-labelledby={`${formId}-confirm`}
          aria-describedby={`${formId}-consequence`}
          onKeyDown={(event) => {
            if (event.key !== 'Tab') return;
            const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>('button');
            const first = buttons?.item(0);
            const last = buttons?.item(buttons.length - 1);
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
          <h2 id={`${formId}-confirm`}>{t.staff.manage.confirmationTitle}</h2>
          <p>
            <strong>{title}</strong>
          </p>
          <p>{t.staff.manage.confirmPerson(personName)}</p>
          {values.get('nameAr') ? <p>{values.get('nameAr')}</p> : null}
          <p id={`${formId}-consequence`}>{hint}</p>
          <div className={styles.actions}>
            <button type="button" className={styles.link} autoFocus onClick={close}>
              {t.staff.manage.cancel}
            </button>
            <button type="button" className={styles.button} onClick={save}>
              {t.staff.manage.confirm}
            </button>
          </div>
        </dialog>
      ) : null}
    </section>
  );
}

export function StaffEditor({ snapshot }: { snapshot: StaffManagementSnapshot }) {
  const current = snapshot.person;
  const hidden: Record<string, string> = current
    ? { personId: String(current.id), version: current.version }
    : {};
  const nameField: Field = {
    key: 'nameAr',
    label: t.staff.name,
    value: current?.nameAr ?? '',
    required: true,
  };
  const fields: Field[] = [
    { key: 'nameEn', label: t.staff.englishName, value: current?.nameEn ?? '', ltr: true },
    {
      key: 'email',
      label: t.staff.email,
      value: current?.email ?? '',
      type: 'email',
      ltr: true,
      max: 254,
    },
    {
      key: 'isTrainee',
      label: t.staff.trainee,
      value: current?.isTrainee ? 'true' : 'false',
      options: [
        { value: 'false', label: t.staff.traineeNo },
        { value: 'true', label: t.staff.traineeYes },
      ],
    },
    {
      key: 'teamId',
      label: t.staff.team,
      value: String(current?.teamId ?? ''),
      options: [
        { value: '', label: t.staff.unassigned },
        ...snapshot.teams.map((team) => ({ value: String(team.id), label: team.name })),
      ],
    },
  ];
  if (!current)
    return (
      <StaffForm
        title={t.staff.manage.create}
        hint={`${t.staff.manage.createHint} ${t.staff.manage.nameHint}`}
        fields={[nameField, ...fields]}
        action={createStaffAction}
      />
    );
  const nativeAliases = snapshot.aliases.filter((alias) => !alias.isImported && !alias.isPrimary);
  return (
    <>
      <StaffForm
        title={t.staff.manage.update}
        hint={t.staff.manage.requiredHint}
        fields={fields}
        hidden={hidden}
        action={updateStaffAction}
      />
      <StaffForm
        title={t.staff.manage.rename}
        hint={`${t.staff.manage.renameHint} ${t.staff.manage.nameHint}`}
        fields={[nameField]}
        hidden={hidden}
        confirm
        personName={current.nameAr}
        action={renameStaffAction}
      />
      <StaffForm
        title={t.staff.manage.addAlias}
        hint={t.staff.aliasesHint}
        fields={[{ key: 'alias', label: t.staff.manage.alias, value: '', required: true }]}
        hidden={hidden}
        action={addStaffAliasAction}
      />
      <section className={styles.panel} aria-label={t.staff.aliases}>
        <h2>{t.staff.aliases}</h2>
        <p>{t.staff.manage.immutableHint}</p>
        <ul className={styles.aliasList}>
          {snapshot.aliases.map((alias) => (
            <li key={alias.id}>
              <strong>{alias.name}</strong>
              <p>{alias.isImported ? t.staff.imported : t.staff.applicationAlias}</p>
              <p>
                {alias.isPrimary
                  ? t.staff.primary
                  : alias.isRetired
                    ? t.staff.retired
                    : t.staff.searchable}
              </p>
            </li>
          ))}
        </ul>
      </section>
      {nativeAliases.map((alias) => (
        <StaffForm
          key={alias.id}
          title={alias.isRetired ? t.staff.manage.restoreAlias : t.staff.manage.retireAlias}
          hint={`${alias.name}: ${alias.isRetired ? t.staff.manage.restoreHint : t.staff.manage.retireHint}`}
          fields={[
            {
              key: 'reason',
              label: t.staff.manage.reason,
              value: '',
              type: 'textarea',
              max: 2048,
              required: true,
            },
          ]}
          hidden={{ ...hidden, aliasId: String(alias.id) }}
          confirm
          personName={current.nameAr}
          action={alias.isRetired ? restoreStaffAliasAction : retireStaffAliasAction}
        />
      ))}
      {snapshot.teams.map((team) => (
        <StaffForm
          key={team.id}
          title={`${t.staff.manage.reviewer}: ${team.name}`}
          hint={t.staff.manage.reviewerHint}
          fields={[
            {
              key: 'reviewerId',
              label: t.staff.reviewer,
              value: String(team.reviewerId),
              options: snapshot.reviewers.map((reviewer) => ({
                value: String(reviewer.id),
                label: reviewer.name,
              })),
            },
          ]}
          hidden={{ ...hidden, teamId: String(team.id), teamVersion: team.version }}
          action={setStaffReviewerAction}
        />
      ))}
      {snapshot.isSelf && current.isActive ? (
        <section className={styles.panel}>
          <h2>{t.staff.manage.deactivate}</h2>
          <p>{t.staff.manage.selfHint}</p>
        </section>
      ) : (
        <StaffForm
          title={current.isActive ? t.staff.manage.deactivate : t.staff.manage.reactivate}
          hint={current.isActive ? t.staff.manage.deactivateHint : t.staff.manage.reactivateHint}
          hidden={hidden}
          confirm
          personName={current.nameAr}
          action={current.isActive ? deactivateStaffAction : reactivateStaffAction}
        />
      )}
    </>
  );
}
