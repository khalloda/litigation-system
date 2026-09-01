import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/*
 * Prisma migrations use the privileged owner connection. The Next.js runtime
 * deliberately uses a different, restricted DATABASE_URL (D33 / Task 3.3A).
 * Both values live only in the git-ignored environment file.
 */

const url = process.env['MIGRATION_DATABASE_URL'];

if (!url) {
  throw new Error(
    'MIGRATION_DATABASE_URL is not set. Copy .env.example to .env:\n' +
      '    cp .env.example .env\n' +
      'See docs/DATABASE.md.',
  );
}

const runtimeUrl = process.env['DATABASE_URL'];
if (runtimeUrl) {
  const migrationIdentity = new URL(url);
  const runtimeIdentity = new URL(runtimeUrl);
  if (migrationIdentity.username === runtimeIdentity.username) {
    throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must use separate principals.');
  }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: { url },
});
