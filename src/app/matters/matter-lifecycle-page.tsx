import { randomUUID } from 'node:crypto';
import type { Session } from 'next-auth';
import { notFound } from 'next/navigation';
import { readMatterLifecycle, type MatterLifecycleAction } from '@/lib/matter-lifecycle';
import { MatterMutationError } from '@/lib/matter-mutation-input';
import { parseMatterFilters, matterDetailHref } from '@/lib/matter-query';
import { clientId, type ClientSearchParams } from '@/lib/client-query';
import { MatterLifecycle } from './matter-lifecycle';
export async function MatterLifecyclePage({
  session,
  action,
  id,
  params,
}: {
  session: Session;
  action: MatterLifecycleAction;
  id: string;
  params: ClientSearchParams;
}) {
  const identity = clientId(id);
  if (identity === null) notFound();
  const filters = parseMatterFilters(params);
  let snapshot;
  try {
    snapshot = await readMatterLifecycle(session, action, identity);
  } catch (error) {
    if (error instanceof MatterMutationError && error.code === 'not-found') notFound();
    throw error;
  }
  return (
    <MatterLifecycle
      action={action}
      snapshot={snapshot}
      submission={randomUUID()}
      detail={matterDetailHref(identity, filters)}
      reload={`/matters/${identity}/${action}${matterDetailHref(identity, filters).slice(`/matters/${identity}`.length)}`}
    />
  );
}
