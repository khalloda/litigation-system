import 'dotenv/config';
import assert from 'node:assert/strict';
import { prepareBoundedJournal, runBoundedTask62 } from './lib/task62-bounded-runner';

async function main() {
  const [mode = 'plan', planPath, wrapperPath, journalPath, sessionPath] = process.argv.slice(2);
  assert.ok(mode === 'plan' || mode === 'apply');
  assert.ok(
    planPath && wrapperPath && journalPath,
    'Usage: task62-bounded-operation.ts plan|apply PLAN WRAPPER PRIVATE_JOURNAL [PRIVATE_SESSION]',
  );
  prepareBoundedJournal(planPath, wrapperPath, journalPath);
  const result = await runBoundedTask62({ mode, planPath, wrapperPath, journalPath, sessionPath });
  // Row-level receipts stay in the protected operation output/database, never stdout.
  console.log(
    JSON.stringify({ status: result.status, operation: result.operation, changed: result.changed }),
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/gu, '[private URL]')
      : 'Bounded operation failed',
  );
  process.exitCode = 1;
});
