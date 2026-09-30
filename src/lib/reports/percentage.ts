/** Half-up rounding at the display boundary, from exact nonnegative counts. */
export function countPercentage(numerator: number, denominator: number): string | null {
  if (
    !Number.isSafeInteger(numerator) ||
    !Number.isSafeInteger(denominator) ||
    numerator < 0 ||
    denominator < 0 ||
    numerator > denominator
  )
    throw new RangeError('Invalid report counts');
  if (!denominator) return null;
  const divisor = BigInt(denominator);
  const hundredths = (BigInt(numerator) * 20000n + divisor) / (2n * divisor);
  return `${hundredths / 100n}.${String(hundredths % 100n).padStart(2, '0')}`;
}
