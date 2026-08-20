import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/*
 * Prisma reads the database address from here rather than from the schema
 * file, so the password never appears in a committed file. It comes from
 * DATABASE_URL in .env, which is git-ignored.
 */

const url = process.env['DATABASE_URL'];

if (!url) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env:\n' +
      '    cp .env.example .env\n' +
      'See docs/DATABASE.md.',
  );
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: { url },
});
