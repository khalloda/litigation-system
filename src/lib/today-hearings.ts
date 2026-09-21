import 'server-only';
import type { Session } from 'next-auth';
import { db } from './db';
import { readTodayHearings } from './today-hearings-query';

export const getTodayHearings = (session: Session) => readTodayHearings(session, db);
