import 'server-only';
import type { Session } from 'next-auth';
import { db } from './db';
import { readBilling, readBillingRecord, type BillingKind } from './billing-query';
import type { ClientSearchParams } from './client-query';
export const getBilling = (session: Session, kind: BillingKind, params: ClientSearchParams) =>
  readBilling(session, kind, params, db);
export const getBillingRecord = (
  session: Session,
  kind: BillingKind,
  id: string,
  allocationPage?: string,
) => readBillingRecord(session, kind, id, db, allocationPage);
