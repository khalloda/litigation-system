import { parseHearingFilters, hearingDetailHref } from '@/lib/hearing-query';
import type { ClientSearchParams } from '@/lib/client-query';
import { randomUUID } from 'node:crypto';
import type { Session } from 'next-auth';
import { notFound } from 'next/navigation';
import { readHearingMutation } from '@/lib/hearing-mutations';
import { HearingMutationError } from '@/lib/hearing-mutation-input';
import { HearingEditor } from './hearing-editor';
import { t } from '@/strings';
import styles from '../staff/staff.module.css';
export async function HearingManagementPage({
  session,
  id,
  params = {},
}: {
  session: Session;
  id: number | null;
  params?: ClientSearchParams;
}) {
  let snapshot;
  try {
    snapshot = await readHearingMutation(session, id === null ? 'create' : 'update', id);
  } catch (e) {
    if (e instanceof HearingMutationError && e.code === 'not-found') notFound();
    throw e;
  }
  const filters = parseHearingFilters(params);
  const cancel = id === null ? '/hearings' : hearingDetailHref(id, filters);
  if (snapshot.record?.hearingArchived || snapshot.record?.matterArchived)
    return (
      <main className={styles.page}>
        <h1>{t.hearings.manage.edit}</h1>
        <p>
          {snapshot.record?.matterArchived
            ? t.hearings.manage.parentArchived
            : t.hearings.lifecycle.archivedNotice}
        </p>
        <a className={styles.link} href={cancel}>
          {t.hearings.back}
        </a>
      </main>
    );
  return (
    <HearingEditor
      snapshot={snapshot}
      submission={randomUUID()}
      cancel={cancel}
      reload={
        id === null
          ? '/hearings/new'
          : '/hearings/' + id + '/edit' + cancel.slice(('/hearings/' + id).length)
      }
    />
  );
}
