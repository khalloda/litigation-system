import { randomUUID } from 'node:crypto';
import type { Session } from 'next-auth';
import { notFound } from 'next/navigation';
import { readAdminLifecycle, type AdminLifecycleOperation } from '@/lib/admin-lifecycle';
import { AdminMutationError } from '@/lib/admin-work-mutation-input';
import { parseAdminDetailParams, adminDetailHref, AdminFilterError } from '@/lib/admin-work-query';
import { clientId, type ClientSearchParams } from '@/lib/client-query';
import { AdminLifecycle } from './admin-lifecycle';
export async function AdminLifecyclePage({
  session,
  operation,
  id,
  stepId,
  params,
}: {
  session: Session;
  operation: AdminLifecycleOperation;
  id: string;
  stepId: string | null;
  params: ClientSearchParams;
}) {
  const identity = clientId(id),
    child = stepId === null ? null : clientId(stepId);
  if (identity === null || (stepId !== null && child === null)) notFound();
  let navigation, snapshot;
  try {
    navigation = parseAdminDetailParams(params);
    snapshot = await readAdminLifecycle(session, operation, identity, child);
  } catch (error) {
    if (
      error instanceof AdminFilterError ||
      (error instanceof AdminMutationError && ['invalid', 'not-found'].includes(error.code))
    )
      notFound();
    throw error;
  }
  const detail = adminDetailHref(
      identity,
      navigation.filters,
      navigation.stepPage,
      navigation.stepArchive,
    ),
    query = detail.slice(`/admin-works/${identity}`.length);
  return (
    <AdminLifecycle
      action={operation}
      snapshot={snapshot}
      submission={randomUUID()}
      detail={detail}
      reload={`/admin-works/${identity}${child === null ? '' : '/steps/' + child}/${operation.endsWith('archive') ? 'archive' : 'restore'}${query}`}
    />
  );
}
