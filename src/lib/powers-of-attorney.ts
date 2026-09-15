import 'server-only';
import type { Session } from 'next-auth';
import { db } from './db';
import { readPoas, readPoa } from './poa-query';
import type { ClientSearchParams } from './client-query';
export const getPoas = (session: Session, params: ClientSearchParams) =>
  readPoas(session, params, db);
export const getPoa = (session: Session, id: string) => readPoa(session, id, db);
