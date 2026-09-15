import 'server-only';
import type { Session } from 'next-auth';
import { db } from './db';
import { readAdminWorks, readAdminWork, type AdminArchiveFilter } from './admin-work-query';
import type { ClientSearchParams } from './client-query';
export const listAdminWorks = (session: Session, params: ClientSearchParams) =>
  readAdminWorks(session, params, db);
export const getAdminWork = (
  session: Session,
  id: string,
  stepPage: string,
  archive: AdminArchiveFilter = 'current',
) => readAdminWork(session, id, stepPage, db, archive);
