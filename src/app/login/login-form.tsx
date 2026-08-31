'use client';

import { useActionState } from 'react';
import { t } from '@/strings';
import styles from '../auth.module.css';
import { loginAction, type LoginState } from './actions';

const INITIAL_LOGIN_STATE: LoginState = { error: '' };

export function LoginForm({ status }: { status?: string }) {
  const [state, action, pending] = useActionState(loginAction, INITIAL_LOGIN_STATE);
  return (
    <form className={styles.form} action={action} noValidate>
      {status ? (
        <p className={styles.success} role="status">
          {status}
        </p>
      ) : null}
      {state.error ? (
        <p className={styles.error} role="alert" aria-live="assertive">
          {state.error}
        </p>
      ) : null}
      <div className={styles.field}>
        <label htmlFor="username">{t.auth.username}</label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          dir="ltr"
          required
          autoFocus
          disabled={pending}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="password">{t.auth.password}</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          dir="ltr"
          required
          disabled={pending}
        />
      </div>
      <label className={styles.checkbox}>
        <input name="rememberMe" type="checkbox" value="true" disabled={pending} />
        <span>{t.auth.rememberMe}</span>
      </label>
      <p className={styles.hint}>{t.auth.normalSessionNote}</p>
      <button className={styles.primaryButton} type="submit" disabled={pending}>
        {pending ? t.auth.submitting : t.auth.submit}
      </button>
    </form>
  );
}
