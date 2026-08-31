import type { Session } from 'next-auth';
import { hasPermission, type PermissionAction, type PermissionArea } from './permissions';

export type AuthorizationDenial = 'unauthenticated' | 'password-change-required' | 'forbidden';

export type AuthorizationDecision =
  { allowed: true; session: Session } | { allowed: false; reason: AuthorizationDenial };

export function decideAuthorization(
  session: Session | null,
  area: unknown,
  action: unknown,
): AuthorizationDecision {
  if (!session) return { allowed: false, reason: 'unauthenticated' };
  if (session.user.mustChangePassword) {
    return { allowed: false, reason: 'password-change-required' };
  }
  if (!hasPermission(session.user.role, area, action)) {
    return { allowed: false, reason: 'forbidden' };
  }
  return { allowed: true, session };
}

export function routeDenialResponse(decision: AuthorizationDecision): Response | null {
  if (decision.allowed) return null;
  return new Response(null, {
    status: decision.reason === 'unauthenticated' ? 401 : 403,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export class AuthorizationError extends Error {
  readonly status: 401 | 403;
  readonly reason: AuthorizationDenial;

  constructor(reason: AuthorizationDenial) {
    super('Access denied');
    this.name = 'AuthorizationError';
    this.reason = reason;
    this.status = reason === 'unauthenticated' ? 401 : 403;
  }
}

export function requireAuthorizedDecision(decision: AuthorizationDecision): Session {
  if (!decision.allowed) throw new AuthorizationError(decision.reason);
  return decision.session;
}

export type PermissionRequest = {
  area: PermissionArea;
  action: PermissionAction;
};

export async function runAuthorizedRoute<TArguments extends unknown[]>(
  authorize: () => Promise<Session | Response>,
  handler: (session: Session, ...arguments_: TArguments) => Promise<Response>,
  arguments_: TArguments,
): Promise<Response> {
  const authorization = await authorize();
  if (authorization instanceof Response) return authorization;
  return handler(authorization, ...arguments_);
}

export async function runAuthorizedAction<TArguments extends unknown[], TResult>(
  authorize: () => Promise<Session>,
  action: (session: Session, ...arguments_: TArguments) => Promise<TResult>,
  arguments_: TArguments,
): Promise<TResult> {
  const session = await authorize();
  return action(session, ...arguments_);
}
