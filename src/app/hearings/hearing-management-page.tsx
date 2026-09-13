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
}: {
  session: Session;
  id: number | null;
}) {
  let snapshot;
  try {
    snapshot = await readHearingMutation(session, id === null ? 'create' : 'update', id);
  } catch (e) {
    if (e instanceof HearingMutationError && e.code === 'not-found') notFound();
    throw e;
  }
  const cancel = id === null ? '/hearings' : '/hearings/' + id;
  if (snapshot.record?.archived)
    return (
      <main className={styles.page}>
        <h1>{t.hearings.manage.edit}</h1>
        <p>{t.hearings.manage.parentArchived}</p>
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
      reload={id === null ? '/hearings/new' : '/hearings/' + id + '/edit'}
    />
  );
}
