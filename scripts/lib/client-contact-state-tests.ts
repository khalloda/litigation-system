import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ClientBase } from 'pg';
import {
  clientContactMigrationSql,
  clientContactBoundaryApplied,
  assertClientContactBoundary,
} from './client-contact-checkpoint';
import { staffReadOnlyState } from './staff-read-only-state';

/** Called only after the wrapper verifies its separately owned cluster. */
export async function proveClientContactPrestateRefusals(
  db: ClientBase,
  profile: string,
  sourceRow: object,
) {
  const original = await staffReadOnlyState(db);
  const probes = [
    'ALTER TABLE clients ADD COLUMN row_version bigint',
    'CREATE VIEW _migration.client_contact_unreviewed AS SELECT 1 n',
    "UPDATE _prisma_migrations SET checksum=repeat('0',64) WHERE migration_name='20260906180000_staff_roster_database_boundary'",
  ];
  if (profile === 'historical-full-state-upgrade')
    probes.push(
      "SELECT audit_set_migration_context();SELECT audit_set_event_context(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),NULL,'Task41 malformed prestate','system');UPDATE contacts SET client_id=(SELECT max(id) FROM clients) WHERE id=(SELECT min(id) FROM contacts)",
    );
  for (const mutation of probes) {
    await db.query('BEGIN');
    try {
      await db.query(mutation);
      await assert.rejects(
        db.query(clientContactMigrationSql()),
        /prestate|required|associations|differ/iu,
      );
    } finally {
      await db.query('ROLLBACK');
    }
    assert.deepEqual((await staffReadOnlyState(db)).tables, original.tables);
    assert.equal(await clientContactBoundaryApplied(db), false);
  }
  if (profile === 'canonical-clean-replay') {
    await db.query('BEGIN');
    try {
      await db.query(
        'INSERT INTO staging."العملاء" SELECT (jsonb_populate_record(NULL::staging."العملاء",$1)).*',
        [JSON.stringify(sourceRow)],
      );
      await assert.rejects(db.query(clientContactMigrationSql()), /Hybrid|noncanonical/iu);
    } finally {
      await db.query('ROLLBACK');
    }
    assert.deepEqual((await staffReadOnlyState(db)).tables, original.tables);
  }
  console.log(
    'PASS ' +
      profile +
      ' partial surfaces, altered checkpoint, original ownership/hybrid source refuse without repair',
  );
}

export async function proveClientContactMalformedBoundary(db: ClientBase, profile: string) {
  for (const mutation of [
    "UPDATE _prisma_migrations SET finished_at=NULL WHERE migration_name='20260909120000_client_contact_database_boundary'",
    'ALTER TABLE clients DROP CONSTRAINT clients_same_client_main_contact',
    'ALTER TABLE _migration.client_contact_client_import DISABLE TRIGGER immutable_rows',
    "CREATE FUNCTION public.client_contact_unknown() RETURNS void LANGUAGE sql AS 'SELECT'",
  ]) {
    await db.query('BEGIN');
    try {
      await db.query(mutation);
      await assert.rejects(assertClientContactBoundary(db, profile));
    } finally {
      await db.query('ROLLBACK');
    }
  }
  const before = await staffReadOnlyState(db);
  try {
    await assert.rejects(
      db.query(readFileSync('sql/transform-clients-contacts.sql', 'utf8')),
      /legacy delete-and-rebuild is prohibited/u,
    );
  } finally {
    await db.query('ROLLBACK');
  }
  assert.deepEqual(
    await staffReadOnlyState(db),
    before,
    'Legacy rebuild refuses before any row, event or sequence change',
  );
  await assertClientContactBoundary(db, profile);
  console.log(
    'PASS ' +
      profile +
      ' malformed ledger/function/constraint/trigger states refused; legacy rebuild stops before mutation',
  );
}
