import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { ClientBase } from 'pg';

export const CLIENT_LOGO_MIGRATION = '20260910140000_recoverable_client_logos';
export const CLIENT_LOGO_GATEWAYS = [
  'public.client_logo_mutate(p_client integer, p_expected bigint, p_client_version bigint, p_submission uuid, p_action text, p_target uuid, p_metadata jsonb, p_session_version integer, p_role text)',
  'public.client_logo_state(p_account integer, p_session_version integer, p_role text, p_client integer, p_offset integer, p_target uuid)',
] as const;
export const CLIENT_LOGO_FIELD_RULES = [
  ['client_logos', 'row_version', 64, 'client_logo_operational_version'],
  ['client_logos', 'is_archived', 64, 'client_logo_archive_lifecycle'],
] as const;
export const clientLogoMigrationSql = () =>
  readFileSync(`prisma/migrations/${CLIENT_LOGO_MIGRATION}/migration.sql`, 'utf8');

/** A repository candidate never implies an applied database boundary. */
export async function clientLogoBoundaryApplied(db: ClientBase): Promise<boolean> {
  const ledger = (
    await db.query(
      'SELECT checksum,finished_at,rolled_back_at,applied_steps_count FROM _prisma_migrations WHERE migration_name=$1',
      [CLIENT_LOGO_MIGRATION],
    )
  ).rows;
  const surfaces = (
    await db.query(`SELECT
    ARRAY(SELECT tablename::text FROM pg_tables WHERE schemaname='public' AND tablename IN ('client_logo_versions','client_logo_submissions') ORDER BY tablename) tables,
    (SELECT count(*)::integer FROM information_schema.columns WHERE table_schema='public' AND table_name='client_logos' AND column_name IN ('row_version','is_archived')) columns,
    ARRAY(SELECT proname::text FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('client_logo_refuse_evidence_change','client_logo_guard','client_logo_mutate','client_logo_state') ORDER BY proname) functions`)
  ).rows[0];
  if (!ledger.length) {
    assert.deepEqual(
      surfaces,
      { tables: [], columns: 0, functions: [] },
      'Partial logo boundary without migration 63',
    );
    return false;
  }
  assert.equal(ledger.length, 1);
  assert.ok(
    ledger[0].finished_at && !ledger[0].rolled_back_at && ledger[0].applied_steps_count === 1,
  );
  assert.equal(
    ledger[0].checksum,
    createHash('sha256')
      .update(readFileSync(`prisma/migrations/${CLIENT_LOGO_MIGRATION}/migration.sql`))
      .digest('hex'),
  );
  assert.deepEqual(surfaces, {
    tables: ['client_logo_submissions', 'client_logo_versions'],
    columns: 2,
    functions: [
      'client_logo_guard',
      'client_logo_mutate',
      'client_logo_refuse_evidence_change',
      'client_logo_state',
    ],
  });
  return true;
}

export async function assertClientLogoBoundary(db: ClientBase) {
  assert.equal(await clientLogoBoundaryApplied(db), true);
  // Exact associations, including original current-row identity, remain required
  // after replacements. Native versions never participate in import totals.
  assert.deepEqual(
    (
      await db.query(`SELECT i.source_parent_key FROM migration_client_logo_import i
    LEFT JOIN client_logo_versions v ON v.id=md5('task41a-import:'||i.client_logo_id::text)::uuid
    LEFT JOIN client_logos l ON l.id=i.client_logo_id AND l.client_id=i.client_id
    WHERE l.id IS NULL OR v.id IS NULL OR ROW(v.client_id,v.relative_path,v.file_name,v.original_name,v.content_type,v.byte_size,v.sha256,v.origin)
      IS DISTINCT FROM ROW(i.client_id,i.destination_relative_path,i.source_file_name,i.source_file_name,i.detected_content_type,i.byte_size,i.sha256,'import'::text)
    UNION ALL SELECT -1 FROM client_logo_versions v WHERE origin='import' AND NOT EXISTS(SELECT 1 FROM migration_client_logo_import i WHERE v.id=md5('task41a-import:'||i.client_logo_id::text)::uuid)`)
    ).rows,
    [],
    'Original logo version identity/bytes association changed',
  );
  assert.deepEqual(
    (
      await db.query(
        `SELECT l.id FROM client_logos l LEFT JOIN client_logo_versions v ON v.client_id=l.client_id AND v.relative_path=l.relative_path WHERE v.id IS NULL OR ROW(l.file_name,l.content_type,l.byte_size,l.sha256) IS DISTINCT FROM ROW(v.file_name,v.content_type,v.byte_size,v.sha256)`,
      )
    ).rows,
    [],
    'Current logo is not exact retained bytes',
  );
  assert.deepEqual(
    (
      await db.query(
        `SELECT s.submission_id FROM client_logo_submissions s JOIN client_logo_versions v ON v.id=s.result_id WHERE s.client_id<>v.client_id OR s.result_version<1 OR s.request_payload->>'client' IS DISTINCT FROM s.client_id::text OR jsonb_typeof(s.request_payload)<>'object'`,
      )
    ).rows,
    [],
    'Submission association changed',
  );
  assert.deepEqual(
    (
      await db.query(`SELECT v.id FROM client_logo_versions v
    LEFT JOIN client_logo_submissions s ON s.submission_id=v.id
    WHERE v.origin='upload' AND (s.submission_id IS NULL OR s.result_id<>v.id OR s.client_id<>v.client_id OR s.actor_id<>v.registered_by
      OR s.request_payload->>'action' NOT IN ('create','update')
      OR s.request_payload->'metadata'->>'sha256' IS DISTINCT FROM v.sha256
      OR s.request_payload->'metadata'->>'fileName' IS DISTINCT FROM v.file_name
      OR s.request_payload->'metadata'->>'originalName' IS DISTINCT FROM v.original_name
      OR s.request_payload->'metadata'->>'contentType' IS DISTINCT FROM v.content_type
      OR s.request_payload->'metadata'->>'byteSize' IS DISTINCT FROM v.byte_size::text)`)
    ).rows,
    [],
    'Uploaded version lacks its exact immutable successful submission',
  );
  const functions = (
    await db.query(
      `SELECT p.proname,p.prosrc,p.prosecdef,p.proconfig,p.provolatile,pg_get_userbyid(p.proowner) owner FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN ('client_logo_refuse_evidence_change','client_logo_guard','client_logo_mutate','client_logo_state') ORDER BY p.proname`,
    )
  ).rows;
  const sql = clientLogoMigrationSql();
  for (const row of functions) {
    const authored = sql.match(
      new RegExp(
        'CREATE FUNCTION public\\.' + row.proname + '\\([\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;',
      ),
    );
    assert.ok(authored);
    assert.equal(
      row.prosrc.replaceAll('\r\n', '\n').trim(),
      authored[1]!.replaceAll('\r\n', '\n').trim(),
      'Logo gateway body differs',
    );
    assert.equal(row.prosecdef, true);
    assert.deepEqual(row.proconfig, ['search_path=pg_catalog, public']);
    assert.equal(row.provolatile, row.proname === 'client_logo_state' ? 's' : 'v');
    assert.equal(row.owner, 'litigation');
  }
  const catalog = JSON.parse(readFileSync('scripts/baselines/client-logo-catalog.json', 'utf8'));
  for (const [key, query] of Object.entries(CLIENT_LOGO_CATALOG_QUERIES))
    assert.deepEqual((await db.query(query)).rows, catalog[key], `Logo ${key} catalog differs`);
  return [
    'exact imported identities',
    'current retained bytes',
    'submission associations and exact uploaded-version provenance',
    'fixed gateway bodies',
    'exact constraints/indexes/triggers/columns/owners',
  ].map((description, index) => ({
    id: `LOGO-${String(index + 1).padStart(3, '0')}`,
    description,
  }));
}

/** Captured only in an isolated migration proof, then reviewed and committed.
 * No runtime baseline writer or automatic acceptance of catalog drift. */
export const CLIENT_LOGO_CATALOG_QUERIES = {
  constraints: `SELECT conname name,pg_get_constraintdef(oid) definition,convalidated validated,condeferrable deferrable,condeferred deferred FROM pg_constraint WHERE conrelid IN ('public.client_logo_versions'::regclass,'public.client_logo_submissions'::regclass) OR (conrelid='public.client_logos'::regclass AND conname IN ('client_logos_row_version_check','client_logos_retained_version_fkey')) ORDER BY conname`,
  columns: `SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND (table_name IN ('client_logo_versions','client_logo_submissions') OR (table_name='client_logos' AND column_name IN ('row_version','is_archived'))) ORDER BY table_name,ordinal_position`,
  indexes: `SELECT c.relname name,x.indisunique unique,x.indisvalid valid,x.indisready ready,pg_get_indexdef(c.oid) definition FROM pg_index x JOIN pg_class c ON c.oid=x.indexrelid WHERE x.indrelid IN ('public.client_logo_versions'::regclass,'public.client_logo_submissions'::regclass) ORDER BY c.relname`,
  triggers: `SELECT tgname name,tgenabled enabled,pg_get_triggerdef(oid) definition FROM pg_trigger WHERE NOT tgisinternal AND (tgrelid IN ('public.client_logo_versions'::regclass,'public.client_logo_submissions'::regclass) OR (tgrelid='public.client_logos'::regclass AND tgname IN ('zz_client_logo_guard','client_logo_no_truncate'))) ORDER BY tgname`,
  evidenceAccess: `SELECT c.relname,pg_get_userbyid(c.relowner) owner,coalesce((SELECT jsonb_agg(jsonb_build_object('grantee',pg_get_userbyid(a.grantee),'privilege',a.privilege_type) ORDER BY a.grantee,a.privilege_type) FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee<>c.relowner),'[]') other_grants FROM pg_class c WHERE c.oid IN ('public.client_logo_versions'::regclass,'public.client_logo_submissions'::regclass) ORDER BY c.relname`,
} as const;
