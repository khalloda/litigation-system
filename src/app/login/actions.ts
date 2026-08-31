'use server';

import { signIn } from '@/auth';
import { t } from '@/strings';

export type LoginState = { error: string };

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  try {
    await signIn('credentials', {
      username: formData.get('username'),
      password: formData.get('password'),
      rememberMe: formData.get('rememberMe'),
      redirect: false,
    });
  } catch {
    return { error: t.auth.invalidCredentials };
  }

  const { redirect } = await import('next/navigation');
  return redirect('/');
}
