import type { ClientBase } from 'pg';
import { task210bProtectedState } from './task210b-protected-state';

/** Everything completed through Task 2.10B, protected while Task 2.11 writes. */
export async function task211ProtectedState(db: ClientBase): Promise<string> {
  return task210bProtectedState(db);
}
