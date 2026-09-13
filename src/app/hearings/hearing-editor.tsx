'use client';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import {
  HEARING_FIELDS,
  type HearingValues,
  type HearingAttendeeInput,
} from '@/lib/hearing-mutation-input';
import type { HearingMutationSnapshot } from '@/lib/hearing-mutations';
import { createHearingAction, updateHearingAction, type HearingActionResult } from './actions';
import { t } from '@/strings';
import styles from '../staff/staff.module.css';
import local from './hearing-editor.module.css';
const labels = new Map<string, string>([
  ['hearing_date', t.fields.hearingDate],
  ['next_hearing_date', t.fields.nextHearingDate],
  ['action_id', t.hearings.action],
  ['decision', t.fields.decision],
  ['outcome', t.hearings.outcome],
  ['court_id', t.fields.court],
  ['circuit', t.fields.circuit],
  ['notes', t.fields.notes],
]);
export function HearingEditor(props: {
  snapshot: HearingMutationSnapshot;
  submission: string;
  cancel: string;
  reload: string;
}) {
  const [original] = useState(props),
    { snapshot } = original,
    creating = snapshot.record === null;
  const [values, setValues] = useState<HearingValues>(() =>
    structuredClone(snapshot.record?.values ?? { matter_id: null }),
  );
  const [attendees, setAttendees] = useState<HearingAttendeeInput[]>(() =>
    structuredClone(snapshot.attendees),
  );
  const [selected, setSelected] = useState('');
  const [result, setResult] = useState<HearingActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const feedback = useRef<HTMLDivElement>(null),
    lastPayload = useRef<string | null>(null),
    prefix = useId();
  const uncertain = result?.code === 'generic',
    disabled = pending || uncertain || result?.kind === 'success';
  useEffect(() => {
    if (result?.kind === 'success' && result.id)
      window.location.assign(creating ? '/hearings/' + result.id : original.cancel);
    else if (result) feedback.current?.focus();
  }, [result, creating, original.cancel]);
  function change(key: string, value: string | number | null) {
    setValues((old) => ({ ...old, [key]: value }));
  }
  function selectMember(member: HearingAttendeeInput) {
    setSelected('');
    setAttendees((old) => {
      const chosen = [...old, member];
      return [
        ...snapshot.attendees.filter((a) => chosen.some((c) => c.id === a.id)),
        ...chosen.filter((a) => a.id === null),
      ];
    });
  }
  function submit() {
    if (pending || result?.kind === 'success') return;
    let payload = lastPayload.current;
    if (!uncertain) {
      const patch = Object.fromEntries(
        Object.entries(values).filter(
          ([key, value]) =>
            creating || value !== new Map(Object.entries(snapshot.record!.values)).get(key),
        ),
      );
      payload = JSON.stringify({
        id: snapshot.record?.id ?? null,
        version: snapshot.record?.version ?? null,
        submission: original.submission,
        values: patch,
        ...(creating || JSON.stringify(attendees) !== JSON.stringify(snapshot.attendees)
          ? { attendees }
          : {}),
      });
      lastPayload.current = payload;
    }
    if (payload === null) return;
    const form = new FormData();
    form.set('payload', payload);
    startTransition(async () => {
      try {
        setResult(await (creating ? createHearingAction(form) : updateHearingAction(form)));
      } catch {
        setResult({
          kind: 'error',
          code: 'generic',
          field: '',
          message: t.hearings.manage.errors.generic,
        });
      }
    });
  }
  return (
    <main className={styles.page}>
      <h1>{creating ? t.hearings.manage.create : t.hearings.manage.edit}</h1>
      <a className={styles.link} href={original.cancel}>
        {t.common.cancel}
      </a>
      {snapshot.record?.protected ? (
        <p id={prefix + 'protected'}>{t.hearings.manage.protected}</p>
      ) : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <fieldset disabled={disabled} className={local.fields}>
          <legend>{t.hearings.details}</legend>
          <div className={styles.field}>
            <label htmlFor={prefix + 'matter'}>{t.hearings.filters.matter}</label>
            <select
              id={prefix + 'matter'}
              value={values.matter_id ?? ''}
              disabled={!creating}
              onChange={(e) =>
                change('matter_id', e.target.value === '' ? null : Number(e.target.value))
              }
            >
              <option value="">{t.hearings.manage.unassigned}</option>
              {snapshot.matters.map((m) => (
                <option key={m.id} value={m.id} disabled={!m.active}>
                  {m.name ?? t.common.notRecorded}
                  {m.context ? ' — ' + m.context : ''}
                  {m.clientArchived ? ' — ' + t.clients.archivedNotice : ''}
                </option>
              ))}
            </select>
          </div>
          {HEARING_FIELDS.map((key) => {
            const id = prefix + key,
              value = new Map(Object.entries(values)).get(key) ?? '';
            const protectedField = Boolean(
              snapshot.record?.protected && ['court_id', 'circuit', 'notes'].includes(key),
            );
            const choices =
              key === 'court_id' ? snapshot.courts : key === 'action_id' ? snapshot.actions : null;
            const accessibility = {
              'aria-invalid': result?.field === key || undefined,
              'aria-describedby': protectedField ? prefix + 'protected' : undefined,
            };
            return (
              <div key={key} className={styles.field}>
                <label htmlFor={id}>{labels.get(key)}</label>
                {choices ? (
                  <select
                    {...accessibility}
                    id={id}
                    disabled={protectedField}
                    value={value}
                    onChange={(e) =>
                      change(key, e.target.value === '' ? null : Number(e.target.value))
                    }
                  >
                    <option value="">{t.common.notRecorded}</option>
                    {choices.map((c) => (
                      <option key={c.id} value={c.id} disabled={!c.active && c.id !== value}>
                        {c.name}
                        {!c.active ? ' — ' + t.staff.former : ''}
                      </option>
                    ))}
                  </select>
                ) : key.endsWith('_date') ? (
                  <input
                    {...accessibility}
                    id={id}
                    type="date"
                    value={value}
                    onChange={(e) => change(key, e.target.value || null)}
                  />
                ) : (
                  <textarea
                    {...accessibility}
                    id={id}
                    rows={key === 'decision' ? 5 : 3}
                    maxLength={10000}
                    disabled={protectedField}
                    value={value}
                    onChange={(e) => {
                      const incoming = e.target.value,
                        old = new Map(Object.entries(snapshot.record?.values ?? {})).get(key);
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
              </div>
            );
          })}
        </fieldset>
        <fieldset disabled={disabled} className={local.fields}>
          <legend>{t.fields.attendees}</legend>
          <p>{t.hearings.attendeeHint}</p>
          <ol className={local.members}>
            {attendees.map((a, index) => {
              const person = snapshot.people.find((p) => p.id === a.person_id);
              return (
                <li key={a.id === null ? 'new-' + a.person_id : a.id}>
                  <span>
                    {person?.name ?? t.common.notRecorded}
                    {person && !person.active ? ' — ' + t.staff.former : ''}
                  </span>
                  <button
                    type="button"
                    className={styles.button}
                    onClick={() => setAttendees((old) => old.filter((_, i) => i !== index))}
                  >
                    {t.matters.manage.remove}
                  </button>
                </li>
              );
            })}
          </ol>
          {snapshot.attendees
            .filter(
              (a) =>
                !attendees.some((v) => v.id === a.id) &&
                snapshot.people.some((p) => p.id === a.person_id && p.active),
            )
            .map((a) => (
              <button
                key={a.id}
                type="button"
                className={styles.button}
                onClick={() => selectMember(a)}
              >
                {t.hearings.manage.reselect}
                {' — '}
                {snapshot.people.find((p) => p.id === a.person_id)?.name}
              </button>
            ))}
          <div className={styles.field}>
            <label htmlFor={prefix + 'add'}>{t.hearings.filters.attendee}</label>
            <select
              id={prefix + 'add'}
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">{t.common.notRecorded}</option>
              {snapshot.people
                .filter((p) => p.active && !attendees.some((a) => a.person_id === p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </div>
          <button
            type="button"
            className={styles.button}
            disabled={!selected || attendees.length >= 500}
            onClick={() => {
              selectMember(
                snapshot.attendees.find(
                  (a) => a.person_id === Number(selected) && !attendees.some((v) => v.id === a.id),
                ) ?? { id: null, person_id: Number(selected) },
              );
              setSelected('');
            }}
          >
            {t.common.add}
          </button>
        </fieldset>
        <button
          className={styles.button}
          type="submit"
          disabled={pending || result?.kind === 'success'}
        >
          {uncertain ? t.clients.retry : t.common.save}
        </button>
      </form>
      {result ? (
        <div
          ref={feedback}
          tabIndex={-1}
          role={result.kind === 'error' ? 'alert' : 'status'}
          className={styles.panel}
        >
          <p>{result.message}</p>
          {result.kind === 'success' ? (
            <a className={styles.link} href={'/hearings/' + result.id}>
              {t.clients.manage.backRecord}
            </a>
          ) : (
            <a className={styles.link} href={original.reload}>
              {t.logos.reload}
            </a>
          )}
        </div>
      ) : null}
    </main>
  );
}
