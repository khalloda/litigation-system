'use client';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import type { MatterMutationSnapshot } from '@/lib/matter-mutations';
import {
  MATTER_FIELDS,
  MATTER_LOOKUP_FIELDS,
  MATTER_DATE_FIELDS,
  MATTER_DECIMAL_FIELDS,
  type MatterValues,
  type MatterPartyInput,
  type MatterLawyerInput,
} from '@/lib/matter-mutation-input';
import { t } from '@/strings';
import { createMatterAction, updateMatterAction, type MatterActionResult } from './actions';
import styles from '../staff/staff.module.css';
import local from './matter-editor.module.css';

const labels: Record<string, string> = {
  case_number_ar: t.fields.caseNumber,
  subject: t.fields.subject,
  status: t.matters.filters.status,
  current_status: t.fields.status,
  circuit: t.fields.circuit,
  court_id: t.fields.court,
  circuit_secretary: t.matters.circuitSecretary,
  court_floor: t.matters.courtFloor,
  court_hall: t.matters.courtHall,
  court_shelf: t.matters.courtShelf,
  court_secretary_room: t.matters.courtSecretaryRoom,
  notes_1: t.matters.notes1,
  notes_2: t.matters.notes2,
  evaluation: t.matters.evaluation,
  legal_opinion: t.matters.legalOpinion,
  matter_type_id: t.matters.filters.type,
  matter_category_id: t.matters.filters.category,
  degree_id: t.matters.filters.degree,
  venue_id: t.matters.filters.venue,
  importance_id: t.matters.importance,
  destination_id: t.fields.destination,
  branch_id: t.matters.filters.branch,
  start_date: t.matters.startDate,
  end_date: t.matters.endDate,
  asked_amount: t.matters.askedAmount,
  judged_amount: t.matters.judgedAmount,
};
const copy = <T,>(value: T): T => structuredClone(value);
function move<T>(rows: T[], index: number, delta: number): T[] {
  const next = [...rows];
  const item = next.splice(index, 1)[0]!;
  next.splice(index + delta, 0, item);
  return next;
}
export function MatterEditor(props: {
  snapshot: MatterMutationSnapshot;
  submission: string;
  cancel: string;
  reload: string;
  query: string;
}) {
  const [original] = useState(props);
  const { snapshot } = original;
  const creating = snapshot.record === null;
  const [values, setValues] = useState<MatterValues>(() =>
    copy(snapshot.record?.values ?? { matter_type_id: snapshot.defaultType }),
  );
  const [parties, setParties] = useState<MatterPartyInput[]>(() => copy(snapshot.parties));
  const [lawyers, setLawyers] = useState<MatterLawyerInput[]>(() => copy(snapshot.lawyers));
  const [result, setResult] = useState<MatterActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const feedback = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const lastPayload = useRef<string | null>(null);
  const prefix = useId();
  const uncertain = result?.code === 'generic';
  const disabled = pending || uncertain || result?.kind === 'success';
  useEffect(() => {
    if (result) feedback.current?.focus();
  }, [result]);
  const changeValue = (key: string, value: string | number | null) =>
    setValues((old) => ({ ...old, [key]: value }));
  const updateParty = (index: number, change: Partial<MatterPartyInput>) =>
    setParties((old) => old.map((p, i) => (i === index ? { ...p, ...change } : p)));
  const updateLawyer = (index: number, change: Partial<MatterLawyerInput>) =>
    setLawyers((old) => old.map((p, i) => (i === index ? { ...p, ...change } : p)));
  const focusList = () =>
    requestAnimationFrame(() =>
      form.current?.querySelector<HTMLElement>('[data-relationships]')?.focus(),
    );
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
        ...(JSON.stringify(parties) !== JSON.stringify(snapshot.parties) || creating
          ? { parties }
          : {}),
        ...(JSON.stringify(lawyers) !== JSON.stringify(snapshot.lawyers) || creating
          ? { lawyers }
          : {}),
      });
      lastPayload.current = payload;
    }
    if (payload === null) return;
    if (new TextEncoder().encode(payload).byteLength > 500000) {
      setResult({
        kind: 'error',
        code: 'invalid',
        field: '',
        message: t.matters.manage.errors.invalid,
      });
      return;
    }
    const data = new FormData();
    data.set('payload', payload);
    startTransition(async () => {
      try {
        setResult(await (creating ? createMatterAction(data) : updateMatterAction(data)));
      } catch {
        setResult({
          kind: 'error',
          code: 'generic',
          field: '',
          message: t.matters.manage.errors.generic,
        });
      }
    });
  }
  function field(key: (typeof MATTER_FIELDS)[number]) {
    const id = prefix + key;
    const value = new Map(Object.entries(values)).get(key) ?? '';
    const error = result?.kind === 'error' && result.field === key;
    const accessibility = {
      'aria-invalid': error || undefined,
      'aria-describedby': error ? prefix + 'feedback' : undefined,
    };
    const choices = new Map(Object.entries(snapshot.choices)).get(key);
    return (
      <div className={styles.field} key={key}>
        <label htmlFor={id}>{new Map(Object.entries(labels)).get(key)}</label>
        {choices ? (
          <select
            {...accessibility}
            id={id}
            value={value}
            onChange={(e) =>
              changeValue(key, e.target.value === '' ? null : Number(e.target.value))
            }
          >
            <option value="">{t.common.notRecorded}</option>
            {choices
              .filter(
                (o) =>
                  key !== 'branch_id' ||
                  snapshot.branches.some(
                    (b) => b.branch_id === o.id && b.client_id === values.client_id,
                  ),
              )
              .map((o) => (
                <option
                  key={o.id}
                  value={o.id}
                  disabled={
                    !o.active &&
                    o.id !== new Map(Object.entries(snapshot.record?.values ?? {})).get(key)
                  }
                >
                  {o.name}
                  {!o.active ? ` (${t.matters.former})` : ''}
                </option>
              ))}
          </select>
        ) : (MATTER_DATE_FIELDS as readonly string[]).includes(key) ? (
          <input
            {...accessibility}
            id={id}
            type="date"
            value={value}
            onChange={(e) => changeValue(key, e.target.value || null)}
          />
        ) : (MATTER_DECIMAL_FIELDS as readonly string[]).includes(key) ? (
          <input
            {...accessibility}
            id={id}
            inputMode="decimal"
            dir="ltr"
            value={value}
            onChange={(e) => changeValue(key, e.target.value || null)}
          />
        ) : (
          <textarea
            {...accessibility}
            id={id}
            rows={key === 'case_number_ar' ? 4 : 2}
            className={key === 'case_number_ar' ? local.caseNumber : undefined}
            value={value}
            maxLength={100000}
            onChange={(e) => changeValue(key, e.target.value)}
          />
        )}
      </div>
    );
  }
  const orderButtons = (
    index: number,
    length: number,
    onMove: (delta: number) => void,
    onRemove: () => void,
  ) => (
    <div className={local.controls}>
      <button type="button" disabled={index === 0} onClick={() => onMove(-1)}>
        {t.matters.manage.up}
      </button>
      <button type="button" disabled={index === length - 1} onClick={() => onMove(1)}>
        {t.matters.manage.down}
      </button>
      <button
        type="button"
        onClick={() => {
          onRemove();
          focusList();
        }}
      >
        {t.matters.manage.remove}
      </button>
    </div>
  );
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>{creating ? t.matters.manage.create : t.matters.manage.edit}</h1>
      </header>
      <p>{t.matters.manage.hint}</p>
      <div
        id={prefix + 'feedback'}
        ref={feedback}
        tabIndex={-1}
        role={result?.kind === 'error' ? 'alert' : 'status'}
        className={result ? styles.panel : undefined}
      >
        {result?.message}
        {result?.kind === 'success' && (
          <p>
            <a className={styles.link} href={`/matters/${result.id}${original.query}`}>
              {t.matters.backMatter}
            </a>
          </p>
        )}
        {result?.kind === 'error' && (
          <>
            <p>{t.matters.manage.reloadHint}</p>
            <a className={styles.link} href={original.reload}>
              {t.matters.manage.reload}
            </a>
          </>
        )}
      </div>
      <form
        ref={form}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className={local.form}
      >
        <fieldset disabled={disabled} className={local.section}>
          <legend>{t.matters.details}</legend>
          {field('case_number_ar')}
          {field('subject')}
          <div className={styles.field}>
            <label htmlFor={prefix + 'client'}>{t.matters.filters.client}</label>
            <select
              id={prefix + 'client'}
              value={values.client_id ?? ''}
              disabled={!creating}
              onChange={(e) => {
                changeValue('client_id', e.target.value === '' ? null : Number(e.target.value));
                changeValue('branch_id', null);
              }}
            >
              <option value="">{t.common.notRecorded}</option>
              {snapshot.clients.map((c) => (
                <option key={c.id} value={c.id} disabled={!c.active}>
                  {t.matters.option(
                    c.name,
                    c.context ? t.matters.option(c.context, String(c.id)) : String(c.id),
                  )}
                  {!c.active ? ` (${t.clients.archived})` : ''}
                </option>
              ))}
            </select>
          </div>
        </fieldset>
        <fieldset disabled={disabled} className={local.section}>
          <legend>{t.matters.classifications}</legend>
          <div className={local.grid}>
            {MATTER_LOOKUP_FIELDS.map(field)}
            {field('status')}
            {field('current_status')}
          </div>
        </fieldset>
        <fieldset disabled={disabled} className={local.section}>
          <legend>{t.matters.parties}</legend>
          <h2 tabIndex={-1} data-relationships>
            {t.matters.parties}
          </h2>
          {parties.map((p, index) => (
            <fieldset key={index} className={local.relationship}>
              <legend>{t.matters.manage.row(index + 1)}</legend>
              <div className={local.grid}>
                <div className={styles.field}>
                  <label htmlFor={`${prefix}party-${index}`}>{t.matters.manage.partyName}</label>
                  <textarea
                    id={`${prefix}party-${index}`}
                    value={p.party_name ?? ''}
                    onChange={(e) => updateParty(index, { party_name: e.target.value })}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor={`${prefix}side-${index}`}>{t.matters.manage.side}</label>
                  <select
                    id={`${prefix}side-${index}`}
                    value={p.side}
                    onChange={(e) =>
                      updateParty(index, { side: e.target.value as 'client' | 'opponent' })
                    }
                  >
                    <option value="client">{t.fields.client}</option>
                    <option value="opponent">{t.fields.opponent}</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <label htmlFor={`${prefix}gender-${index}`}>{t.matters.manage.gender}</label>
                  <select
                    id={`${prefix}gender-${index}`}
                    value={p.gender ?? ''}
                    onChange={(e) =>
                      updateParty(index, {
                        gender: e.target.value === '' ? null : (e.target.value as 'm' | 'f'),
                      })
                    }
                  >
                    <option value="">{t.matters.manage.unknown}</option>
                    <option value="m">{t.matters.manage.male}</option>
                    <option value="f">{t.matters.manage.female}</option>
                  </select>
                </div>
              </div>
              {p.roles.map((r, ri) => (
                <fieldset key={ri} className={local.capacity}>
                  <legend>
                    {t.matters.manage.capacity} {ri + 1}
                  </legend>
                  <label htmlFor={`${prefix}capacity-${index}-${ri}`}>
                    {t.matters.manage.capacity}
                  </label>
                  <select
                    id={`${prefix}capacity-${index}-${ri}`}
                    value={r.role_id || ''}
                    onChange={(e) =>
                      updateParty(index, {
                        roles: p.roles.map((x, i) =>
                          i === ri ? { ...x, id: null, role_id: Number(e.target.value) } : x,
                        ),
                      })
                    }
                  >
                    <option value="">{t.common.notRecorded}</option>
                    {snapshot.roles
                      .filter((o) => o.active || o.id === r.role_id)
                      .map((o) => (
                        <option key={o.id} value={o.id} disabled={!o.active && o.id !== r.role_id}>
                          {p.gender === 'f' ? (o.female ?? o.male) : o.male}
                        </option>
                      ))}
                  </select>
                  {orderButtons(
                    ri,
                    p.roles.length,
                    (delta) =>
                      updateParty(index, {
                        roles: move(p.roles, ri, delta).map((x, i) => ({ ...x, ordinal: i + 1 })),
                      }),
                    () => updateParty(index, { roles: p.roles.filter((_, i) => i !== ri) }),
                  )}
                </fieldset>
              ))}
              <button
                type="button"
                onClick={() =>
                  updateParty(index, {
                    roles: [
                      ...p.roles,
                      {
                        id: null,
                        role_id: 0,
                        ordinal: Math.max(0, ...p.roles.map((r) => r.ordinal ?? 0)) + 1,
                      },
                    ],
                  })
                }
              >
                {t.matters.manage.addCapacity}
              </button>
              {orderButtons(
                index,
                parties.length,
                (delta) =>
                  setParties(move(parties, index, delta).map((x, i) => ({ ...x, ordinal: i + 1 }))),
                () => setParties(parties.filter((_, i) => i !== index)),
              )}
            </fieldset>
          ))}
          <button
            type="button"
            onClick={() =>
              setParties([
                ...parties,
                {
                  id: null,
                  side: 'client',
                  party_name: '',
                  gender: null,
                  ordinal: Math.max(0, ...parties.map((p) => p.ordinal ?? 0)) + 1,
                  roles: [],
                },
              ])
            }
          >
            {t.matters.manage.addParty}
          </button>
        </fieldset>
        <fieldset disabled={disabled} className={local.section}>
          <legend>{t.matters.assignedLawyers}</legend>
          {lawyers.length === 0 && <p>{t.matters.noLawyer}</p>}
          {lawyers.map((l, index) => (
            <fieldset className={local.relationship} key={index}>
              <legend>{t.matters.manage.row(index + 1)}</legend>
              <div className={local.grid}>
                <div className={styles.field}>
                  <label htmlFor={`${prefix}lawyer-${index}`}>{t.matters.filters.lawyer}</label>
                  <select
                    id={`${prefix}lawyer-${index}`}
                    value={l.person_id || ''}
                    onChange={(e) =>
                      updateLawyer(index, { id: null, person_id: Number(e.target.value) })
                    }
                  >
                    <option value="">{t.common.notRecorded}</option>
                    {snapshot.people
                      .filter((p) => p.active || p.id === l.person_id)
                      .map((p) => (
                        <option
                          key={p.id}
                          value={p.id}
                          disabled={!p.active && p.id !== l.person_id}
                        >
                          {t.matters.option(p.name, String(p.id))}
                          {!p.active ? ` (${t.matters.former})` : ''}
                        </option>
                      ))}
                  </select>
                </div>
                <div className={styles.field}>
                  <label htmlFor={`${prefix}role-${index}`}>{t.matters.manage.role}</label>
                  <select
                    id={`${prefix}role-${index}`}
                    value={l.role}
                    onChange={(e) =>
                      updateLawyer(index, { role: e.target.value as MatterLawyerInput['role'] })
                    }
                  >
                    {(['lead', 'co_lead', 'support'] as const).map((role) => (
                      <option key={role} value={role}>
                        {role === 'lead'
                          ? t.matters.lawyerRoles.lead
                          : role === 'co_lead'
                            ? t.matters.lawyerRoles.co_lead
                            : t.matters.lawyerRoles.support}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {orderButtons(
                index,
                lawyers.length,
                (delta) =>
                  setLawyers(
                    move(lawyers, index, delta).map((x, i) => ({ ...x, position: i + 1 })),
                  ),
                () => setLawyers(lawyers.filter((_, i) => i !== index)),
              )}
            </fieldset>
          ))}
          <button
            type="button"
            onClick={() =>
              setLawyers([
                ...lawyers,
                {
                  id: null,
                  person_id: 0,
                  role: 'support',
                  position: Math.max(0, ...lawyers.map((l) => l.position ?? 0)) + 1,
                },
              ])
            }
          >
            {t.matters.manage.addLawyer}
          </button>
        </fieldset>
        <fieldset disabled={disabled} className={local.section}>
          <legend>{t.matters.manage.optional}</legend>
          <div className={local.grid}>
            {MATTER_FIELDS.filter(
              (k) =>
                !(
                  [
                    'case_number_ar',
                    'subject',
                    'status',
                    'current_status',
                    ...MATTER_LOOKUP_FIELDS,
                  ] as readonly string[]
                ).includes(k),
            ).map(field)}
          </div>
        </fieldset>
        <p role="status">{pending ? t.matters.manage.pending : null}</p>
        <div className={local.controls}>
          <button
            className={styles.button}
            type="submit"
            disabled={pending || result?.kind === 'success'}
          >
            {t.matters.manage.save}
          </button>
          <a className={styles.link} href={original.cancel}>
            {t.matters.manage.cancel}
          </a>
        </div>
      </form>
    </main>
  );
}
