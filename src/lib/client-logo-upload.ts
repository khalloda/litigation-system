import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { assertSafeLogoFileName, inspectLogo } from './client-logo-image';

export const LOGO_UPLOAD_LIMIT = 2 * 1024 * 1024;
export const LOGO_PIXEL_LIMIT = 16_000_000;
export const LOGO_FRAME_LIMIT = 100;
export const LOGO_PRINT_WIDTH = 1200;
export type LogoFailure =
  | 'invalid'
  | 'size'
  | 'storage'
  | 'stale'
  | 'session'
  | 'archived'
  | 'missing'
  | 'submission'
  | 'uncertain';
export class LogoError extends Error {
  constructor(public readonly code: LogoFailure) {
    super(code);
  }
}
export type PreparedLogo = {
  bytes: Buffer;
  originalName: string;
  contentType: 'image/png' | 'image/jpeg';
  extension: 'png' | 'jpg';
  sha256: string;
  inputSha256: string;
  width: number;
  height: number;
};

/** Decode the entire bounded source before converting the first frame for print.
 * Imported images never pass through this upload processor. */
export async function prepareLogo(
  bytes: Buffer,
  name: string,
  mime: string,
): Promise<PreparedLogo> {
  if (bytes.length === 0 || bytes.length > LOGO_UPLOAD_LIMIT) throw new LogoError('size');
  try {
    if (name.length > 180 || /[<>:"|?*]/u.test(name)) throw new LogoError('invalid');
    assertSafeLogoFileName(name);
    const detected = inspectLogo(bytes, name);
    if (mime !== detected.contentType) throw new LogoError('invalid');
    const options = { failOn: 'warning' as const, limitInputPixels: LOGO_PIXEL_LIMIT };
    const decoder = sharp(bytes, { ...options, animated: true }).timeout({ seconds: 10 });
    const info = await decoder.metadata();
    const frames = info.pages ?? 1;
    const frameHeight = info.pageHeight ?? info.height;
    if (
      !info.width ||
      !frameHeight ||
      frames > LOGO_FRAME_LIMIT ||
      info.width > 16000 ||
      frameHeight > 16000 ||
      info.width * frameHeight * frames > LOGO_PIXEL_LIMIT ||
      !['png', 'jpeg', 'gif'].includes(info.format ?? '')
    )
      throw new LogoError('invalid');
    await decoder.raw().toBuffer();
    const transformer = sharp(bytes, { ...options, page: 0, pages: 1 })
      .timeout({ seconds: 10 })
      .rotate()
      .resize({ width: LOGO_PRINT_WIDTH, withoutEnlargement: true });
    const jpeg = detected.contentType === 'image/jpeg';
    const result = await (jpeg ? transformer.jpeg({ quality: 90 }) : transformer.png()).toBuffer({
      resolveWithObject: true,
    });
    if (result.data.length > LOGO_UPLOAD_LIMIT) throw new LogoError('size');
    const extension = jpeg ? 'jpg' : 'png';
    const output = inspectLogo(result.data, `output.${extension}`);
    return {
      bytes: result.data,
      originalName: name,
      contentType: jpeg ? 'image/jpeg' : 'image/png',
      extension,
      sha256: output.sha256,
      inputSha256: createHash('sha256').update(bytes).digest('hex'),
      width: result.info.width,
      height: result.info.height,
    };
  } catch (error) {
    if (error instanceof LogoError) throw error;
    throw new LogoError('invalid');
  }
}
