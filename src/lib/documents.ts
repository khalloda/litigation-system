import 'server-only';
import type { Session } from 'next-auth';
import { db } from './db';
import { readDocument, readDocuments } from './document-query';
import type { ClientSearchParams } from './client-query';

export const getDocuments = (session: Session, params: ClientSearchParams) =>
  readDocuments(session, params, db);
export const getDocument = (session: Session, id: string) => readDocument(session, id, db);
