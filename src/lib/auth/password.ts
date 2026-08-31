import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { MINIMUM_PASSWORD_CHARACTERS } from './constants';

export const ARGON2ID_PARAMETERS = {
  type: argon2.argon2id,
  version: 0x13,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

const APPROVED_HASH =
  /^\$argon2id\$v=19\$m=19456,p=1,t=2\$[A-Za-z0-9+/]+={0,2}\$[A-Za-z0-9+/]+={0,2}$/u;

let dummyHashPromise: Promise<string> | undefined;

function passwordLength(value: string): number {
  return [...value].length;
}

export function passwordMeetsPolicy(value: string): boolean {
  return passwordLength(value) >= MINIMUM_PASSWORD_CHARACTERS;
}

export function isApprovedArgon2idHash(value: string): boolean {
  return APPROVED_HASH.test(value);
}

export async function hashPassword(value: string): Promise<string> {
  if (!passwordMeetsPolicy(value)) throw new Error('password-policy');
  return argon2.hash(value, ARGON2ID_PARAMETERS);
}

export async function verifyPassword(hash: string, value: string): Promise<boolean> {
  if (!isApprovedArgon2idHash(hash)) return false;
  try {
    return await argon2.verify(hash, value);
  } catch {
    return false;
  }
}

async function dummyHash(): Promise<string> {
  dummyHashPromise ??= argon2.hash(randomBytes(32), ARGON2ID_PARAMETERS);
  return dummyHashPromise;
}

export async function performDummyPasswordVerification(value: string): Promise<void> {
  await verifyPassword(await dummyHash(), value);
}
