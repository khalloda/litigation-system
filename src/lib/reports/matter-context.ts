import { matterReturnHref, MatterFilterError } from '@/lib/matter-query';
import { reportClientContext } from './client-context';

/** Presentation-only return path. Reuse the matter filter validator and permit
 * only the selected numeric workspace identity in addition to that contract. */
export function reportMatterReturn(value: string | string[] | undefined): string {
  if (!value) return '';
  if (
    typeof value !== 'string' ||
    value.length > 3000 ||
    !/^\/matters(?:\/[1-9]\d{0,9})?(?:\?|$)/u.test(value)
  )
    throw new MatterFilterError('invalid matter return');
  const url = new URL(value, 'http://localhost');
  const selected = url.searchParams.getAll('selected');
  if (!selected.length) return matterReturnHref(value);
  if (selected.length !== 1 || url.pathname !== '/matters' || url.hash)
    throw new MatterFilterError('invalid selected return');
  const id = reportClientContext(selected[0]);
  if (id === null) throw new MatterFilterError('invalid selected return');
  url.searchParams.delete('selected');
  const base = matterReturnHref(url.pathname + url.search);
  return `${base}${base.includes('?') ? '&' : '?'}selected=${id}`;
}
