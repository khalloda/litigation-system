import assert from 'node:assert/strict';
import type { Session } from 'next-auth';
import type { PrismaClient } from '../src/generated/prisma/client';
import { cairoDate } from '../src/lib/cairo-date';
import { readTodayHearings } from '../src/lib/today-hearings-query';
import { AuthorizationError } from '../src/lib/auth/authorization-core';

// Literal expected dates are independent of the implementation's formatter.
export const cairoCases = [
  ['2026-01-15T21:59:59Z', '2026-01-15'],
  ['2026-01-15T22:00:00Z', '2026-01-16'],
  ['2026-07-15T20:59:59Z', '2026-07-15'],
  ['2026-07-15T21:00:00Z', '2026-07-16'],
  ['2026-12-31T22:00:00Z', '2027-01-01'],
  ['2028-02-28T22:00:00Z', '2028-02-29'],
  ['2028-02-29T22:00:00Z', '2028-03-01'],
  ['2026-04-23T21:59:59Z', '2026-04-23'],
  ['2026-04-23T22:00:00Z', '2026-04-24'],
  ['2026-10-29T20:59:59Z', '2026-10-29'],
  ['2026-10-29T21:00:00Z', '2026-10-29'],
  ['2026-10-29T22:00:00Z', '2026-10-30'],
] as const;

async function main() {
  for (const [instant, expected] of cairoCases)
    assert.equal(cairoDate(new Date(instant)), expected);
  let transactions = 0;
  const never = {
    $transaction() {
      transactions++;
      throw new Error('Protected work after denial');
    },
  } as unknown as PrismaClient;
  const viewer = {
    expires: new Date(Date.now() + 60000).toISOString(),
    user: { id: '1', personId: 1, role: 'Lawyer', sessionVersion: 1, mustChangePassword: false },
  } as Session;
  for (const session of [
    null,
    { ...viewer, expires: 'invalid' },
    { ...viewer, expires: new Date(0).toISOString() },
    { ...viewer, user: { ...viewer.user, mustChangePassword: true } },
    { ...viewer, user: { ...viewer.user, role: 'unknown' } },
  ])
    await assert.rejects(readTodayHearings(session as Session | null, never), AuthorizationError);
  assert.equal(transactions, 0);
  console.log(
    `PASS ${cairoCases.length} independent Cairo date cases; five denials before database work`,
  );
  console.log(
    JSON.stringify({
      node: process.version,
      icu: process.versions.icu,
      tz: process.versions.tz,
      hostTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  );
}
if (process.argv[1]?.endsWith('test-today-hearings.ts')) void main();
