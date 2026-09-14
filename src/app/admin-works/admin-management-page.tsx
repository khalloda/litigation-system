import { randomUUID } from 'node:crypto';
import type { Session } from 'next-auth';
import { notFound } from 'next/navigation';
import { readAdminMutation } from '@/lib/admin-work-mutations';
import { AdminMutationError, type AdminOperation } from '@/lib/admin-work-mutation-input';
import {
  AdminFilterError,
  parseAdminDetailParams,
  adminListHref,
  adminDetailHref,
} from '@/lib/admin-work-query';
import type { ClientSearchParams } from '@/lib/client-query';
import { AdminEditor } from './admin-editor';
import { t } from '@/strings';
import styles from '../staff/staff.module.css';
export async function AdminManagementPage({
  session,
  operation,
  taskId,
  stepId,
  params,
}: {
  session: Session;
  operation: AdminOperation;
  taskId: number | null;
  stepId: number | null;
  params: ClientSearchParams;
}) {
  let snapshot;
  try {
    snapshot = await readAdminMutation(session, operation, taskId, stepId);
  } catch (error) {
    if (error instanceof AdminMutationError && ['invalid', 'not-found'].includes(error.code))
      notFound();
    throw error;
  }
  let navigation;
  try {
    navigation = parseAdminDetailParams(params);
  } catch (error) {
    if (error instanceof AdminFilterError) notFound();
    throw error;
  }
  const { filters, stepPage } = navigation,
    detail = adminDetailHref(taskId ?? 1, filters, stepPage),
    query = detail.slice(('/admin-works/' + (taskId ?? 1)).length),
    cancel = taskId === null ? adminListHref(filters) : detail;
  const path =
    operation === 'task-create'
      ? '/admin-works/new'
      : operation === 'task-update'
        ? '/admin-works/' + taskId + '/edit'
        : operation === 'step-create'
          ? '/admin-works/' + taskId + '/steps/new'
          : '/admin-works/' + taskId + '/steps/' + stepId + '/edit';
  if (snapshot.task?.matterArchived)
    return (
      <main className={styles.page}>
        <h1>{t.adminWorks.manage.edit}</h1>
        <p>{t.adminWorks.manage.parentArchived}</p>
        <a className={styles.link} href={cancel}>
          {t.common.cancel}
        </a>
      </main>
    );
  return (
    <AdminEditor
      snapshot={snapshot}
      operation={operation}
      submission={randomUUID()}
      cancel={cancel}
      reload={path + query}
      successQuery={query}
    />
  );
}
