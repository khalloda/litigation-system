import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

export function assertGate4TaskTempPath(path: string): void {
  const taskRoot = resolve(tmpdir());
  const candidate = resolve(path);
  const rel = relative(taskRoot, candidate);
  if (rel === '' || rel.startsWith('..') || rel.includes(':'))
    throw new Error(`Gate 4 refuses a non-task temporary path: ${path}`);
}

export async function withGate4TaskTempDir<T>(
  label: string,
  run: (root: string) => Promise<T>,
): Promise<T> {
  if (!/^[a-z0-9-]+$/u.test(label)) throw new Error(`invalid Gate 4 temp label: ${label}`);
  const root = await mkdtemp(join(tmpdir(), `litigation-gate4-${label}-`));
  assertGate4TaskTempPath(root);
  try {
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
