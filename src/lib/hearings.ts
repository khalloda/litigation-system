import 'server-only';
import type { Session } from 'next-auth';
import { db } from './db';
import { readHearings, readHearing } from './hearing-query';
import type { ClientSearchParams } from './client-query';
export const listHearings = (session: Session, params: ClientSearchParams) =>
  readHearings(session, params, db);
export const getHearing = (session: Session, id: string) => readHearing(session, id, db);
