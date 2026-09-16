import 'server-only';
import type { Session } from 'next-auth';
import { db } from './db';
import { readFeeLetter, readFeeLetters } from './fee-letter-query';
import type { ClientSearchParams } from './client-query';

export const getFeeLetters = (session: Session, params: ClientSearchParams) =>
  readFeeLetters(session, params, db);
export const getFeeLetter = (session: Session, id: string) => readFeeLetter(session, id, db);
