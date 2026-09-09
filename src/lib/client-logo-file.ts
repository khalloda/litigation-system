import { constants } from 'node:fs';
import { open, realpath, lstat, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import sharp from 'sharp';
import type { Session } from 'next-auth';
import { decideAuthorization, requireAuthorizedDecision } from './auth/authorization-core';
import { inspectLogo, safeRelativeLogoPath } from './client-logo-image';
import type { LogoMetadata } from './client-query';

export const MAX_EXISTING_LOGO_BYTES = 2 * 1024 * 1024;
function contains(root: string, path: string) {
  const suffix = relative(root, path);
  return suffix !== '' && !isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith('..' + sep);
}
/** Metadata is read by client identity from PostgreSQL. No request path reaches
 * this resolver. Reject links, validate resolved paths at both ends of the read,
 * and read at most the verified size plus one byte from the same open handle. */
export async function readClientLogoFile(
  session: Session | null,
  root: string | undefined,
  metadata: LogoMetadata | null,
) {
  requireAuthorizedDecision(decideAuthorization(session, 'clientLogoUpload', 'view'));
  if (!root || !metadata) return null;
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const { clientId, fileName, byteSize, sha256, contentType, relativePath } = metadata;
    if (
      !Number.isSafeInteger(byteSize) ||
      byteSize <= 0 ||
      byteSize > MAX_EXISTING_LOGO_BYTES ||
      !/^[a-f0-9]{64}$/u.test(sha256)
    )
      return null;
    if (/[<>:"|?*]/u.test(fileName) || relativePath !== safeRelativeLogoPath(clientId, fileName))
      return null;
    const base = await realpath(resolve(root));
    const directory = resolve(base, String(clientId));
    const path = resolve(directory, fileName);
    if (!contains(base, directory) || !contains(directory, path)) return null;
    const directoryInfo = await lstat(directory);
    const entry = await lstat(path);
    if (
      !directoryInfo.isDirectory() ||
      directoryInfo.isSymbolicLink() ||
      !entry.isFile() ||
      entry.isSymbolicLink()
    )
      return null;
    if ((await realpath(directory)) !== directory || (await realpath(path)) !== path) return null;
    file = await open(path, constants.O_RDONLY);
    const before = await file.stat();
    if (
      !before.isFile() ||
      before.size !== byteSize ||
      before.dev !== entry.dev ||
      before.ino !== entry.ino
    )
      return null;
    const bytes = Buffer.alloc(byteSize + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const read = await file.read(bytes, offset, bytes.length - offset, offset);
      if (read.bytesRead === 0) break;
      offset += read.bytesRead;
    }
    if (offset !== byteSize) return null;
    const after = await file.stat();
    const current = await stat(path);
    if (
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs ||
      current.dev !== after.dev ||
      current.ino !== after.ino ||
      (await realpath(directory)) !== directory ||
      (await realpath(path)) !== path
    )
      return null;
    const data = bytes.subarray(0, byteSize);
    const inspected = inspectLogo(data, fileName);
    if (inspected.contentType !== contentType || inspected.sha256 !== sha256) return null;
    // Decode all frames with the installed Next.js image dependency. Bytes
    // served remain original; there is no upload, resize or public optimizer.
    const decoder = sharp(data, {
      animated: true,
      failOn: 'warning',
      limitInputPixels: 16_000_000,
    });
    const info = await decoder.metadata();
    if (!info.width || !info.height || info.width * info.height * (info.pages ?? 1) > 16_000_000)
      return null;
    await decoder.raw().toBuffer();
    return { data, contentType: inspected.contentType };
  } catch {
    return null;
  } finally {
    await file?.close().catch(() => {});
  }
}
