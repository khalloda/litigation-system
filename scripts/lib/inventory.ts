/*
 * Reading the container's inventory of what a reset would destroy.
 *
 * Kept apart from scripts/db-reset.ts for the same reason Gate 1 is kept apart
 * from the extractor: so it can be tested directly, by handing it replies that
 * a real database is awkward to produce.
 *
 * ---------------------------------------------------------------------------
 *  THE RULE THIS FILE EXISTS TO ENFORCE
 * ---------------------------------------------------------------------------
 *
 * A value that cannot be understood is a REFUSAL — never a zero, never a pass.
 *
 * The inventory used to arrive as `schema|table|count` and be split on the
 * pipe. A table named `review|guard_fixture` broke the parse: the count landed
 * in the wrong field, Number('guard_fixture') gave NaN, and three real rows
 * were reported as an empty table. The guard then said deletion was permitted.
 *
 * Escaping the delimiter would only move the problem, because a delimited
 * string cannot carry a value containing its own delimiter. The format was
 * wrong. So the inventory is JSON now, and every field is checked on arrival.
 *
 * The same fault, three times in this project:
 *   - the roster generator reported "0 mentions" for a name it had failed to
 *     match, and two duplicate people were created
 *   - Gate 1 read a missing table as a total that happened to add up
 *   - this guard read an unparseable count as an empty table
 *
 * Each time, something unreadable was quietly treated as nothing.
 */

export type TableCount = { database: string; schema: string; table: string; rows: number };

export function parseContainerJson(raw: string, what: string): unknown {
  if (raw.trim() === '') {
    throw new Error(`${what}: the container returned nothing`);
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`${what}: the reply was not valid JSON — ${raw.slice(0, 200)}`);
  }
}

export function parseDatabaseList(raw: string): string[] {
  const what = 'listing the databases';
  const parsed = parseContainerJson(raw, what);
  if (!Array.isArray(parsed)) {
    throw new Error(`${what}: expected a JSON array`);
  }
  return parsed.map((name, i) => {
    if (typeof name !== 'string' || name === '') {
      throw new Error(`${what}: entry ${i} is not a name — ${JSON.stringify(name)}`);
    }
    return name;
  });
}

export function parseTableCounts(raw: string, database: string): TableCount[] {
  const what = `counting rows in "${database}"`;
  const parsed = parseContainerJson(raw, what);
  if (!Array.isArray(parsed)) {
    throw new Error(`${what}: expected a JSON array`);
  }

  return parsed.map((entry, i) => {
    const where = `${what}, entry ${i}`;
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`${where}: not an object — ${JSON.stringify(entry)}`);
    }
    const { schema, table, rows } = entry as Record<string, unknown>;

    if (typeof schema !== 'string' || schema === '') {
      throw new Error(`${where}: schema is not a name — ${JSON.stringify(schema)}`);
    }
    if (typeof table !== 'string' || table === '') {
      throw new Error(`${where}: table is not a name — ${JSON.stringify(table)}`);
    }
    /*
     * A whole number, zero or more. Anything else — a string, null, a float,
     * a negative, a missing key — means the reply was not understood, and an
     * ununderstood reply must never be read as an empty table.
     */
    if (typeof rows !== 'number' || !Number.isInteger(rows) || rows < 0) {
      throw new Error(
        `${where}: the row count for ${schema}.${table} is not a whole number — ` +
          `${JSON.stringify(rows)}`,
      );
    }
    return { database, schema, table, rows };
  });
}
