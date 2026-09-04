import { parseHighImpactApplicationArgs } from './lib/high-impact-application-contract';
import { runHighImpactApplication } from './lib/high-impact-application';

async function main(): Promise<void> {
  const options = parseHighImpactApplicationArgs(process.argv.slice(2));
  const result = await runHighImpactApplication(options);
  console.log(JSON.stringify(result));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
