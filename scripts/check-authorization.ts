import { permissionPolicyStructureFailures, PERMISSION_POLICY } from '../src/lib/auth/permissions';
import { ROUTE_INVENTORY } from '../src/lib/auth/route-inventory';
import {
  discoverAuthorizationEntrypoints,
  proxyExemptionFailures,
  routeInventoryFailures,
} from './lib/authorization-route-inventory';

const root = process.cwd();
const discovered = discoverAuthorizationEntrypoints(root);
const failures = [
  ...permissionPolicyStructureFailures(PERMISSION_POLICY),
  ...routeInventoryFailures(discovered),
  ...proxyExemptionFailures(root),
];

if (failures.length > 0) {
  for (const failure of failures) console.error(`ERROR ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `check:authorization — ${ROUTE_INVENTORY.length} entry points classified; permission policy structurally complete.`,
  );
}
