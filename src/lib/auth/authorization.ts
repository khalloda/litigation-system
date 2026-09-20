import 'server-only';

import type { Session } from 'next-auth';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { requireAuditAuthority } from '@/lib/audit-history-query';
import { AuthorizationError } from './authorization-core';
import {
  decideAuthorization,
  requireAuthorizedDecision,
  routeDenialResponse,
  runAuthorizedAction,
  runAuthorizedRoute,
  type PermissionRequest,
} from './authorization-core';

async function currentDecision(permission: PermissionRequest) {
  const session = await auth();
  return decideAuthorization(session, permission.area, permission.action);
}

export async function requireAuthenticatedPage(): Promise<Session> {
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.mustChangePassword) redirect('/change-password');
  return session;
}

export async function requirePagePermission(permission: PermissionRequest): Promise<Session> {
  const decision = await currentDecision(permission);
  if (decision.allowed) return decision.session;
  if (decision.reason === 'unauthenticated') redirect('/login');
  if (decision.reason === 'password-change-required') redirect('/change-password');
  redirect('/forbidden');
}

export async function authorizeRoutePermission(
  permission: PermissionRequest,
): Promise<Session | Response> {
  const decision = await currentDecision(permission);
  return routeDenialResponse(decision) ?? requireAuthorizedDecision(decision);
}

export async function requireActionPermission(permission: PermissionRequest): Promise<Session> {
  return requireAuthorizedDecision(await currentDecision(permission));
}

type RouteOperation<TArguments extends unknown[]> = (
  session: Session,
  ...arguments_: TArguments
) => Promise<Response>;

type ActionOperation<TArguments extends unknown[], TResult> = (
  session: Session,
  ...arguments_: TArguments
) => Promise<TResult>;

/**
 * The only permitted Task 3.2 pattern for a permission-protected Route
 * Handler. The authorization result is resolved before the handler can run;
 * a denial response returns without invoking protected work.
 */
export function withRoutePermission<TArguments extends unknown[]>(
  permission: PermissionRequest,
  handler: RouteOperation<TArguments>,
): (...arguments_: TArguments) => Promise<Response> {
  return async (...arguments_: TArguments) =>
    runAuthorizedRoute(() => authorizeRoutePermission(permission), handler, arguments_);
}

/** Separate persisted account capability, checked before any export work. */
export function withAuditExportRoutePermission<TArguments extends unknown[]>(
  permission: PermissionRequest,
  handler: RouteOperation<TArguments>,
): (...arguments_: TArguments) => Promise<Response> {
  return withRoutePermission(permission, async (session, ...arguments_) => {
    try {
      await requireAuditAuthority(session, true);
    } catch (error) {
      if (error instanceof AuthorizationError)
        return new Response(null, {
          status: error.status,
          headers: { 'Cache-Control': 'no-store' },
        });
      throw error;
    }
    return handler(session, ...arguments_);
  });
}

/**
 * The only permitted Task 3.2 pattern for a permission-protected module-level
 * Server Action. The validated session is obtained before the supplied action
 * body is called.
 */
export function withActionPermission<TArguments extends unknown[], TResult>(
  permission: PermissionRequest,
  action: ActionOperation<TArguments, TResult>,
): (...arguments_: TArguments) => Promise<TResult> {
  return async (...arguments_: TArguments) =>
    runAuthorizedAction(() => requireActionPermission(permission), action, arguments_);
}
