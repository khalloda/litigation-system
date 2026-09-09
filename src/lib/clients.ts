import 'server-only';
import type { Session } from 'next-auth';
import { db } from '@/lib/db';
import {
  readClients,
  readClient,
  readClientContacts,
  readContact,
  type ClientSearchParams,
} from './client-query';
export const listClients = (session: Session, params: ClientSearchParams) =>
  readClients(session, params, db);
export const getClient = (session: Session, id: string) => readClient(session, id, db);
export const getClientContacts = (session: Session, id: string, page: string) =>
  readClientContacts(session, id, page, db);
export const getContact = (session: Session, parent: string, id: string) =>
  readContact(session, parent, id, db);
