import { createHash } from 'node:crypto';

export type SourceField = {
  text: string;
  quoted: boolean;
};

/**
 * Encode one parsed CSV record without losing the difference between NULL
 * (an unquoted empty field) and the deliberately cleared empty string ("").
 * Length-prefixing makes field boundaries unambiguous even when the source
 * text itself contains separators, newlines, or Arabic punctuation.
 *
 * The PostgreSQL twin is `_migration.source_record_hash(text, text[])`.
 * Keep the two implementations covered by the database identity test.
 */
export function sourceRecordHash(table: string, fields: readonly SourceField[]): string {
  let canonical = `${table}\x1f`;
  for (const field of fields) {
    if (field.text === '' && !field.quoted) {
      canonical += 'N;';
    } else {
      canonical += `T${Buffer.byteLength(field.text, 'utf8')}:${field.text};`;
    }
  }
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Two source records can genuinely be byte-for-byte identical. They still
 * need separate staging identities, so the occurrence within that identical
 * content group is appended. Reordering different rows does not change this;
 * reordering identical rows is immaterial because the rows are identical.
 */
export function sourceRecordKeys(
  table: string,
  records: readonly { fields: readonly SourceField[] }[],
): string[] {
  const occurrences = new Map<string, number>();
  return records.map((record) => {
    const hash = sourceRecordHash(table, record.fields);
    const occurrence = (occurrences.get(hash) ?? 0) + 1;
    occurrences.set(hash, occurrence);
    return `${hash}:${String(occurrence).padStart(6, '0')}`;
  });
}
