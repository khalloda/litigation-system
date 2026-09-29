// Only validated numeric identity is carried across the canonical record route.
// Filter serialization remains owned by matter-query; arbitrary return URLs are never accepted.
export function workspaceSelection(value: string | string[] | undefined): number | null {
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/u.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}
export function selectedWorkspaceHref(listHref: string, id: number): string {
  return `${listHref}${listHref.includes('?') ? '&' : '?'}selected=${id}`;
}
