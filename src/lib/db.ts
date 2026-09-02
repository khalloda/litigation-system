import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

/*
 * One shared database connection for the whole application.
 *
 * Prisma 7 talks to PostgreSQL through a driver adapter rather than a bundled
 * binary, so the adapter is created here and handed to the client.
 *
 * Next.js reloads changed files while the development server is running. A
 * new PrismaClient on every reload would open a fresh pool of connections
 * each time and eventually exhaust the database, so in development the client
 * is kept on the global object and reused. In production the module loads
 * once and this is simply a single instance.
 */

const connectionString = process.env['DATABASE_URL'];

function approvedRuntimeDatabaseUrl(url: string | undefined): string {
  if (!url) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env — see docs/DATABASE.md.');
  }
  let runtimeIdentity: URL;
  try {
    runtimeIdentity = new URL(url);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL.');
  }
  if (runtimeIdentity.username !== 'litigation_runtime') {
    throw new Error('DATABASE_URL must use the restricted litigation_runtime principal.');
  }
  return url;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export function createDatabaseClient(url = connectionString): PrismaClient {
  const approvedUrl = approvedRuntimeDatabaseUrl(url);
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: approvedUrl }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const db = globalForPrisma.prisma ?? createDatabaseClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}
