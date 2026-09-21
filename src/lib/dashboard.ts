import 'server-only';
import type { Session } from 'next-auth';
import { db } from './db';
import { readTopClients } from './top-clients-query';
import { readLawyerWorkload } from './lawyer-workload-query';
import { readOpenDecisions } from './open-decisions-query';

export const getOpenDecisions = (session: Session, instant: Date) =>
  readOpenDecisions(session, db, () => instant);

export const getLawyerWorkload = (session: Session) => readLawyerWorkload(session, db);

export const getTopClients = (session: Session) => readTopClients(session, db);
