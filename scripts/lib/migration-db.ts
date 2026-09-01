import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';

export const migrationDatabaseUrl = process.env['MIGRATION_DATABASE_URL'];

if (!migrationDatabaseUrl) {
  throw new Error('MIGRATION_DATABASE_URL is required for controlled database tooling.');
}

export const migrationDb = new PrismaClient({
  adapter: new PrismaPg({ connectionString: migrationDatabaseUrl }),
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});
