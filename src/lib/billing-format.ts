/** Decimal strings only: no IEEE-754 conversion of stored money or shares. */
export function billingDecimal(value: string | null): string | null {
  if (value === null) return null;
  if (!/^-?[0-9]+(?:\.[0-9]+)?$/u.test(value)) throw new Error('Invalid stored decimal');
  const [whole, fraction] = value.split('.');
  return (
    whole!.replace(/\B(?=(\d{3})+(?!\d))/gu, ',') + (fraction === undefined ? '' : '.' + fraction)
  );
}
export function billingPercent(value: string | null): string | null {
  if (value === null) return null;
  if (!/^[0-9]+(?:\.[0-9]+)?$/u.test(value)) throw new Error('Invalid stored share');
  const [whole, fraction = ''] = value.split('.');
  const padded = fraction.padEnd(2, '0');
  const integer = (whole + padded.slice(0, 2)).replace(/^0+(?=\d)/u, '');
  const rest = padded.slice(2).replace(/0+$/u, '');
  return integer + (rest ? '.' + rest : '') + '%';
}
