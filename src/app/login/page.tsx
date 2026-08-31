import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { AuthShell } from '@/app/_components/auth-shell';
import { t } from '@/strings';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: t.auth.loginTitle };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ changed?: string }>;
}) {
  const session = await auth();
  if (session) redirect(session.user.mustChangePassword ? '/change-password' : '/');
  const parameters = await searchParams;
  return (
    <AuthShell title={t.auth.loginTitle} subtitle={t.auth.loginSubtitle}>
      <LoginForm status={parameters.changed === '1' ? t.auth.passwordChangedStatus : undefined} />
    </AuthShell>
  );
}
