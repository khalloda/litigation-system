export function parseGate4AccessDate(value: string | null): string | null {
  if (value === null) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2}) 00:00:00$/u.exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
    ? `${match[1]}-${match[2]}-${match[3]}`
    : null;
}

export function isGate4CreatedAtSubstitution(values: {
  taskCreatedDate: string | null;
  sourceCreatedDate: string | null;
  createdAtDate: string;
}): boolean {
  const sourceDate = parseGate4AccessDate(values.sourceCreatedDate);
  return (
    values.taskCreatedDate !== null &&
    values.taskCreatedDate === values.createdAtDate &&
    values.taskCreatedDate !== sourceDate
  );
}
