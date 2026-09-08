import 'server-only';

import type { Session } from 'next-auth';
import { db } from '@/lib/db';
import { readStaffDetail, readStaffRoster, type StaffSearchParams } from './staff-roster-query';

export const listStaff = (session: Session, params: StaffSearchParams) =>
  readStaffRoster(session, params, db);
export const getStaff = (session: Session, id: string) => readStaffDetail(session, id, db);
