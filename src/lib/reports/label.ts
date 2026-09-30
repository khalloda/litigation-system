import type { ReportOption } from './types';

/** Native option elements cannot contain bdi children. Isolates are display-only:
 * canonical labels stay untouched for search, payloads and Excel metadata. */
export function reportOptionDisplay(option: ReportOption): string {
  if (!option.parts) return option.label;
  return option.parts
    .map((part) =>
      part.value
        .split('\n')
        .map((line) => {
          const firstLetter = line.match(/\p{Letter}/u)?.[0];
          const rtl =
            firstLetter !== undefined && /[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(firstLetter);
          return `${rtl ? '\u2067' : '\u2066'}${line}\u2069`;
        })
        .join('\n'),
    )
    .join(' — ');
}
