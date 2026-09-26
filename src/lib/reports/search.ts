/** Selector-only mirror of migration 20260823073815 ar_normalise.
 * Selection and database predicates always use IDs, never this search text. */
export function reportSearchText(value: string): string {
  const from = [...'أإآٱةىؤئ٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹'];
  const to = [...'ااااهيوي01234567890123456789'];
  return [...value.replace(/[\u064b-\u0652\u0640\u0670]/gu, '')]
    .map((c) => to.at(from.indexOf(c) < 0 ? to.length : from.indexOf(c)) ?? c)
    .join('')
    .toLowerCase()
    .replace(/ /gu, '');
}
