'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import type { ClientMutationSnapshot } from '@/lib/client-mutations';
import {
  CLIENT_FIELDS,
  CONTACT_FIELDS,
  clientValue,
  type ClientOperation,
} from '@/lib/client-mutation-input';
import { clientOperationTitle } from '@/lib/client-mutation-copy';
import { t } from '@/strings';
import {
  createClientAction,
  updateClientAction,
  archiveClientAction,
  restoreClientAction,
  createContactAction,
  updateContactAction,
  archiveContactAction,
  restoreContactAction,
  type ClientActionResult,
} from './actions';
import styles from '../staff/staff.module.css';
import local from './clients.module.css';

async function submitClientForm(operation: ClientOperation, form: FormData) {
  switch (operation) {
    case 'client-create':
      return createClientAction(form);
    case 'client-update':
      return updateClientAction(form);
    case 'client-archive':
      return archiveClientAction(form);
    case 'client-restore':
      return restoreClientAction(form);
    case 'contact-create':
      return createContactAction(form);
    case 'contact-update':
      return updateContactAction(form);
    case 'contact-archive':
      return archiveContactAction(form);
    case 'contact-restore':
      return restoreContactAction(form);
  }
}
const labels: Record<string, string> = {
  name_ar: t.clients.displayName,
  name_en: t.clients.englishName,
  full_name: t.clients.fullName,
  cash_or_probono: t.clients.classification,
  status: t.clients.status,
  poa_location: t.clients.poaLocation,
  documents_location: t.clients.documentsLocation,
  client_start: t.clients.startDate,
  client_end: t.clients.endDate,
  contact_person_id: t.clients.mainContact,
  contact_name: t.clients.contactName,
  job_title: t.clients.jobTitle,
  email: t.clients.email,
  mobile_phone: t.clients.mobile,
  business_phone: t.clients.businessPhone,
  fax_number: t.clients.fax,
  web_page: t.clients.website,
  address: t.clients.address,
  city: t.clients.city,
  state_province: t.clients.stateProvince,
  zip_postal_code: t.clients.postalCode,
  country_region: t.clients.countryRegion,
};
function display(field: string, value: string | number | null | undefined): string {
  if ((field === 'status' || field === 'cash_or_probono') && !String(value ?? '').trim()) return '';
  if (field === 'cash_or_probono' && value === 'probono') return 'Probono';
  return String(value ?? '');
}

export function ClientEditor({
  snapshot,
  submission,
  query,
  cancelHref,
  reloadHref,
  newHref,
}: {
  snapshot: ClientMutationSnapshot;
  submission: string;
  query: string;
  cancelHref: string;
  reloadHref: string;
  newHref: string;
}) {
  // One snapshot owns both the original values and expected version. A refresh
  // caused by this or another action must never attach new tokens to old input.
  const [original] = useState({ snapshot, submission, query, cancelHref, reloadHref, newHref });
  const { record, parent, operation, counts } = original.snapshot;
  const isClient = operation.startsWith('client-');
  const creating = operation.endsWith('-create');
  const lifecycle = operation.endsWith('-archive') || operation.endsWith('-restore');
  const restoring = operation.endsWith('-restore');
  const fields = lifecycle
    ? []
    : (isClient ? CLIENT_FIELDS : CONTACT_FIELDS).filter(
        (field) => !(creating && field === 'contact_person_id'),
      );
  const [values, setValues] = useState(
    () =>
      new Map(fields.map((field) => [field, display(field, clientValue(record?.values, field))])),
  );
  const [result, setResult] = useState<ClientActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const pendingFeedback = useRef<HTMLParagraphElement>(null);
  const id = useId();
  const title = clientOperationTitle(operation);
  const name = String(
    clientValue(record?.values, isClient ? 'name_ar' : 'contact_name') ??
      (isClient ? '' : t.clients.unnamed),
  );
  const hint = lifecycle
    ? restoring
      ? t.clients.manage.restoreHint
      : t.clients.manage.archiveHint
    : t.clients.manage.hint;
  const blocked = parent?.archived
    ? t.clients.manage.errors['parent-archived']
    : record?.archived && !lifecycle
      ? t.clients.manage.errors.archived
      : null;
  const close = () => {
    dialog.current?.close();
    trigger.current?.focus();
  };
  useEffect(() => {
    if (pending) pendingFeedback.current?.focus();
    else if (result) feedback.current?.focus();
  }, [pending, result]);
  const save = () => {
    if (pending || blocked || result?.kind === 'success') return;
    const form = new FormData();
    if (creating) form.set('submission', original.submission);
    else {
      form.set('id', String(record!.id));
      form.set('version', record!.version);
    }
    if (parent) form.set('clientId', String(parent.id));
    if (lifecycle) form.set('confirmation', String(record!.id));
    for (const field of fields) {
      if (creating || values.get(field) !== display(field, clientValue(record?.values, field)))
        form.set(field, values.get(field)!);
    }
    close();
    startTransition(async () => {
      try {
        setResult(await submitClientForm(operation, form));
      } catch {
        setResult({
          kind: 'error',
          code: 'generic',
          field: '',
          message: t.clients.manage.errors.generic,
        });
      }
    });
  };
  const target = result?.id
    ? (isClient ? `/clients/${result.id}` : `/clients/${result.clientId}/contacts/${result.id}`) +
      original.query
    : null;
  return (
    <section className={styles.panel} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{title}</h2>
      {name ? (
        <p className={local.multiline} dir="auto">
          {name}
        </p>
      ) : null}
      {parent ? (
        <p dir="auto">
          {t.fields.client}: {parent.name} ({parent.id})
        </p>
      ) : null}
      <p id={`${id}-hint`}>{hint}</p>
      {!isClient ? <p>{t.clients.manage.contactHint}</p> : null}
      {record?.sigma ? <p>{t.clients.manage.sigmaHint}</p> : null}
      {!isClient && record && !String(record.values.contact_name ?? '').trim() ? (
        <p>{t.clients.manage.unnamedHint}</p>
      ) : null}
      {counts && lifecycle ? (
        <p>
          {t.clients.manage.counts(
            counts.contacts,
            counts.matters,
            counts.feeLetters,
            counts.invoices,
          )}
        </p>
      ) : null}
      {parent && lifecycle ? (
        <p>{t.clients.manage.contactUse(parent.mainContactId === record?.id ? 1 : 0)}</p>
      ) : null}
      {blocked ? <p role="status">{blocked}</p> : null}
      <form
        noValidate
        aria-describedby={`${id}-hint`}
        onSubmit={(event) => {
          event.preventDefault();
          if (pending || blocked || result?.kind === 'success') return;
          if (lifecycle) dialog.current?.showModal();
          else save();
        }}
      >
        {result ? (
          <div
            ref={feedback}
            tabIndex={-1}
            className={`${styles.feedback} ${styles.focusTarget} ${result.kind === 'error' ? styles.error : ''}`}
            role={result.kind === 'error' ? 'alert' : 'status'}
            id={`${id}-feedback`}
          >
            {result.kind === 'error' ? <h3>{t.clients.manage.errorsTitle}</h3> : null}
            <p>{result.message}</p>
            {fields.includes(result.field as never) ? (
              <a
                className={styles.nameLink}
                href={`#${id}-${result.field}`}
                onClick={() => document.getElementById(`${id}-${result.field}`)?.focus()}
              >
                {clientValue(labels, result.field)}
              </a>
            ) : null}
            {target ? (
              <a className={styles.link} href={target}>
                {t.clients.manage.view}
              </a>
            ) : null}
            {creating ? (
              <>
                <p>{t.clients.manage.anotherHint}</p>
                <a className={styles.link} href={original.newHref}>
                  {t.clients.manage.another}
                </a>
              </>
            ) : (
              <>
                <p>{t.clients.manage.reloadHint}</p>
                <a className={styles.link} href={original.reloadHref}>
                  {t.clients.manage.reload}
                </a>
              </>
            )}
          </div>
        ) : null}
        <fieldset
          className={styles.formFields}
          aria-label={title}
          disabled={pending || Boolean(blocked) || result?.kind === 'success'}
        >
          {fields.map((field) => {
            const fixed = record?.sigma && ['name_ar', 'name_en', 'full_name'].includes(field);
            const required =
              field === 'name_ar' ||
              (field === 'contact_name' &&
                (creating || Boolean(String(record?.values.contact_name ?? '').trim())));
            const help =
              field === 'contact_person_id'
                ? t.clients.manage.mainHint
                : field === 'client_start' || field === 'client_end'
                  ? t.clients.manage.dateHint
                  : required
                    ? t.clients.manage.required
                    : t.clients.manage.optional;
            const props = {
              id: `${id}-${field}`,
              name: field,
              value: values.get(field) ?? '',
              onChange: (
                event: React.ChangeEvent<
                  HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
                >,
              ) => setValues((current) => new Map(current).set(field, event.target.value)),
              'aria-required': required || undefined,
              'aria-invalid': result?.kind === 'error' && result.field === field,
              'aria-describedby': `${id}-${field}-hint${result?.kind === 'error' && result.field === field ? ` ${id}-feedback` : ''}`,
            };
            const options =
              field === 'cash_or_probono'
                ? [
                    { value: '', label: t.common.notRecorded },
                    { value: 'Cash', label: t.clients.cash },
                    { value: 'Probono', label: t.clients.probono },
                  ]
                : field === 'status'
                  ? [
                      { value: '', label: t.common.notRecorded },
                      { value: 'Active', label: t.clients.active },
                      { value: 'Disabled', label: t.clients.disabled },
                      { value: 'Potential', label: t.clients.potential },
                    ]
                  : field === 'contact_person_id'
                    ? [
                        { value: '', label: t.clients.noMainContact },
                        ...original.snapshot.contacts.map((contact) => ({
                          value: String(contact.id),
                          label: t.clients.manage.contactOption(
                            contact.name?.trim() ? contact.name : t.clients.unnamed,
                            contact.id,
                            contact.job,
                          ),
                        })),
                      ]
                    : null;
            return (
              <div className={styles.field} key={field}>
                <label htmlFor={props.id}>
                  {!isClient && field === 'full_name'
                    ? t.clients.secondaryFullName
                    : clientValue(labels, field)}
                </label>
                {options ? (
                  <select {...props}>
                    {options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : [
                    'name_ar',
                    'name_en',
                    'full_name',
                    'contact_name',
                    'address',
                    'poa_location',
                    'documents_location',
                  ].includes(field) ? (
                  <textarea {...props} dir="auto" rows={3} maxLength={2048} readOnly={fixed} />
                ) : (
                  <input
                    {...props}
                    type="text"
                    dir={
                      [
                        'email',
                        'mobile_phone',
                        'business_phone',
                        'fax_number',
                        'web_page',
                        'client_start',
                        'client_end',
                      ].includes(field)
                        ? 'ltr'
                        : 'auto'
                    }
                    maxLength={2048}
                    readOnly={fixed}
                  />
                )}
                <p className={styles.hint} id={`${id}-${field}-hint`}>
                  {help}
                </p>
              </div>
            );
          })}
          <div className={styles.actions}>
            <button ref={trigger} className={styles.button} type="submit">
              {lifecycle ? title : t.common.save}
            </button>
          </div>
        </fieldset>
        {pending ? (
          <p ref={pendingFeedback} role="status" tabIndex={-1} className={styles.focusTarget}>
            {t.clients.manage.saving}
          </p>
        ) : null}
      </form>
      <a
        className={styles.link}
        href={original.cancelHref}
        aria-disabled={pending}
        onClick={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        {t.common.cancel}
      </a>
      {lifecycle ? (
        <dialog
          ref={dialog}
          className={styles.dialog}
          aria-labelledby={`${id}-confirmation`}
          aria-describedby={`${id}-consequence`}
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Tab') return;
            const buttons = dialog.current?.querySelectorAll('button');
            const first = buttons?.item(0),
              last = buttons?.item(1);
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }}
        >
          <h2 id={`${id}-confirmation`}>{t.clients.manage.confirmation}</h2>
          <p>
            <strong>{title}</strong>
          </p>
          <p className={local.multiline} dir="auto">
            {name} ({record?.id})
          </p>
          <p id={`${id}-consequence`}>{hint}</p>
          {parent ? (
            <p>{t.clients.manage.contactUse(parent.mainContactId === record?.id ? 1 : 0)}</p>
          ) : null}
          {counts ? (
            <p>
              {t.clients.manage.counts(
                counts.contacts,
                counts.matters,
                counts.feeLetters,
                counts.invoices,
              )}
            </p>
          ) : null}
          <div className={styles.actions}>
            <button type="button" className={styles.link} autoFocus onClick={close}>
              {t.common.cancel}
            </button>
            <button type="button" className={styles.button} onClick={save}>
              {t.clients.manage.confirm}
            </button>
          </div>
        </dialog>
      ) : null}
    </section>
  );
}
