import 'server-only';
import type { Session } from 'next-auth';
import { db } from './db';
import { readOpenDecisions } from './open-decisions-query';

export const getOpenDecisions = (session: Session, instant: Date) =>
  readOpenDecisions(session, db, () => instant);
