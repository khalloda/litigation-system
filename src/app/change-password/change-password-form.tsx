'use client';

import { useActionState } from 'react';
import { t } from '@/strings';
import styles from '../auth.module.css';
import { changePasswordAction, type PasswordChangeState } from './actions';

const INITIAL_PASSWORD_CHANGE_STATE: PasswordChangeState = { error: '' };

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(
    changePasswordAction,
    INITIAL_PASSWORD_CHANGE_STATE,
  );
  return (
    <form className={styles.form} action={action} noValidate>
      {state.error ? (
        <p className={styles.error} role="alert" aria-live="assertive">
          {state.error}
        </p>
      ) : null}
      <div className={styles.field}>
        <label htmlFor="currentPassword">{t.auth.currentPassword}</label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          dir="ltr"
          required
          autoFocus
          disabled={pending}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="newPassword">{t.auth.newPassword}</label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          dir="ltr"
          required
          aria-describedby="password-policy"
          disabled={pending}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="confirmPassword">{t.auth.confirmPassword}</label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          dir="ltr"
          required
          aria-describedby="password-policy"
          disabled={pending}
        />
      </div>
      <p className={styles.hint} id="password-policy">
        {t.auth.passwordPolicy}
      </p>
      <button className={styles.primaryButton} type="submit" disabled={pending}>
        {pending ? t.auth.changing : t.auth.changeSubmit}
      </button>
    </form>
  );
}
