/** Parse a JSON request while rejecting duplicate object keys. JSON.parse alone
 * silently keeps the final value, which would make a signed/retried mutation
 * ambiguous between the browser, server action and PostgreSQL jsonb parser. */
export function parseStrictJson(raw: string): unknown {
  const parsed: unknown = JSON.parse(raw);
  const stack: ({ keys: Set<string>; expectsKey: boolean } | null)[] = [];
  for (const token of raw.matchAll(
    /"(?:\\.|[^"\\])*"|[{}\[\],:]|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/gu,
  )) {
    const value = token[0];
    if (value === '{') stack.push({ keys: new Set(), expectsKey: true });
    else if (value === '[') stack.push(null);
    else if (value === '}' || value === ']') stack.pop();
    else {
      const current = stack.at(-1);
      if (current && value === ',') current.expectsKey = true;
      else if (current?.expectsKey && value.startsWith('"')) {
        const key = JSON.parse(value) as string;
        if (current.keys.has(key)) throw new SyntaxError('Duplicate JSON object key');
        current.keys.add(key);
        current.expectsKey = false;
      }
    }
  }
  return parsed;
}
