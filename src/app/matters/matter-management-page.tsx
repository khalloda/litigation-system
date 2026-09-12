import { randomUUID } from 'node:crypto';
import type { Session } from 'next-auth';
import { notFound } from 'next/navigation';
import { readMatterMutation } from '@/lib/matter-mutations';
import { MatterMutationError } from '@/lib/matter-mutation-input';
import { parseMatterFilters, matterDetailHref, matterListHref } from '@/lib/matter-query';
import type { ClientSearchParams } from '@/lib/client-query';
import { MatterEditor } from './matter-editor';
export async function MatterManagementPage({
  session,
  id,
  params,
}: {
  session: Session;
  id: number | null;
  params: ClientSearchParams;
}) {
  const filters = parseMatterFilters(params);
  let snapshot;
  try {
    snapshot = await readMatterMutation(session, id === null ? 'create' : 'update', id);
  } catch (error) {
    if (error instanceof MatterMutationError && error.code === 'not-found') notFound();
    throw error;
  }
  const cancel = id === null ? matterListHref(filters) : matterDetailHref(id, filters);
  const query = matterListHref(filters).slice('/matters'.length);
  return (
    <MatterEditor
      snapshot={snapshot}
      submission={randomUUID()}
      cancel={cancel}
      query={query}
      reload={`${id === null ? '/matters/new' : `/matters/${id}/edit`}${query}`}
    />
  );
}
