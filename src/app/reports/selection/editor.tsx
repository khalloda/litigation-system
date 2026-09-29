'use client';
import { useRef, useState } from 'react';
import type { SelectionMatter, SelectionHearing, SelectionInput } from '@/lib/reports/selection';
import { t } from '@/strings';
import styles from '../reports.module.css';
import { saveSelectionAction } from './actions';
import { useDirtyNavigation } from '@/app/_components/use-dirty-navigation';

export function SelectionEditor({
  client,
  matter,
  hearings,
  canEdit,
  latest,
}: {
  client: number;
  matter: SelectionMatter;
  hearings: SelectionHearing[];
  canEdit: boolean;
  latest: React.ReactNode;
}) {
  const [selected, setSelected] = useState(matter.selected);
  const [hearing, setHearing] = useState<number | null>(matter.hearingId);
  const [version, setVersion] = useState(matter.version);
  const [saved, setSaved] = useState({ selected: matter.selected, hearing: matter.hearingId });
  const dirty = selected !== saved.selected || hearing !== saved.hearing;
  useDirtyNavigation(dirty);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [outcome, setOutcome] = useState<'success' | 'error' | ''>('');
  const pending = useRef<SelectionInput | null>(null);
  const summary = useRef<HTMLDivElement>(null);
  const disabled = !canEdit || matter.archived;
  // Preserve an out-of-page current choice; changing pages never silently chooses another hearing.
  const choices =
    hearings.some((h) => h.id === matter.hearingId) || matter.hearingId === null
      ? hearings
      : [
          {
            id: matter.hearingId,
            version: matter.hearingVersion!,
            date: matter.date,
            decision: matter.decision,
            court: null,
            circuit: null,
            action: null,
            archived: matter.hearingArchived ?? false,
          },
          ...hearings,
        ];
  function changed() {
    pending.current = null;
    setMessage('');
    setOutcome('');
  }
  async function save() {
    if (disabled || busy) return;
    pending.current ??= {
      client,
      id: matter.id,
      version,
      matterVersion: matter.matterVersion,
      hearingId: hearing,
      hearingVersion: hearing === null ? null : choices.find((h) => h.id === hearing)!.version,
      selected,
      submission: crypto.randomUUID(),
    };
    setBusy(true);
    try {
      const result = await saveSelectionAction(pending.current);
      setMessage(result.message);
      setOutcome(result.ok ? 'success' : 'error');
      if (result.ok) {
        setVersion(result.version);
        setSaved({ selected, hearing });
        pending.current = null;
      }
    } catch {
      setMessage(t.reportSelection.errors.generic);
      setOutcome('error');
    } finally {
      setBusy(false);
      requestAnimationFrame(() => summary.current?.focus());
    }
  }
  return (
    <form
      className={styles.selectionEditor}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      aria-busy={busy}
    >
      <div
        ref={summary}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        className={`${styles.summary} ${message ? (outcome === 'error' ? styles.errorNotice : styles.successNotice) : ''}`}
      >
        {message}
      </div>
      {dirty ? (
        <p role="status" className={styles.guidance}>
          {t.ui.draft}
        </p>
      ) : null}
      {!canEdit ? <p className={styles.guidance}>{t.reportSelection.readOnly}</p> : null}
      {matter.archived || matter.hearingArchived ? (
        <p className={styles.guidance}>{t.reportSelection.archive}</p>
      ) : null}
      <fieldset disabled={disabled || busy} aria-describedby="selection-help">
        <legend className={styles.srOnly}>
          {t.reportSelection.title} ({matter.id})
        </legend>
        <label>
          <input
            type="checkbox"
            name="selected"
            checked={selected}
            onChange={(e) => {
              changed();
              setSelected(e.target.checked);
            }}
          />
          {t.reportSelection.include}
        </label>
        <p className={styles.guidance}>
          {t.ui.savedChoice}: {saved.selected ? t.reports.trueValue : t.reports.falseValue} ·{' '}
          {saved.hearing ?? t.reportSelection.none}
          {saved.hearing !== null ? (
            <>
              <br />
              <bdi>
                {choices.find((h) => h.id === saved.hearing)?.date ?? t.clientReports.undated}
              </bdi>
              {' · '}
              {choices.find((h) => h.id === saved.hearing)?.court ?? t.common.notRecorded}
            </>
          ) : null}
        </p>

        {latest}
        <p id="selection-help" className={styles.hint}>
          {t.reportSelection.help}
        </p>
        <fieldset>
          <legend>{t.reportSelection.hearing}</legend>
          <p>{t.reports.identityHelp}</p>
          <label>
            <input
              type="radio"
              name="hearing"
              checked={hearing === null}
              onChange={() => {
                changed();
                setHearing(null);
              }}
            />
            {t.reportSelection.none}
          </label>
          {choices.map((h) => (
            <div key={h.id} className={styles.choice}>
              <label>
                <input
                  type="radio"
                  name="hearing"
                  value={h.id}
                  checked={hearing === h.id}
                  disabled={h.archived}
                  onChange={() => {
                    changed();
                    setHearing(h.id);
                  }}
                />
                <span dir="auto">
                  {saved.hearing === h.id ? `${t.ui.savedChoice} · ` : ''}({h.id}){' '}
                  {h.date ?? t.clientReports.undated}
                  {h.archived ? ' · ' + t.reportSelection.archive : ''}
                </span>
              </label>
              <div className={styles.choiceBody}>
                <p dir="auto">{h.action ?? t.common.notRecorded}</p>
                <p dir="auto">
                  {h.court ?? t.common.notRecorded}
                  {h.circuit ? ` · ${h.circuit}` : ''}
                </p>
                <p className={styles.hint}>{t.reportSelection.decision}</p>
                <p dir="auto">{h.decision ?? t.reports.nullValue}</p>
              </div>
            </div>
          ))}
        </fieldset>
        <div className={styles.actions}>
          <button type="submit">{t.reportSelection.save}</button>
        </div>
      </fieldset>
      <p>
        <a href={`/reports/selection?client=${client}&id=${matter.id}`}>
          {t.reportSelection.reload}
        </a>
      </p>
    </form>
  );
}
