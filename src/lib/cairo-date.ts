/** Gregorian calendar date at an instant, independent of host and browser timezone. */
export function cairoDate(instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    calendar: 'gregory',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const value = (kind: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === kind)!.value;
  return `${value('year').padStart(4, '0')}-${value('month')}-${value('day')}`;
}
