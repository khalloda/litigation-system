import 'server-only';
import type { Session } from 'next-auth';
import { db } from '@/lib/db';
import { readLogoMetadata } from './client-query';
import { readClientLogoFile } from './client-logo-file';
export async function getClientLogo(session: Session, id: string) {
  const metadata = await readLogoMetadata(session, id, db);
  return readClientLogoFile(session, process.env['CLIENT_LOGO_ROOT'], metadata);
}
