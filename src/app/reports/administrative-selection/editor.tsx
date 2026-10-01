'use client';
import { useRef, useState } from 'react';
import type {
  AdministrativeSelectionInput,
  AdministrativeSelectionKind,
  AdministrativeSelectionParent,
  AdministrativeSelectionRecord,
} from '@/lib/reports/administrative-selection';
import { useDirtyNavigation } from '@/app/_components/use-dirty-navigation';
import { t } from '@/strings';
import { ReportLabelParts } from '../label-parts';
import styles from '../reports.module.css';
import { saveAdministrativeSelectionAction } from './actions';

export function AdministrativeSelectionEditor({
  kind,
  client,
  parent,
  records,
  canEdit,
  reload,
}: {
  kind: AdministrativeSelectionKind;
  client: number;
  parent: AdministrativeSelectionParent;
  records: AdministrativeSelectionRecord[];
  canEdit: boolean;
  reload: string;
}) {
  const [rows, setRows] = useState(() =>
    Object.fromEntries(
      records.map((r) => [
        r.id,
        {
          id: r.id,
          selected: r.selected,
          saved: r.selected,
          version: r.version,
          message: '',
          error: false,
          uncertain: false,
        },
      ]),
    ),
  );
  const [busy, setBusy] = useState<number | null>(null);
  const pending = useRef(new Map<number, AdministrativeSelectionInput>());
  const summaries = useRef(new Map<number, HTMLDivElement>());
  useDirtyNavigation(Object.values(rows).some((r) => r.selected !== r.saved || r.uncertain));
  function rowState(current: typeof rows, id: number) {
    const found = Object.values(current).find((row) => row.id === id);
    if (!found) throw new Error('Selection draft identity differs');
    return found;
  }
  async function save(record: AdministrativeSelectionRecord) {
    if (busy !== null || !canEdit || parent.archived || record.archived) return;
    const draft = rowState(rows, record.id);
    const input =
      pending.current.get(record.id) ??
      ({
        scope: kind === 'hearing' ? 'administrative-hearing' : 'administrative-step',
        client,
        parent: parent.id,
        id: record.id,
        version: draft.version,
        parentVersion: parent.version,
        recordVersion: record.recordVersion,
        selected: draft.selected,
        submission: crypto.randomUUID(),
      } satisfies AdministrativeSelectionInput);
    pending.current.set(record.id, input);
    setBusy(record.id);
    try {
      const result = await saveAdministrativeSelectionAction(input);
      if (result.ok) {
        setRows((current) => ({
          ...current,
          [record.id]: {
            ...rowState(current, record.id),
            version: result.version,
            saved: input.selected,
            selected: input.selected,
            message: result.message,
            error: false,
            uncertain: false,
          },
        }));
        pending.current.delete(record.id);
      } else {
        const uncertain = result.code === 'generic';
        setRows((current) => ({
          ...current,
          [record.id]: {
            ...rowState(current, record.id),
            message: result.message,
            error: true,
            uncertain,
          },
        }));
        if (!uncertain) pending.current.delete(record.id);
      }
    } catch {
      setRows((current) => ({
        ...current,
        [record.id]: {
          ...rowState(current, record.id),
          message: t.reportSelection.errors.generic,
          error: true,
          uncertain: true,
        },
      }));
    } finally {
      setBusy(null);
      requestAnimationFrame(() => summaries.current.get(record.id)?.focus());
    }
  }
  return (
    <section className={styles.selectionList} aria-label={t.administrativeSelection.title}>
      {!canEdit ? <p className={styles.guidance}>{t.administrativeSelection.readOnly}</p> : null}
      {parent.archived ? (
        <p className={styles.guidance}>{t.administrativeSelection.archived}</p>
      ) : null}
      {records.length === 0 ? <p>{t.administrativeSelection.empty}</p> : null}
      {records.map((record) => {
        const state = rowState(rows, record.id),
          disabled = !canEdit || parent.archived || record.archived;
        return (
          <form
            key={record.id}
            className={styles.selectionEditor}
            aria-busy={busy === record.id}
            onSubmit={(event) => {
              event.preventDefault();
              void save(record);
            }}
          >
            <h2>
              {kind === 'hearing' ? t.reportSelection.hearing : t.adminWorks.steps}{' '}
              <bdi>({record.id})</bdi>
            </h2>
            <ReportLabelParts
              parts={[
                {
                  label: kind === 'hearing' ? t.fields.hearingDate : t.adminWorks.stepDate,
                  value: record.date ?? t.reports.nullValue,
                },
                ...(kind === 'hearing'
                  ? [
                      { label: t.fields.court, value: record.court ?? t.reports.nullValue },
                      { label: t.fields.circuit, value: record.circuit ?? t.reports.nullValue },
                      { label: t.hearings.action, value: record.action ?? t.reports.nullValue },
                    ]
                  : [{ label: t.adminWorks.person, value: record.person ?? t.reports.nullValue }]),
                {
                  label: kind === 'hearing' ? t.reportSelection.decision : t.adminWorks.result,
                  value: record.text ?? t.reports.nullValue,
                },
              ]}
            />
            <p>
              {t.ui.savedChoice}: {state.saved ? t.reports.trueValue : t.reports.falseValue}
            </p>
            {state.selected !== state.saved ? (
              <p className={styles.guidance}>{t.ui.draft}</p>
            ) : null}
            {record.archived ? <p>{t.reportSelection.archive}</p> : null}
            <div
              ref={(element) => {
                if (element) summaries.current.set(record.id, element);
                else summaries.current.delete(record.id);
              }}
              role="status"
              aria-live="polite"
              tabIndex={-1}
              className={
                state.message
                  ? state.error
                    ? styles.errorNotice
                    : styles.successNotice
                  : undefined
              }
            >
              {state.message}
            </div>
            {state.uncertain ? <p>{t.administrativeSelection.uncertain}</p> : null}
            <label>
              <input
                type="checkbox"
                name="selected"
                checked={state.selected}
                disabled={disabled || busy !== null || state.uncertain}
                onChange={(event) => {
                  const selected = event.target.checked;
                  setRows((current) => ({
                    ...current,
                    [record.id]: {
                      ...rowState(current, record.id),
                      selected,
                      message: '',
                      error: false,
                    },
                  }));
                }}
              />
              {t.administrativeSelection.include}
            </label>
            {canEdit ? (
              <div className={styles.actions}>
                <button
                  type="submit"
                  disabled={
                    disabled ||
                    busy !== null ||
                    (state.selected === state.saved && !state.uncertain)
                  }
                >
                  {t.reportSelection.save}
                </button>
                {state.error && !state.uncertain ? (
                  <a href={reload}>{t.reportSelection.reload}</a>
                ) : null}
              </div>
            ) : null}
          </form>
        );
      })}
    </section>
  );
}
