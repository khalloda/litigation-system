import { readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ReportError } from './types';

const fontNames = ['arabic', 'latin', 'latin-ext'] as const;
export async function reportAssets() {
  // Explicit deployment-owned root works with a stable Next build on Windows,
  // regardless of the process/editor working directory. It is never a request field.
  const configured = process.env['REPORT_ASSET_ROOT'];
  if (!configured || !path.isAbsolute(configured)) throw new ReportError('generation');
  const root = await realpath(configured);
  async function read(name: string, maximum: number) {
    const file = path.join(root, name);
    const entry = await lstat(file);
    if (
      !entry.isFile() ||
      entry.isSymbolicLink() ||
      entry.size > maximum ||
      entry.size < 12 ||
      (await realpath(file)) !== file
    )
      throw new ReportError('generation');
    const bytes = await readFile(file);
    if (bytes.length !== entry.size) throw new ReportError('generation');
    return bytes;
  }
  const fonts = await Promise.all(
    fontNames.map((n) =>
      read(`public/fonts/noto-naskh-arabic-${n}-wght-normal.woff2`, 2 * 1024 * 1024),
    ),
  );
  if (fonts.some((b) => b.subarray(0, 4).toString() !== 'wOF2'))
    throw new ReportError('generation');
  const [logo, emblem] = await Promise.all(
    ['logo', 'emblem'].map((n) => read(`assets/${n}.png`, 4 * 1024 * 1024)),
  );
  for (const image of [logo!, emblem!])
    await sharp(image, { failOn: 'warning', limitInputPixels: 16000000 }).raw().toBuffer();
  return { fonts, logo: logo!, emblem: emblem! };
}
