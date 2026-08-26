import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { basename, extname, isAbsolute, normalize, sep } from 'node:path';

export type SupportedLogoMime = 'image/gif' | 'image/jpeg' | 'image/png';

export type InspectedLogo = Readonly<{
  contentType: SupportedLogoMime;
  byteSize: number;
  sha256: string;
}>;

const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;
const CONTROL = /[\u0000-\u001f\u007f]/u;

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function validPng(buffer: Buffer): boolean {
  if (buffer.length < 45 || !buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))
    return false;
  let offset = 8;
  let first = true;
  let ended = false;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > buffer.length) return false;
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = buffer.readUInt32BE(offset + 8 + length);
    if (crc32(buffer.subarray(offset + 4, offset + 8 + length)) !== expectedCrc) return false;
    if (first) {
      if (
        type !== 'IHDR' ||
        length !== 13 ||
        data.readUInt32BE(0) === 0 ||
        data.readUInt32BE(4) === 0
      )
        return false;
      first = false;
    }
    offset = end;
    if (type === 'IEND') {
      ended = length === 0;
      break;
    }
  }
  return ended && offset === buffer.length;
}

function validGif(buffer: Buffer): boolean {
  if (buffer.length < 14) return false;
  const header = buffer.subarray(0, 6).toString('ascii');
  return (
    (header === 'GIF87a' || header === 'GIF89a') &&
    buffer.readUInt16LE(6) > 0 &&
    buffer.readUInt16LE(8) > 0 &&
    buffer.at(-1) === 0x3b
  );
}

function validJpeg(buffer: Buffer): boolean {
  if (buffer.length < 20 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return false;
  let offset = 2;
  let hasFrame = false;
  let hasScan = false;
  while (offset < buffer.length) {
    while (offset < buffer.length && buffer[offset] !== 0xff) offset++;
    if (offset >= buffer.length) return false;
    while (offset < buffer.length && buffer[offset] === 0xff) offset++;
    if (offset >= buffer.length) return false;
    const marker = buffer[offset++]!;
    if (marker === 0xd9) {
      for (; offset < buffer.length; offset++) {
        const byte = buffer[offset]!;
        if (byte !== 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) return false;
      }
      return hasFrame && hasScan;
    }
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 2 > buffer.length) return false;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) return false;
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      if (
        length < 8 ||
        buffer.readUInt16BE(offset + 3) === 0 ||
        buffer.readUInt16BE(offset + 5) === 0
      )
        return false;
      hasFrame = true;
    }
    if (marker === 0xda) hasScan = true;
    offset += length;
  }
  return false;
}

function mimeForExtension(fileName: string): SupportedLogoMime | null {
  switch (extname(fileName).toLowerCase()) {
    case '.gif':
      return 'image/gif';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    default:
      return null;
  }
}

export function assertSafeLogoFileName(fileName: string): void {
  assert.ok(fileName.length > 0, 'logo filename is empty');
  assert.equal(fileName, basename(fileName), `unsafe logo filename: ${fileName}`);
  assert.ok(!isAbsolute(fileName), `absolute logo filename: ${fileName}`);
  assert.ok(
    !fileName.includes('/') && !fileName.includes('\\'),
    `separator in logo filename: ${fileName}`,
  );
  assert.ok(!CONTROL.test(fileName), `control character in logo filename: ${fileName}`);
  assert.ok(fileName !== '.' && fileName !== '..', `unsafe logo filename: ${fileName}`);
  assert.ok(
    !fileName.endsWith('.') && !fileName.endsWith(' '),
    `unsafe trailing character: ${fileName}`,
  );
  assert.ok(!WINDOWS_RESERVED.test(fileName), `Windows-reserved logo filename: ${fileName}`);
}

export function safeRelativeLogoPath(clientId: number, fileName: string): string {
  assert.ok(Number.isSafeInteger(clientId) && clientId > 0, `invalid client id: ${clientId}`);
  assertSafeLogoFileName(fileName);
  const relative = `${clientId}/${fileName}`;
  assert.ok(!isAbsolute(relative) && !normalize(relative).startsWith(`..${sep}`));
  return relative;
}

export function assertNoCaseInsensitiveLogoPathCollisions(paths: readonly string[]): void {
  const folded = new Set<string>();
  for (const path of paths) {
    const key = path.toLocaleLowerCase('en-US');
    assert.ok(!folded.has(key), `case-insensitive logo path collision: ${path}`);
    folded.add(key);
  }
}

export function inspectLogo(
  buffer: Buffer,
  fileName: string,
  declaredType?: string,
): InspectedLogo {
  assert.ok(buffer.length > 0, `${fileName}: zero-byte source`);
  assertSafeLogoFileName(fileName);
  let contentType: SupportedLogoMime | null = null;
  if (validPng(buffer)) contentType = 'image/png';
  else if (validJpeg(buffer)) contentType = 'image/jpeg';
  else if (validGif(buffer)) contentType = 'image/gif';
  assert.ok(contentType, `${fileName}: unsupported, corrupt or truncated image`);
  assert.equal(
    mimeForExtension(fileName),
    contentType,
    `${fileName}: signature/extension mismatch`,
  );
  if (declaredType !== undefined) {
    const declared = declaredType.trim().replace(/^\./u, '').toLowerCase();
    const declaredMime =
      declared === 'png'
        ? 'image/png'
        : declared === 'gif'
          ? 'image/gif'
          : declared === 'jpg' || declared === 'jpeg'
            ? 'image/jpeg'
            : null;
    assert.equal(declaredMime, contentType, `${fileName}: declared type/signature mismatch`);
  }
  return {
    contentType,
    byteSize: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
}
