import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { withApprovedMigrationClient } from './lib/migration-principal';
/** Controlled maintenance only. Each actual-owner use requires explicit owner
 * authorization of this account/change; possession of export is not delegation. */
async function main() {
  const [account, action, reason, ...extra] = process.argv.slice(2);
  if (
    extra.length ||
    !account ||
    !reason ||
    !['grant', 'revoke'].includes(action ?? '') ||
    !/^[1-9][0-9]{0,9}$/u.test(account) ||
    Number(account) > 2147483647 ||
    reason.trim().length < 1 ||
    reason.length > 256
  )
    throw new Error(
      'Usage: node --import tsx scripts/audit-export-capability.ts ACCOUNT_ID grant|revoke "REASON"',
    );
  await withApprovedMigrationClient(async (client) => {
    await client.query('BEGIN');
    try {
      const target = await client.query(
        'SELECT u.id,a.id actor_id FROM user_accounts u JOIN audit_actors a ON a.user_account_id=u.id AND a.actor_kind=$2 WHERE u.id=$1',
        [Number(account), 'human'],
      );
      if (target.rowCount !== 1) throw new Error('Target account/actor cardinality differs');
      await client.query('SELECT public.audit_set_administration_context()');
      await client.query(
        "SELECT public.audit_set_event_context($1,$2,$3,NULL,'controlled-maintenance:audit-export-capability','system')",
        [randomUUID(), randomUUID(), randomUUID()],
      );
      const event = await client.query(
        'SELECT _migration.audit_export_set_capability($1,$2,$3)::text event_id',
        [Number(account), action === 'grant', reason],
      );
      await client.query('COMMIT');
      console.log(
        JSON.stringify({ accountId: Number(account), action, eventId: event.rows[0].event_id }),
      );
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}
main().catch(() => {
  console.error(
    'Controlled audit-export capability change refused; no success claimed. Verify explicit target, action, reason and approved direct administration identity.',
  );
  process.exitCode = 1;
});
