'use client';
import { useRef, useState } from 'react';
import type { SelectionMatter, SelectionHearing, SelectionInput } from '@/lib/reports/selection';
import { t } from '@/strings';
import styles from '../reports.module.css';
import { saveSelectionAction } from './actions';

export function SelectionEditor({
  client,
  matter,
  hearings,
  canEdit,
}: {
  client: number;
  matter: SelectionMatter;
  hearings: SelectionHearing[];
  canEdit: boolean;
}) {
  const [selected, setSelected] = useState(matter.selected);
  const [hearing, setHearing] = useState<number | null>(matter.hearingId);
  const [version, setVersion] = useState(matter.version);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
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
      if (result.ok) {
        setVersion(result.version);
        pending.current = null;
      }
    } catch {
      setMessage(t.reportSelection.errors.generic);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => summary.current?.focus());
    }
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      aria-busy={busy}
    >
      <div ref={summary} tabIndex={-1} role="status" aria-live="polite" className={styles.summary}>
        {message}
      </div>
      <p id="selection-help">{t.reportSelection.help}</p>
      {!canEdit ? <p>{t.reportSelection.readOnly}</p> : null}
      {matter.archived || matter.hearingArchived ? <p>{t.reportSelection.archive}</p> : null}
      <fieldset disabled={disabled || busy} aria-describedby="selection-help">
        <legend>
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
                  ({h.id}) {h.date ?? t.clientReports.undated}
                  {'\n'}
                  {h.action ?? ''}
                  {'\n'}
                  {h.court ?? ''}
                  {'\n'}
                  {h.circuit ?? ''}
                  {'\n'}
                  {h.decision ?? t.reports.nullValue}
                  {h.archived ? '\n' + t.reportSelection.archive : ''}
                </span>
              </label>
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
