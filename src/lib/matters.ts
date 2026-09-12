import 'server-only';
import type { Session } from 'next-auth';
import { db } from '@/lib/db';
import { readMatters, readMatter } from './matter-query';
import type { ClientSearchParams } from './client-query';

export const listMatters = (session: Session, params: ClientSearchParams) =>
  readMatters(session, params, db);
export const getMatter = (session: Session, id: string) => readMatter(session, id, db);
