'use client';

import {
  startTransition,
  useActionState,
  useEffect,
  useId,
  useRef,
  type FormEvent,
  type RefObject,
} from 'react';
import type { EligibleStaffPerson, ManagedAccount } from '@/lib/auth/user-management';
import { t } from '@/strings';
import {
  changeRoleAction,
  correctUsernameAction,
  createUserAction,
  disableAccountAction,
  reactivateAccountAction,
  resetPasswordAction,
  type UserManagementActionState,
} from './actions';
import styles from './users.module.css';

const initialState: UserManagementActionState = {
  kind: 'idle',
  message: '',
  field: null,
  revision: 0,
};

type ManagedAction = typeof createUserAction;

function useManagedForm(action: ManagedAction) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  useEffect(() => {
    if (state.revision === 0) return;
    const form = formRef.current;
    if (!form) return;

    for (const fieldName of ['temporaryPassword', 'confirmPassword'] as const) {
      const passwordField = form.elements.namedItem(fieldName);
      if (passwordField instanceof HTMLInputElement) passwordField.value = '';
    }

    if (state.kind === 'success') form.reset();

    const focusField =
      state.kind === 'error' && state.field !== null ? form.elements.namedItem(state.field) : null;
    if (focusField instanceof HTMLElement) {
      focusField.focus();
    } else {
      feedbackRef.current?.focus();
    }
  }, [state.field, state.kind, state.revision]);

  return { state, onSubmit, pending, formRef, feedbackRef };
}

function SubmitButton({
  label,
  pending,
  danger = false,
}: {
  label: string;
  pending: boolean;
  danger?: boolean;
}) {
  return (
    <button
      className={danger ? styles.dangerButton : styles.primaryButton}
      disabled={pending}
      type="submit"
    >
      {pending ? t.users.submitting : label}
    </button>
  );
}

function Feedback({
  state,
  id,
  feedbackRef,
}: {
  state: UserManagementActionState;
  id: string;
  feedbackRef: RefObject<HTMLParagraphElement | null>;
}) {
  if (state.kind === 'idle') return <span className={styles.srOnly} id={id} />;
  return (
    <p
      ref={feedbackRef}
      className={state.kind === 'error' ? styles.error : styles.success}
      id={id}
      role={state.kind === 'error' ? 'alert' : 'status'}
      aria-live={state.kind === 'error' ? 'assertive' : 'polite'}
      tabIndex={-1}
    >
      {state.message}
    </p>
  );
}

function HiddenAccount({ account }: { account: ManagedAccount }) {
  return (
    <>
      <input name="accountId" type="hidden" value={account.id} />
      <input name="sessionVersion" type="hidden" value={account.sessionVersion} />
    </>
  );
}

function RoleOptions() {
  return Object.entries(t.auth.roles).map(([value, label]) => (
    <option key={value} value={value}>
      {label}
    </option>
  ));
}

function PasswordFields({ prefix, feedbackId }: { prefix: string; feedbackId: string }) {
  return (
    <div className={styles.fieldGrid}>
      <div className={styles.field}>
        <label htmlFor={`${prefix}-password`}>{t.users.temporaryPassword}</label>
        <input
          aria-describedby={`${prefix}-policy ${feedbackId}`}
          autoComplete="new-password"
          dir="ltr"
          id={`${prefix}-password`}
          minLength={12}
          name="temporaryPassword"
          required
          type="password"
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={`${prefix}-confirmation`}>{t.users.confirmTemporaryPassword}</label>
        <input
          aria-describedby={feedbackId}
          autoComplete="new-password"
          dir="ltr"
          id={`${prefix}-confirmation`}
          minLength={12}
          name="confirmPassword"
          required
          type="password"
        />
      </div>
      <p className={styles.hint} id={`${prefix}-policy`}>
        {t.auth.passwordPolicy}
      </p>
    </div>
  );
}

function CreateAccount({ eligibleStaff }: { eligibleStaff: readonly EligibleStaffPerson[] }) {
  const id = useId();
  const { state, onSubmit, pending, formRef, feedbackRef } = useManagedForm(createUserAction);
  const feedbackId = `${id}-feedback`;
  return (
    <section className={styles.panel} aria-labelledby={`${id}-heading`}>
      <div className={styles.sectionHeading}>
        <div>
          <h2 id={`${id}-heading`}>{t.users.createTitle}</h2>
          <p>{t.users.createDescription}</p>
        </div>
        <span className={styles.count}>{eligibleStaff.length}</span>
      </div>
      {eligibleStaff.length === 0 ? (
        <p className={styles.empty}>{t.users.noEligibleStaff}</p>
      ) : (
        <form aria-busy={pending} className={styles.form} onSubmit={onSubmit} ref={formRef}>
          <div className={styles.fieldGrid}>
            <div className={styles.field}>
              <label htmlFor={`${id}-person`}>{t.users.person}</label>
              <select aria-describedby={feedbackId} id={`${id}-person`} name="personId" required>
                <option value="">{t.users.choosePerson}</option>
                {eligibleStaff.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor={`${id}-username`}>{t.auth.username}</label>
              <input
                aria-describedby={`${id}-username-hint ${feedbackId}`}
                autoComplete="off"
                dir="ltr"
                id={`${id}-username`}
                name="username"
                pattern="[A-Za-z][A-Za-z0-9._-]{2,63}"
                required
              />
              <span className={styles.hint} id={`${id}-username-hint`}>
                {t.users.usernameHint}
              </span>
            </div>
            <div className={styles.field}>
              <label htmlFor={`${id}-role`}>{t.auth.role}</label>
              <select
                aria-describedby={feedbackId}
                defaultValue=""
                id={`${id}-role`}
                name="role"
                required
              >
                <option value="">{t.users.chooseRole}</option>
                <RoleOptions />
              </select>
            </div>
          </div>
          <PasswordFields feedbackId={feedbackId} prefix={`${id}-create`} />
          <Feedback feedbackRef={feedbackRef} id={feedbackId} state={state} />
          <SubmitButton label={t.users.actions.create} pending={pending} />
        </form>
      )}
    </section>
  );
}

function UsernameAction({ account }: { account: ManagedAccount }) {
  const id = useId();
  const { state, onSubmit, pending, formRef, feedbackRef } = useManagedForm(correctUsernameAction);
  const feedbackId = `${id}-feedback`;
  return (
    <details className={styles.action}>
      <summary>{t.users.actions.username}</summary>
      <form aria-busy={pending} className={styles.form} onSubmit={onSubmit} ref={formRef}>
        <HiddenAccount account={account} />
        <p>{t.users.confirmations.username(account.personName)}</p>
        <div className={styles.field}>
          <label htmlFor={`${id}-username`}>{t.users.newUsername}</label>
          <input
            aria-describedby={feedbackId}
            defaultValue={account.username}
            dir="ltr"
            id={`${id}-username`}
            name="username"
            pattern="[A-Za-z][A-Za-z0-9._-]{2,63}"
            required
          />
        </div>
        <Feedback feedbackRef={feedbackRef} id={feedbackId} state={state} />
        <SubmitButton
          label={t.users.actions.confirmUsername(account.personName)}
          pending={pending}
        />
      </form>
    </details>
  );
}

function RoleAction({ account }: { account: ManagedAccount }) {
  const id = useId();
  const { state, onSubmit, pending, formRef, feedbackRef } = useManagedForm(changeRoleAction);
  const feedbackId = `${id}-feedback`;
  return (
    <details className={styles.action}>
      <summary>{t.users.actions.role}</summary>
      <form aria-busy={pending} className={styles.form} onSubmit={onSubmit} ref={formRef}>
        <HiddenAccount account={account} />
        <p>{t.users.confirmations.role(account.personName)}</p>
        <div className={styles.field}>
          <label htmlFor={`${id}-role`}>{t.users.newRole}</label>
          <select
            aria-describedby={feedbackId}
            defaultValue={account.role}
            id={`${id}-role`}
            name="role"
          >
            <RoleOptions />
          </select>
        </div>
        <Feedback feedbackRef={feedbackRef} id={feedbackId} state={state} />
        <SubmitButton label={t.users.actions.confirmRole(account.personName)} pending={pending} />
      </form>
    </details>
  );
}

function DisableAction({ account }: { account: ManagedAccount }) {
  const id = useId();
  const { state, onSubmit, pending, formRef, feedbackRef } = useManagedForm(disableAccountAction);
  const feedbackId = `${id}-feedback`;
  return (
    <details className={styles.action}>
      <summary>{t.users.actions.disable}</summary>
      <form aria-busy={pending} className={styles.form} onSubmit={onSubmit} ref={formRef}>
        <HiddenAccount account={account} />
        <p>{t.users.confirmations.disable(account.personName)}</p>
        <label className={styles.confirmation}>
          <input
            aria-describedby={feedbackId}
            name="confirmation"
            required
            type="checkbox"
            value={account.id}
          />
          <span>{t.users.confirmations.disableCheckbox(account.personName)}</span>
        </label>
        <Feedback feedbackRef={feedbackRef} id={feedbackId} state={state} />
        <SubmitButton
          danger
          label={t.users.actions.confirmDisable(account.personName)}
          pending={pending}
        />
      </form>
    </details>
  );
}

function PasswordAction({ account, reactivate }: { account: ManagedAccount; reactivate: boolean }) {
  const id = useId();
  const action = reactivate ? reactivateAccountAction : resetPasswordAction;
  const { state, onSubmit, pending, formRef, feedbackRef } = useManagedForm(action);
  const feedbackId = `${id}-feedback`;
  return (
    <details className={styles.action}>
      <summary>{reactivate ? t.users.actions.reactivate : t.users.actions.password}</summary>
      <form aria-busy={pending} className={styles.form} onSubmit={onSubmit} ref={formRef}>
        <HiddenAccount account={account} />
        <p>
          {reactivate
            ? t.users.confirmations.reactivate(account.personName)
            : t.users.confirmations.password(account.personName)}
        </p>
        <PasswordFields feedbackId={feedbackId} prefix={`${id}-password`} />
        <Feedback feedbackRef={feedbackRef} id={feedbackId} state={state} />
        <SubmitButton
          label={
            reactivate
              ? t.users.actions.confirmReactivate(account.personName)
              : t.users.actions.confirmPassword(account.personName)
          }
          pending={pending}
        />
      </form>
    </details>
  );
}

function dateTime(value: string | null): string {
  if (!value) return t.common.notRecorded;
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function roleLabel(role: ManagedAccount['role']): string {
  switch (role) {
    case 'Administrator':
      return t.auth.roles.Administrator;
    case 'Litigation Assistant':
      return t.auth.roles['Litigation Assistant'];
    case 'Lawyer':
      return t.auth.roles.Lawyer;
    case 'Paralegal':
      return t.auth.roles.Paralegal;
  }
}

function AccountCard({
  account,
  currentAccountId,
}: {
  account: ManagedAccount;
  currentAccountId: number;
}) {
  const isCurrent = account.id === currentAccountId;
  const role = roleLabel(account.role);
  const lockText = account.isLocked
    ? t.users.states.lockedUntil(dateTime(account.lockedUntil))
    : t.users.states.notLocked;
  const passwordState = !account.passwordInitialized
    ? t.users.states.passwordMissing
    : account.mustChangePassword
      ? t.users.states.passwordTemporary
      : t.users.states.passwordReady;
  return (
    <li className={styles.accountCard}>
      <header className={styles.accountHeader}>
        <div>
          <h3>{account.personName}</h3>
          <p className={styles.username} dir="ltr">
            {account.username}
          </p>
        </div>
        <span className={account.isEnabled ? styles.enabled : styles.disabled}>
          {account.isEnabled ? t.users.states.enabled : t.users.states.disabled}
        </span>
      </header>
      <dl className={styles.facts}>
        <div>
          <dt>{t.auth.role}</dt>
          <dd>{role}</dd>
        </div>
        <div>
          <dt>{t.users.passwordState}</dt>
          <dd>{passwordState}</dd>
        </div>
        <div>
          <dt>{t.users.lockState}</dt>
          <dd>{lockText}</dd>
        </div>
        <div>
          <dt>{t.users.lastLogin}</dt>
          <dd className={styles.ltrData} dir="ltr">
            {dateTime(account.lastLoginAt)}
          </dd>
        </div>
      </dl>
      {isCurrent ? <p className={styles.selfNotice}>{t.users.selfNotice}</p> : null}
      <div className={styles.actions}>
        <UsernameAction account={account} />
        {!isCurrent ? <RoleAction account={account} /> : null}
        {account.isEnabled && !isCurrent ? <DisableAction account={account} /> : null}
        {account.isEnabled && !isCurrent ? (
          <PasswordAction account={account} reactivate={false} />
        ) : null}
        {!account.isEnabled ? <PasswordAction account={account} reactivate /> : null}
      </div>
    </li>
  );
}

export function UserManagement({
  accounts,
  eligibleStaff,
  currentAccountId,
}: {
  accounts: readonly ManagedAccount[];
  eligibleStaff: readonly EligibleStaffPerson[];
  currentAccountId: number;
}) {
  return (
    <div className={styles.content}>
      <CreateAccount eligibleStaff={eligibleStaff} />
      <section className={styles.panel} aria-labelledby="accounts-heading">
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="accounts-heading">{t.users.accountsTitle}</h2>
            <p>{t.users.accountsDescription}</p>
          </div>
          <span className={styles.count}>{accounts.length}</span>
        </div>
        <ul className={styles.accountList}>
          {accounts.map((account) => (
            <AccountCard account={account} currentAccountId={currentAccountId} key={account.id} />
          ))}
        </ul>
      </section>
    </div>
  );
}
