import assert from 'node:assert/strict';
import { discoverAuditRuntimeSources } from './lib/audit-source-inventory';
import { userManagementSourceFailures } from './lib/user-management-source';

function selfTest(): void {
  const reject = (label: string, text: string, path = 'src/lib/fixture.ts'): void => {
    assert.ok(
      userManagementSourceFailures([{ path, text }], {
        enforceInventory: false,
      }).length > 0,
      `${label} fixture passed unexpectedly`,
    );
  };
  reject('direct account insert', `export const run=(db:any)=>db.userAccount.create({data:{}});`);
  reject(
    'aliased lifecycle update',
    `export const run=(db:any)=>{const accounts=db.userAccount;return accounts.update({});};`,
  );
  reject('computed delegate', `export const run=(db:any)=>db['user'+'Account'].update({});`);
  reject('physical deletion', `export const run=(db:any)=>db.userAccount.delete({where:{id:1}});`);
  reject(
    'password return',
    `export function unsafe(passwordHash:string){return {passwordHash};}`,
    'src/app/users/fixture.ts',
  );
  reject(
    'password logging',
    `export function unsafe(temporaryPassword:string){console.log(temporaryPassword);}`,
    'src/app/users/fixture.ts',
  );
  reject('service wrapper', `export { disableManagedAccount } from '@/lib/auth/user-management';`);
  reject(
    'request-selected actor',
    `import { disableManagedAccount } from '@/lib/auth/user-management';
     export const unsafe=(session:any,formData:FormData)=>disableManagedAccount(Number(formData.get('actor')),{} as never,{} as never);`,
    'src/app/users/actions.ts',
  );
  assert.deepEqual(
    userManagementSourceFailures(
      [
        {
          path: 'src/lib/fixture.ts',
          text: `export const read=(db:any)=>db.userAccount.findMany();`,
        },
      ],
      { enforceInventory: false },
    ),
    [],
  );
  console.log(
    'check:user-management self-test — eight mutation, alias, deletion, wrapper, actor and secret-exposure fixtures rejected; direct read fixture accepted.',
  );
}

function main(): void {
  if (process.argv.length === 3 && process.argv[2] === '--self-test') return selfTest();
  if (process.argv.length !== 2) throw new Error('use no argument or --self-test');
  const sources = discoverAuditRuntimeSources(process.cwd());
  const failures = userManagementSourceFailures(sources);
  if (failures.length) {
    for (const failure of failures) console.error(`ERROR ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:user-management — exact account mutation, staff immutability and password-output inventory passed.',
  );
}

main();
