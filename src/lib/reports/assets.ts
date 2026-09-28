import { readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { ReportError } from './types';

// Static instances of official Noto Sans Arabic 2.012: complete reviewed sfnt bytes.
const fontFiles = [
  {
    file: 'NotoSansArabic-Regular.ttf',
    weight: 400,
    bytes: 194336,
    sha256: 'd266231e48dccbcd141f0bdcbf6160a4c7081b9978b0699b75038022267c7f9b',
    family: 'Noto Sans Arabic',
    coverage: 1561,
  },
  {
    file: 'NotoSansArabic-SemiBold.ttf',
    weight: 600,
    bytes: 194656,
    sha256: '2ad2e893bcafa0a92e85787085746128816d84d8d79cc108b92db3d6c6e43632',
    family: 'Noto Sans Arabic SemiBold',
    coverage: 1561,
  },
  {
    file: 'NotoSansArabic-Bold.ttf',
    weight: 700,
    bytes: 194520,
    sha256: '8d78c144858feea35755198b2ab3de1ab99c15eecfd7c784eaf78c775aedab88',
    family: 'Noto Sans Arabic',
    coverage: 1561,
  },
] as const;
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
    fontFiles.map(async (entry) => {
      const font = await read(`public/fonts/${entry.file}`, 2 * 1024 * 1024);
      if (
        font.readUInt32BE(0) !== 0x00010000 ||
        createHash('sha256').update(font).digest('hex') !== entry.sha256
      )
        throw new ReportError('generation');
      return font;
    }),
  );
  const [logo, emblem] = await Promise.all(
    ['logo', 'emblem'].map((n) => read(`assets/${n}.png`, 4 * 1024 * 1024)),
  );
  for (const image of [logo!, emblem!])
    await sharp(image, { failOn: 'warning', limitInputPixels: 16000000 }).raw().toBuffer();
  return { fonts, logo: logo!, emblem: emblem! };
}
