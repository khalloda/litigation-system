/** Ordinary account administration never accepts capability fields. */
export function validManagementForm(form: FormData, allowed: readonly string[]): boolean {
  const seen = new Set<string>();
  for (const [key, value] of form.entries()) {
    // React Server Action transport metadata is not application input.
    if (/^\$ACTION_[A-Za-z0-9_:]+$/u.test(key)) continue;
    if (!allowed.includes(key) || seen.has(key) || typeof value !== 'string') return false;
    seen.add(key);
  }
  return true;
}

export function validManagementKeys(input: object, allowed: readonly string[]): boolean {
  return (
    Object.getPrototypeOf(input) === Object.prototype &&
    Object.getOwnPropertySymbols(input).length === 0 &&
    Object.getOwnPropertyNames(input).every((key) => allowed.includes(key))
  );
}
