import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, unlink } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { platform } from 'node:os';
import { LogoError, type PreparedLogo } from './client-logo-upload';

function beneath(root: string, path: string) {
  const suffix = relative(root, path);
  return suffix !== '' && !isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith('..' + sep);
}
export function logoSubmission(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value)
  )
    throw new LogoError('invalid');
  return value;
}

/** Exclusive immutable filename. Flush complete validated bytes before SQL can
 * expose them. Never unlink after the committing transaction has been attempted:
 * a lost response does not prove rollback. Exact retries verify the same file.
 * The OS-owned storage root must not be writable by untrusted local processes. */
export async function persistPreparedLogo(
  root: string | undefined,
  clientId: number,
  submission: string,
  logo: PreparedLogo,
) {
  logoSubmission(submission);
  if (!root || !Number.isSafeInteger(clientId) || clientId < 1) throw new LogoError('storage');
  const fileName = `${submission}.${logo.extension}`;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  let created = false;
  let path: string | undefined;
  let createdIdentity: { dev: number; ino: number } | undefined;
  try {
    const configured = resolve(root);
    if ((await lstat(configured)).isSymbolicLink() || (await realpath(configured)) !== configured)
      throw new LogoError('storage');
    const directory = resolve(configured, String(clientId));
    if (!beneath(configured, directory)) throw new LogoError('storage');
    await mkdir(directory).catch((error) => {
      if (error.code !== 'EEXIST') throw error;
    });
    const directoryInfo = await lstat(directory);
    if (
      !directoryInfo.isDirectory() ||
      directoryInfo.isSymbolicLink() ||
      (await realpath(directory)) !== directory
    )
      throw new LogoError('storage');
    path = resolve(directory, fileName);
    if (!beneath(directory, path)) throw new LogoError('storage');
    try {
      handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
      created = true;
      createdIdentity = await handle.stat();
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
      const entry = await lstat(path);
      if (
        !entry.isFile() ||
        entry.isSymbolicLink() ||
        entry.size !== logo.bytes.length ||
        (await realpath(path)) !== path
      )
        throw new LogoError('storage');
      handle = await open(path, constants.O_RDONLY);
      const before = await handle.stat();
      if (before.dev !== entry.dev || before.ino !== entry.ino) throw new LogoError('storage');
      const bytes = Buffer.alloc(logo.bytes.length + 1);
      let offset = 0;
      while (offset < bytes.length) {
        const read = await handle.read(bytes, offset, bytes.length - offset, offset);
        if (!read.bytesRead) break;
        offset += read.bytesRead;
      }
      if (
        offset !== logo.bytes.length ||
        createHash('sha256').update(bytes.subarray(0, offset)).digest('hex') !== logo.sha256
      )
        throw new LogoError('submission');
    }
    if (created) {
      await handle.writeFile(logo.bytes);
      await handle.sync();
    }
    const after = await handle.stat();
    const entry = await lstat(path);
    if (
      after.size !== logo.bytes.length ||
      entry.isSymbolicLink() ||
      after.ino !== entry.ino ||
      after.dev !== entry.dev ||
      (await realpath(directory)) !== directory ||
      (await realpath(path)) !== path
    )
      throw new LogoError('storage');
    await handle.close();
    handle = undefined;
    // POSIX directory fsync also persists the directory entry. Windows does not
    // expose directory fsync through Node; file FlushFileBuffers is used above.
    if (platform() !== 'win32') {
      const directoryHandle = await open(directory, constants.O_RDONLY);
      try {
        await directoryHandle.sync();
      } finally {
        await directoryHandle.close();
      }
    }
    return { fileName, relativePath: `${clientId}/${fileName}` };
  } catch (error) {
    await handle?.close().catch(() => {});
    handle = undefined;
    // SQL has not started, and only this call's exclusive creation is eligible.
    if (created && path && createdIdentity) {
      const entry = await lstat(path).catch(() => null);
      if (
        entry?.isFile() &&
        !entry.isSymbolicLink() &&
        entry.dev === createdIdentity.dev &&
        entry.ino === createdIdentity.ino &&
        (await realpath(path).catch(() => null)) === path
      )
        await unlink(path).catch(() => {});
    }
    if (error instanceof LogoError) throw error;
    throw new LogoError('storage');
  } finally {
    await handle?.close().catch(() => {});
  }
}
