'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { hasPermission } from '@/lib/auth/permissions';
import type { LogoState, LogoVersion, LogoAction } from '@/lib/client-logo-management';
import { t } from '@/strings';
import { ClientLogo } from './client-logo';
import styles from '../staff/staff.module.css';
import local from './clients.module.css';

function VersionPreview({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <p>{t.logos.errors.storage}</p>
  ) : (
    <div className={local.logo}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={t.logos.previewAlt} onError={() => setFailed(true)} />
    </div>
  );
}

export function LogoManager({
  initial,
  role,
  back,
}: {
  initial: LogoState;
  role: string;
  back: string;
}) {
  const [state, setState] = useState(initial);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const [confirmation, setConfirmation] = useState<{
    action: LogoAction;
    target: LogoVersion | null;
  } | null>(null);
  const draft = useRef({
    version: initial.version,
    clientVersion: initial.clientVersion,
    submission: '',
  });
  const input = useRef<HTMLInputElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const submissionAction = useRef('');
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const base = `/clients/${state.clientId}/logo`;
  const mayUpload =
    hasPermission(role, 'clientLogoUpload', state.current ? 'update' : 'create') &&
    !state.clientArchived &&
    !state.archived;
  const mayRestore = hasPermission(role, 'clientLogoUpload', 'restore') && !state.clientArchived;
  const invalidFile =
    error && (message === t.logos.errors.invalid || message === t.logos.errors.size);
  const fail = (text: string) => {
    setError(true);
    setMessage(text);
    requestAnimationFrame(() => status.current?.focus());
  };
  const clear = () => {
    setFile(null);
    setPreview(null);
    if (input.current) input.current.value = '';
    draft.current.submission = '';
  };
  async function load(currentPage: number, refresh: boolean) {
    const response = await fetch(`${base}/state?page=${currentPage}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(t.logos.errors.session);
    const next: LogoState = await response.json();
    setState((old) => (refresh ? next : { ...old, rows: next.rows, total: next.total }));
    setPage(currentPage);
    if (refresh)
      draft.current = { version: next.version, clientVersion: next.clientVersion, submission: '' };
  }
  async function makePreview() {
    if (!file) {
      fail(t.logos.errors.invalid);
      return;
    }
    setBusy(true);
    setError(false);
    setMessage(t.logos.pending);
    try {
      const data = new FormData();
      data.set('file', file);
      const response = await fetch(`${base}/preview`, { method: 'POST', body: data });
      if (!response.ok) {
        const result = await response.json();
        fail(result.message ?? t.logos.errors.invalid);
        return;
      }
      setPreview(URL.createObjectURL(await response.blob()));
      setMessage('');
    } catch {
      fail(t.logos.errors.uncertain);
    } finally {
      setBusy(false);
    }
  }
  function confirm(action: LogoAction, target: LogoVersion | null, element: HTMLElement) {
    trigger.current = element;
    setConfirmation({ action, target });
    dialog.current?.showModal();
  }
  function close() {
    dialog.current?.close();
    setConfirmation(null);
    trigger.current?.focus();
  }
  async function save() {
    if (!confirmation || busy) return;
    const operation = confirmation;
    setBusy(true);
    setError(false);
    setMessage(t.logos.pending);
    close();
    try {
      const identity = `${operation.action}:${operation.target?.id ?? ''}`;
      if (!draft.current.submission || submissionAction.current !== identity)
        draft.current.submission = crypto.randomUUID();
      submissionAction.current = identity;
      const data = new FormData();
      data.set('version', draft.current.version);
      data.set('clientVersion', draft.current.clientVersion);
      data.set('submission', draft.current.submission);
      if (operation.target) data.set('target', operation.target.id);
      if (operation.action === 'create' || operation.action === 'update') {
        if (!file || !preview) throw new Error();
        data.set('file', file);
      }
      const response = await fetch(
        `${base}/${operation.action === 'create' ? 'upload' : operation.action === 'update' ? 'replace' : operation.action}`,
        { method: 'POST', body: data },
      );
      const result = await response.json();
      if (!response.ok) {
        fail(result.message ?? t.logos.errors.uncertain);
        return;
      }
      await load(page, true);
      clear();
      setMessage(result.changed || result.replayed ? t.logos.success : t.logos.unchanged);
      requestAnimationFrame(() => status.current?.focus());
    } catch {
      fail(t.logos.errors.uncertain);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{t.logos.title}</p>
          <h1 dir="auto">{state.clientName}</h1>
          <p>
            {t.clients.systemId}: {state.clientId}
          </p>
          <Link className={styles.link} href={back}>
            {t.logos.back}
          </Link>
        </div>
        <ClientLogo
          key={`${state.version}:${state.archived}`}
          id={state.clientId}
          name={state.clientName}
          version={state.version}
          archived={state.archived}
        />
      </header>
      <p
        id="logo-feedback"
        ref={status}
        tabIndex={-1}
        role={error ? 'alert' : 'status'}
        className={styles.hint}
      >
        {message}
      </p>
      {state.clientArchived ? <p className={styles.panel}>{t.clients.archivedNotice}</p> : null}
      {state.archived ? <p className={styles.panel}>{t.logos.archived}</p> : null}
      {mayUpload ? (
        <section className={styles.panel} aria-label={t.logos.title}>
          <div className={styles.field}>
            <label htmlFor="logo-file">{t.logos.file}</label>
            <p id="logo-help" className={styles.hint}>
              {t.logos.hint}
            </p>
            <input
              ref={input}
              id="logo-file"
              type="file"
              accept="image/png,image/jpeg,image/gif"
              aria-describedby={invalidFile ? 'logo-help logo-feedback' : 'logo-help'}
              aria-invalid={invalidFile || undefined}
              disabled={busy}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setPreview(null);
                draft.current.submission = '';
                setMessage('');
              }}
            />
          </div>
          <div className={styles.actions}>
            <button
              className={styles.button}
              type="button"
              disabled={busy || !file}
              onClick={() => void makePreview()}
            >
              {t.logos.preview}
            </button>
            <button className={styles.link} type="button" disabled={busy} onClick={clear}>
              {t.logos.cancel}
            </button>
          </div>
          {preview ? (
            <div className={local.logo}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt={t.logos.previewAlt} />
            </div>
          ) : null}
          {preview ? (
            <>
              <p>{t.logos.replacementHint}</p>
              <button
                className={styles.button}
                type="button"
                disabled={busy}
                onClick={(event) =>
                  confirm(state.current ? 'update' : 'create', null, event.currentTarget)
                }
              >
                {state.current ? t.logos.replace : t.logos.save}
              </button>
            </>
          ) : null}
        </section>
      ) : null}
      {mayRestore && state.current && !state.archived ? (
        <section className={styles.panel}>
          <p>{t.logos.archiveHint}</p>
          <button
            className={styles.button}
            disabled={busy}
            onClick={(event) => confirm('archive', state.current, event.currentTarget)}
          >
            {t.logos.archive}
          </button>
        </section>
      ) : null}
      {hasPermission(role, 'clientLogoUpload', 'restore') ? (
        <section className={styles.panel} aria-label={t.logos.history}>
          <h2>{t.logos.history}</h2>
          <p>{t.logos.historyHint}</p>
          {!state.rows.length ? (
            <p>{t.logos.empty}</p>
          ) : (
            <ul className={styles.list}>
              {state.rows.map((item) => (
                <li className={styles.row} key={item.id}>
                  <div className={local.multiline}>
                    <p dir="auto">{item.original_name}</p>
                    <p>{item.origin === 'import' ? t.logos.imported : t.logos.uploaded}</p>
                    <p>
                      <bdi>{item.registered_at}</bdi>
                    </p>
                    <p>
                      <bdi>{item.id}</bdi>
                    </p>
                    {item.id === state.current?.id && !state.archived ? (
                      <p>{t.logos.current}</p>
                    ) : null}
                  </div>
                  {mayRestore && (state.archived || item.id !== state.current?.id) ? (
                    <button
                      className={styles.button}
                      disabled={busy}
                      onClick={(event) => confirm('restore', item, event.currentTarget)}
                    >
                      {t.logos.restore}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <div className={styles.actions}>
            <button
              className={styles.link}
              disabled={busy || page === 1}
              onClick={() => void load(page - 1, false).catch(() => fail(t.logos.errors.uncertain))}
            >
              {t.logos.previous}
            </button>
            <button
              className={styles.link}
              disabled={busy || page * 25 >= state.total}
              onClick={() => void load(page + 1, false).catch(() => fail(t.logos.errors.uncertain))}
            >
              {t.logos.next}
            </button>
          </div>
        </section>
      ) : null}
      <button
        className={styles.link}
        disabled={busy}
        onClick={() =>
          void load(page, true)
            .then(() => {
              setMessage('');
              setError(false);
            })
            .catch(() => fail(t.logos.errors.uncertain))
        }
      >
        {t.logos.reload}
      </button>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="logo-confirm-title"
        aria-describedby="logo-confirm-consequence"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        <h2 id="logo-confirm-title">
          {confirmation?.action === 'archive'
            ? t.logos.archive
            : confirmation?.action === 'restore'
              ? t.logos.restore
              : t.logos.save}
        </h2>
        <p dir="auto">{state.clientName}</p>
        <p>
          {t.clients.systemId}: {state.clientId}
        </p>
        <p dir="auto">{confirmation?.target?.original_name ?? file?.name}</p>
        <p>
          <bdi>{confirmation?.target?.id}</bdi>
        </p>
        {confirmation?.target ? (
          <>
            <p>
              <bdi>{confirmation.target.registered_at}</bdi>
            </p>
            <VersionPreview
              key={confirmation.target.id}
              url={`${base}/version?id=${confirmation.target.id}`}
            />
          </>
        ) : null}
        <p id="logo-confirm-consequence">
          {confirmation?.action === 'archive' ? t.logos.archiveHint : t.logos.replacementHint}
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.link} onClick={close}>
            {t.logos.cancel}
          </button>
          <button
            type="button"
            className={styles.button}
            onClick={() => void save()}
            disabled={busy}
          >
            {t.logos.confirm}
          </button>
        </div>
      </dialog>
    </main>
  );
}
