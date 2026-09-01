import assert from 'node:assert/strict';

export function decodeUrlPassword(url: URL, variable: string): string {
  try {
    const decoded = decodeURIComponent(url.password);
    assert.ok(decoded, `${variable} requires a password`);
    return decoded;
  } catch (error) {
    if (error instanceof URIError) {
      throw new Error(`${variable} password is not valid URL percent-encoding`);
    }
    throw error;
  }
}

export function postgresqlStringLiteral(value: string): string {
  assert.equal(value.includes('\0'), false, 'database password contains a null byte');
  return `E'${value.replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
}
