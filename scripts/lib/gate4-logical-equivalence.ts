import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { inspectLogo } from './client-logo-image';
import { gate4CanonicalMultiset, type Gate4ManifestRow } from './gate4-csv';
import { gate4CodePoint } from './gate4-contract';
import type { Gate4ExtractedTable, Gate4Extraction } from './gate4-extraction';

type DigestCount = Readonly<{ rows: number; digest: string }>;

export type Gate4LogoLogicalEvidence = Readonly<{
  rows: number;
  uniqueParents: number;
  uniquePaths: number;
  totalBytes: number;
  digest: string;
}>;

export type Gate4LogicalEvidence = Readonly<{
  parentRows: number;
  tableCount: number;
  columns: DigestCount;
  relationships: DigestCount;
  tables: readonly Readonly<{ name: string; rows: number; digest: string }>[];
  combinedTablesDigest: string;
  complex: readonly Readonly<{ name: string; rows: number; parents: number; digest: string }>[];
  combinedComplexDigest: string;
  complexRows: number;
  logos: Gate4LogoLogicalEvidence;
  combinedDigest: string;
}>;

export const GATE4_LOGICAL_BASELINE: Gate4LogicalEvidence = {
  parentRows: 30_885,
  tableCount: 17,
  columns: {
    rows: 194,
    digest: '215b0ad3e9c9ff76f1c5701c3aec5fb5f99009327e464f6b0edea64612ac97cb',
  },
  relationships: {
    rows: 17,
    digest: '10c723aecd820cdeb982ea9ae2f4e6f9ea565fb366fafd3bb23455fbcda29ba4',
  },
  tables: [
    {
      name: 'Attendance',
      rows: 4022,
      digest: 'f4ba2f9beff5e5b9d7dd251106c5b251bde5d817bdb3b64b31fa578803f522d7',
    },
    {
      name: 'Contacts',
      rows: 188,
      digest: '2cd82b8657c92866102d51a4a69fae95dbb8aec3e40e8abbf9cbbf38f42901da',
    },
    {
      name: 'LawyerShare4Invoices',
      rows: 0,
      digest: '52a4b07be95446d7a0aab052d71d5ff0d2d9dc2f311a1ee7cb5c0038509d8d99',
    },
    {
      name: 'admin work table',
      rows: 4238,
      digest: 'f520be62006ab11306a8ebc87f22d2f9f9e977cf19d33cc7fb68779f1a70ce79',
    },
    {
      name: 'lawyers',
      rows: 23,
      digest: 'deed5670767bb93f1e96697396ef5bd666e4245f1dd35deed262620639889c5d',
    },
    {
      name: 'إجراءات المهام',
      rows: 4252,
      digest: 'b74bdb829985c8cec34d71b69a6ff854c2da5c3fb24f023b679cb936bd90cd62',
    },
    {
      name: 'التوكيلات',
      rows: 752,
      digest: '0278628971194b170415b7c298b1428c5bab2b748c0c7f40b4397eb029ada3ce',
    },
    {
      name: 'الجلسات',
      rows: 13_382,
      digest: 'af62de1d3dafa0f897becff09d32c09963ba0914284533c93ea9b18284d25e22',
    },
    {
      name: 'الدعاوى',
      rows: 1744,
      digest: '4e9627ae2fd0796e8886fcaf6470377733f35703a265f99d7312574a5048e3b2',
    },
    {
      name: 'السداد',
      rows: 597,
      digest: '9b6f4938a412f5ac092cc17d585789e5f2f6585731390f09b69680185f25fc5e',
    },
    {
      name: 'العملاء',
      rows: 318,
      digest: '9fa349f0e2d2c69e7db8fa8fca268691745b71462b47c383050bb808c1d4312a',
    },
    {
      name: 'الفواتير',
      rows: 543,
      digest: '11fd14463b57f498f98320b7342351b7a98ea7a62dc0fb484eb3465de177c64f',
    },
    {
      name: 'المحامين',
      rows: 38,
      digest: '236e174b3e9bd8f89b2501b23baaacfe1be91d11a400b8afb0cdcd80076f72fb',
    },
    {
      name: 'المستندات',
      rows: 407,
      digest: 'b0437b96ae824155fe1d280d9dc6718d8c0b382ace4d9cee1a95ab7bfad8b5ce',
    },
    {
      name: 'تقسيم التحصيلات',
      rows: 47,
      digest: '79b4581e3e10f824e07f7ab8492ff1ac0104b655260fe50ba00f34a1641959f1',
    },
    {
      name: 'خطابات الأتعاب',
      rows: 331,
      digest: 'd6362babfe299fedea3268fcb81ffdb87d368a3bd21f8889b1eed79478b06722',
    },
    {
      name: 'فريق العمل',
      rows: 3,
      digest: 'e7a5067dd9c47bb9cd662bd689203634e11b396cfa8b32a5eb157659f94e591f',
    },
  ],
  combinedTablesDigest: '90933ba285cd566c0137d5b4e8cc4a53de1ebd65e4624bdfa8ee2d2142f87f6c',
  complex: [
    {
      name: 'Contacts.Attachments',
      rows: 0,
      parents: 0,
      digest: '387f56a79ded1314d4e99e8b2e5334f34dc78c6d5aa890b8d205e0b9fa6abec8',
    },
    {
      name: 'العملاء.logo',
      rows: 54,
      parents: 54,
      digest: 'bcfb81e6fd9d6cb93b22f1710d5afdfe16fe1ad435334655d914e41116aa5914',
    },
    {
      name: 'خطابات الأتعاب.Matter',
      rows: 288,
      parents: 195,
      digest: '4565fbcc9d453964f9d5004601655c0cd646878a6dabe0bd67a00fdb16351e92',
    },
  ],
  combinedComplexDigest: 'b577f116943418b5883cb2c42a7b4e2edd46ffbb96e1d1b7b84ccdb041383f96',
  complexRows: 342,
  logos: {
    rows: 54,
    uniqueParents: 54,
    uniquePaths: 54,
    totalBytes: 1_541_428,
    digest: '4e0f4a4b47e6fa9153ec3bb1f6be2badaa9bec6877680a27e3729a70c1d54a9b',
  },
  combinedDigest: 'eadfe3b44de0169ce9871fbb51a563bb9888d5f5fff43489b848a8ef5113ac8e',
};

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function canonicalRows(rows: readonly Gate4ManifestRow[]): readonly string[] {
  return rows
    .map((row) =>
      JSON.stringify(
        Object.fromEntries(
          Object.entries(row).sort(([left], [right]) => gate4CodePoint(left, right)),
        ),
      ),
    )
    .sort(gate4CodePoint);
}

function tableEvidence(table: Gate4ExtractedTable): { name: string; rows: number; digest: string } {
  return {
    name: table.name,
    rows: table.rows.length,
    digest: digest({
      header: table.csv.header,
      multiset: gate4CanonicalMultiset(table.csv.records),
    }),
  };
}

function complexEvidence(table: Gate4ExtractedTable): {
  name: string;
  rows: number;
  parents: number;
  digest: string;
} {
  const parents = table.rows.map((row) => row.values['parent_key']);
  if (parents.some((parent) => parent == null))
    throw new Error(`${table.name}: complex row has no parent_key`);
  const evidence = tableEvidence(table);
  return {
    name: evidence.name,
    rows: evidence.rows,
    parents: new Set(parents).size,
    digest: evidence.digest,
  };
}

function safeStoredPath(root: string, storedPath: string): string {
  const candidate = resolve(root, 'attachments', ...storedPath.split(/[\\/]/u));
  const rel = relative(resolve(root, 'attachments'), candidate);
  if (rel === '' || rel.startsWith(`..${sep}`) || rel === '..' || rel.includes(':'))
    throw new Error(`unsafe extracted attachment path: ${storedPath}`);
  return candidate;
}

async function logoEvidence(extraction: Gate4Extraction): Promise<Gate4LogoLogicalEvidence> {
  const table = extraction.complex.get('العملاء.logo');
  if (table === undefined) throw new Error('client logo complex export is absent');
  const logical: Array<Readonly<Record<string, string | number>>> = [];
  const paths = new Set<string>();
  const parents = new Set<string>();
  for (const row of table.rows) {
    const parent = row.values['parent_key'];
    const fileName = row.values['file_name'];
    const fileType = row.values['file_type'];
    const declaredBytes = row.values['byte_size'];
    const storedPath = row.values['stored_path'];
    if (
      parent == null ||
      fileName == null ||
      fileType == null ||
      declaredBytes == null ||
      storedPath == null
    )
      throw new Error('client logo export contains a NULL evidence field');
    if (paths.has(storedPath)) throw new Error(`duplicate client logo path: ${storedPath}`);
    if (parents.has(parent)) throw new Error(`duplicate client logo parent: ${parent}`);
    paths.add(storedPath);
    parents.add(parent);
    const bytes = await readFile(safeStoredPath(extraction.root, storedPath));
    const inspected = inspectLogo(bytes, fileName, fileType);
    if (String(inspected.byteSize) !== declaredBytes)
      throw new Error(
        `${storedPath}: actual/declaration bytes ${inspected.byteSize}/${declaredBytes}`,
      );
    logical.push({
      parent,
      fileName,
      fileType,
      storedPath: storedPath.replaceAll('\\', '/'),
      byteSize: inspected.byteSize,
      mime: inspected.contentType,
      sha256: inspected.sha256,
    });
  }
  const logoDirectory = resolve(extraction.root, 'attachments', 'العملاء__logo');
  const actualFiles = (await readdir(logoDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => `العملاء__logo/${entry.name}`)
    .sort(gate4CodePoint);
  const referenced = [...paths].map((path) => path.replaceAll('\\', '/')).sort(gate4CodePoint);
  if (JSON.stringify(actualFiles) !== JSON.stringify(referenced))
    throw new Error('logo directory has a missing or unreferenced file');
  logical.sort((left, right) => gate4CodePoint(JSON.stringify(left), JSON.stringify(right)));
  return {
    rows: logical.length,
    uniqueParents: parents.size,
    uniquePaths: paths.size,
    totalBytes: logical.reduce((sum, row) => sum + Number(row['byteSize']), 0),
    digest: digest(logical),
  };
}

export async function buildGate4LogicalEvidence(
  extraction: Gate4Extraction,
): Promise<Gate4LogicalEvidence> {
  const tables = [...extraction.tables.values()]
    .map(tableEvidence)
    .sort((left, right) => gate4CodePoint(left.name, right.name));
  const complex = [...extraction.complex.values()]
    .map(complexEvidence)
    .sort((left, right) => gate4CodePoint(left.name, right.name));
  const columns = {
    rows: extraction.columns.length,
    digest: digest(canonicalRows(extraction.columns)),
  };
  const relationships = {
    rows: extraction.relationships.length,
    digest: digest(canonicalRows(extraction.relationships)),
  };
  const logos = await logoEvidence(extraction);
  const evidenceWithoutCombined = {
    parentRows: extraction.parentRows,
    tableCount: tables.length,
    columns,
    relationships,
    tables,
    combinedTablesDigest: digest(tables),
    complex,
    combinedComplexDigest: digest(complex),
    complexRows: extraction.complexRows,
    logos,
  };
  return { ...evidenceWithoutCombined, combinedDigest: digest(evidenceWithoutCombined) };
}

export function gate4LogicalEvidenceFailures(
  expected: Gate4LogicalEvidence,
  actual: Gate4LogicalEvidence,
): string[] {
  const failures: string[] = [];
  const compare = (label: string, left: unknown, right: unknown): void => {
    if (JSON.stringify(left) !== JSON.stringify(right)) failures.push(label);
  };
  compare('parent row count', expected.parentRows, actual.parentRows);
  compare('table count', expected.tableCount, actual.tableCount);
  compare('column definitions', expected.columns, actual.columns);
  compare('relationship definitions', expected.relationships, actual.relationships);
  compare('per-table multisets', expected.tables, actual.tables);
  compare('combined table digest', expected.combinedTablesDigest, actual.combinedTablesDigest);
  compare('per-complex multisets', expected.complex, actual.complex);
  compare('combined complex digest', expected.combinedComplexDigest, actual.combinedComplexDigest);
  compare('complex row count', expected.complexRows, actual.complexRows);
  compare('logo evidence', expected.logos, actual.logos);
  compare('combined logical digest', expected.combinedDigest, actual.combinedDigest);
  return failures;
}

export function gate4LogicalFixtureEvidence(
  tables: readonly Readonly<{ name: string; rows: readonly (readonly (string | null)[])[] }>[],
): string {
  return digest(
    tables
      .map((table) => ({
        name: table.name,
        rows: table.rows.length,
        multiset: [...table.rows]
          .map((row) => JSON.stringify(row))
          .sort(gate4CodePoint)
          .reduce<Array<{ canonical: string; occurrences: number }>>((output, canonical) => {
            const last = output.at(-1);
            if (last?.canonical === canonical) last.occurrences += 1;
            else output.push({ canonical, occurrences: 1 });
            return output;
          }, []),
      }))
      .sort((left, right) => gate4CodePoint(left.name, right.name)),
  );
}
