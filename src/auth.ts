import NextAuth, { type NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { encode as encodeJwt, decode as decodeJwt } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import { REMEMBERED_SESSION_SECONDS } from '@/lib/auth/constants';
import { authenticateCredentials, type AuthenticatedUser } from '@/lib/auth/service';
import { createSessionClaims, readSessionClaims, validateSessionClaims } from '@/lib/auth/session';
import { t } from '@/strings';

function requireAuthSecret(override?: string): string {
  const secret = override ?? process.env['AUTH_SECRET'];
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32 || secret.startsWith('replace_')) {
    throw new Error('AUTH_SECRET must contain at least 32 random bytes; see .env.example.');
  }
  return secret;
}

function redirect(requestUrl: URL, pathname: string): NextResponse {
  return NextResponse.redirect(new URL(pathname, requestUrl));
}

export function createAuthConfig(
  options: { secret?: string; secure?: boolean } = {},
): NextAuthConfig {
  const secure = options.secure ?? process.env.NODE_ENV === 'production';
  return {
    secret: requireAuthSecret(options.secret),
    trustHost: true,
    providers: [
      Credentials({
        credentials: {
          username: { label: t.auth.username, type: 'text' },
          password: { label: t.auth.password, type: 'password' },
          rememberMe: { label: t.auth.rememberMe, type: 'checkbox' },
        },
        authorize: (credentials) => authenticateCredentials(credentials),
      }),
    ],
    pages: { signIn: '/login' },
    session: { strategy: 'jwt', maxAge: REMEMBERED_SESSION_SECONDS, updateAge: 0 },
    useSecureCookies: secure,
    cookies: {
      sessionToken: {
        name: secure ? '__Secure-authjs.session-token' : 'authjs.session-token',
        options: { httpOnly: true, sameSite: 'lax', path: '/', secure },
      },
    },
    jwt: {
      maxAge: REMEMBERED_SESSION_SECONDS,
      decode: decodeJwt,
      async encode(parameters) {
        const claims = parameters.token ? readSessionClaims(parameters.token) : null;
        const remaining = claims
          ? Math.max(1, Math.ceil((claims.absoluteExpiresAt - Date.now()) / 1_000))
          : parameters.maxAge;
        return encodeJwt({ ...parameters, maxAge: remaining });
      },
    },
    callbacks: {
      async jwt({ token, user }) {
        if (user) {
          const claims = createSessionClaims(user as AuthenticatedUser);
          return { sub: String(claims.userId), ...claims };
        }
        const claims = await validateSessionClaims(token);
        return claims ? { sub: String(claims.userId), ...claims } : null;
      },
      session({ session, token }) {
        const claims = readSessionClaims(token);
        if (!claims) return session;
        return {
          expires: new Date(claims.absoluteExpiresAt).toISOString(),
          user: {
            id: String(claims.userId),
            personId: claims.personId,
            username: claims.username,
            name: claims.displayName,
            role: claims.role,
            mustChangePassword: claims.mustChangePassword,
            sessionVersion: claims.sessionVersion,
          },
        };
      },
      authorized({ auth, request }) {
        const path = request.nextUrl.pathname;
        if (path === '/login') {
          if (!auth) return true;
          return redirect(request.nextUrl, auth.user.mustChangePassword ? '/change-password' : '/');
        }
        if (!auth) return redirect(request.nextUrl, '/login');
        if (auth.user.mustChangePassword && path !== '/change-password') {
          return redirect(request.nextUrl, '/change-password');
        }
        if (!auth.user.mustChangePassword && path === '/change-password') {
          return redirect(request.nextUrl, '/');
        }
        return true;
      },
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => createAuthConfig());
