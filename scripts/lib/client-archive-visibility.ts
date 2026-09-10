import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { ClientBase } from 'pg';
import { loadReports } from './gate4-database';
import { GATE4_CLIENT_LEGACY_ID } from './gate4-report-contract';

export const visibilityDigest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Only an explicit caller-owned connection is accepted. Callers must verify
 * isolated cluster ownership before mutation; report reads also enforce the
 * unchanged Gate 4 database/read-only/repeatable-read contract. */
export async function archiveVisibilityTargets(db: ClientBase) {
  const report = (
    await db.query<{ id: number; legacy_id: number; matters: number }>(
      `SELECT c.id,c.legacy_id,(SELECT count(*)::int FROM matters m WHERE m.client_id=c.id) matters
       FROM clients c WHERE c.legacy_id=$1::int`,
      [GATE4_CLIENT_LEGACY_ID],
    )
  ).rows;
  assert.equal(report.length, 1, 'stored report client association must be unique');
  assert.ok(report[0]!.matters > 0, 'report client must have existing matters');
  const largest = (
    await db.query<{ id: number; legacy_id: number; matters: number }>(
      `WITH counts AS (SELECT c.id,c.legacy_id,count(m.id)::int matters
       FROM clients c JOIN matters m ON m.client_id=c.id GROUP BY c.id)
       SELECT * FROM counts WHERE matters=(SELECT max(matters) FROM counts)`,
    )
  ).rows;
  assert.equal(largest.length, 1, 'largest client must resolve uniquely');
  assert.equal(largest[0]!.matters, 378);
  assert.notEqual(report[0]!.id, largest[0]!.id, 'report parameter is not the largest client');
  return [report[0]!, largest[0]!];
}

export async function archiveVisibilitySnapshot(db: ClientBase, clientId: number) {
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    await db.query("SET LOCAL TIME ZONE 'UTC'");
    const clients = (
      await db.query<{ value: Record<string, unknown> }>(
        'SELECT to_jsonb(c) value FROM clients c WHERE c.id=$1',
        [clientId],
      )
    ).rows;
    assert.equal(clients.length, 1);
    const matters = (
      await db.query<{ id: number; value: Record<string, unknown> }>(
        'SELECT m.id,to_jsonb(m) value FROM matters m WHERE m.client_id=$1 ORDER BY m.id',
        [clientId],
      )
    ).rows;
    const reports = await loadReports(db);
    assert.equal(reports.length, 6);
    assert.equal(reports[0]!.parameters.client_legacy_id, GATE4_CLIENT_LEGACY_ID);
    assert.ok(reports[0]!.rows.length > 0, 'the fixed client report must be nonempty');
    return { client: clients[0]!.value, matters, reports };
  } finally {
    await db.query('ROLLBACK');
  }
}

export function assertArchiveVisibility(
  baseline: Awaited<ReturnType<typeof archiveVisibilitySnapshot>>,
  current: Awaited<ReturnType<typeof archiveVisibilitySnapshot>>,
  archived: boolean,
  versionIncrement: number,
) {
  // Digest comparisons avoid printing business values if an assertion fails.
  assert.equal(visibilityDigest(current.matters), visibilityDigest(baseline.matters));
  assert.equal(visibilityDigest(current.reports), visibilityDigest(baseline.reports));
  const metadata = new Set([
    'is_archived',
    'row_version',
    'updated_at',
    'updated_by',
    'application_modified_at',
    'application_modified_by',
  ]);
  const business = (row: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(row).filter(([key]) => !metadata.has(key)));
  assert.equal(
    visibilityDigest(business(current.client)),
    visibilityDigest(business(baseline.client)),
  );
  assert.equal(current.client.is_archived, archived);
  assert.equal(
    BigInt(String(current.client.row_version)),
    BigInt(String(baseline.client.row_version)) + BigInt(versionIncrement),
  );
}

export function archiveVisibilityReceipt(
  snapshot: Awaited<ReturnType<typeof archiveVisibilitySnapshot>>,
) {
  return {
    clientId: snapshot.client.id,
    legacyId: snapshot.client.legacy_id,
    archived: snapshot.client.is_archived,
    version: String(snapshot.client.row_version),
    matterCount: snapshot.matters.length,
    matterIds: snapshot.matters.map((row) => row.id),
    matterContentDigest: visibilityDigest(snapshot.matters),
    reports: snapshot.reports.map((report) => ({
      name: report.name,
      parameters: report.parameters,
      fields: report.fields,
      ordering: report.ordering,
      rows: report.rows.length,
      identityDigest: visibilityDigest(report.rows.map((row) => row.identity)),
      orderedContentDigest: visibilityDigest(report),
    })),
  };
}
