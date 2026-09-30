import type { ReportOption } from './types';

/** Resolve each displayed line separately, including neutral numeric identifiers. */
export function reportLineDirection(line: string): 'rtl' | 'ltr' {
  const firstLetter = line.match(/\p{Letter}/u)?.[0];
  return firstLetter !== undefined && /[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(firstLetter)
    ? 'rtl'
    : 'ltr';
}

/** Native option elements cannot contain bdi children. Isolates are display-only:
 * canonical labels stay untouched for search, payloads and Excel metadata. */
export function reportOptionDisplay(option: ReportOption): string {
  if (!option.parts) return option.label;
  return option.parts
    .map((part) =>
      part.value
        .split('\n')
        .map((line) => {
          const rtl = reportLineDirection(line) === 'rtl';
          return `${rtl ? '\u2067' : '\u2066'}${line}\u2069`;
        })
        .join('\n'),
    )
    .join(' — ');
}
