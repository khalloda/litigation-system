import 'server-only';

import type { Session } from 'next-auth';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import {
  decideAuthorization,
  requireAuthorizedDecision,
  routeDenialResponse,
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
