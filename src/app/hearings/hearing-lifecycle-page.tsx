import { randomUUID } from 'node:crypto';
import type { Session } from 'next-auth';
import { notFound } from 'next/navigation';
import { readHearingLifecycle, type HearingLifecycleAction } from '@/lib/hearing-lifecycle';
import { HearingMutationError } from '@/lib/hearing-mutation-input';
import { parseHearingFilters, hearingDetailHref } from '@/lib/hearing-query';
import { clientId, type ClientSearchParams } from '@/lib/client-query';
import { HearingLifecycle } from './hearing-lifecycle';
export async function HearingLifecyclePage({
  session,
  action,
  id,
  params,
}: {
  session: Session;
  action: HearingLifecycleAction;
  id: string;
  params: ClientSearchParams;
}) {
  const identity = clientId(id);
  if (identity === null) notFound();
  const filters = parseHearingFilters(params);
  let snapshot;
  try {
    snapshot = await readHearingLifecycle(session, action, identity);
  } catch (error) {
    if (error instanceof HearingMutationError && error.code === 'not-found') notFound();
    throw error;
  }
  return (
    <HearingLifecycle
      action={action}
      snapshot={snapshot}
      submission={randomUUID()}
      detail={hearingDetailHref(identity, filters)}
      reload={`/hearings/${identity}/${action}${hearingDetailHref(identity, filters).slice(`/hearings/${identity}`.length)}`}
    />
  );
}
