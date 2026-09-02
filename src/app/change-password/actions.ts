'use server';

import { auth, signOut } from '@/auth';
import { createServerActionAuditMetadata } from '@/lib/audit-metadata';
import { changeOwnPassword } from '@/lib/auth/service';
import { t } from '@/strings';
import { headers } from 'next/headers';

export type PasswordChangeState = { error: string };

export async function changePasswordAction(
  _previous: PasswordChangeState,
  formData: FormData,
): Promise<PasswordChangeState> {
  const session = await auth();
  if (!session) return { error: t.auth.passwordChangeFailed };
  const currentPassword = String(formData.get('currentPassword') ?? '');
  const newPassword = String(formData.get('newPassword') ?? '');
  const confirmation = String(formData.get('confirmPassword') ?? '');
  if (newPassword !== confirmation) return { error: t.auth.passwordMismatch };

  const result = await changeOwnPassword(
    {
      accountId: Number(session.user.id),
      sessionVersion: session.user.sessionVersion,
      currentPassword,
      newPassword,
    },
    {
      auditMetadata: createServerActionAuditMetadata(await headers(), session.user.auditSessionId),
    },
  );
  if (result === 'policy') return { error: t.auth.passwordTooShort };
  if (result === 'reused') return { error: t.auth.passwordReused };
  if (result !== 'changed') return { error: t.auth.passwordChangeFailed };

  await signOut({ redirect: false });
  const { redirect } = await import('next/navigation');
  return redirect('/login?changed=1');
}
