import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../src/lib/db';
import { t } from '../src/strings';
import { activeClientContacts } from '../src/lib/reports/client-contacts';
import { clientJudgments } from '../src/lib/reports/client-judgments';
import { parseReportInput } from '../src/lib/reports/input';
import { validateDefinition, validateReportData } from '../src/lib/reports/result';
import type { ReportCell, ReportData, ReportGroup, ReportRow } from '../src/lib/reports/types';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { withApprovedMigrationClient } from './lib/migration-principal';

/** Independent source oracle: load normalized relations separately through the
 * ORM, then apply the traced Access predicates in memory. Production uses set
 * SQL. No production query, display helper or grouping helper builds expected
 * values. This test refuses the owner cluster and never writes fixture data. */
async function main() {
  const url = process.env['MIGRATION_DATABASE_URL'];
  assert.ok(url);
  await withApprovedMigrationClient((client) => assertIsolatedTestCluster(client, new URL(url)), {
    databaseUrl: url,
  });
  validateDefinition(activeClientContacts);
  validateDefinition(clientJudgments);
  const proof = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const clients = await tx.client.findMany({
        select: { id: true, nameAr: true, nameEn: true, status: true, cashOrProbono: true },
      });
      const contacts = await tx.contact.findMany({
        select: {
          id: true,
          clientId: true,
          contactName: true,
          email: true,
          jobTitle: true,
          businessPhone: true,
          mobilePhone: true,
          address: true,
          city: true,
          countryRegion: true,
        },
      });
      const matters = await tx.matter.findMany({
        select: { id: true, clientId: true, caseNumberAr: true, subject: true },
      });
      const hearings = await tx.hearing.findMany({
        select: {
          id: true,
          matterId: true,
          hearingDate: true,
          outcome: true,
          decision: true,
          courtId: true,
          circuit: true,
        },
      });
      const courts = await tx.lookupCourt.findMany({ select: { id: true, labelAr: true } });
      const parties = await tx.matterParty.findMany({
        select: {
          id: true,
          matterId: true,
          side: true,
          partyName: true,
          gender: true,
          ordinal: true,
          isRetired: true,
        },
      });
      const capacities = await tx.matterPartyRole.findMany({
        select: { id: true, partyId: true, roleId: true, ordinal: true, isRetired: true },
      });
      const labels = await tx.lookupPartyRole.findMany({
        select: { id: true, labelArM: true, labelArF: true },
      });
      const clientMap = new Map(clients.map((c) => [c.id, c]));
      const matterMap = new Map(matters.map((m) => [m.id, m]));
      const courtMap = new Map(courts.map((c) => [c.id, c.labelAr]));
      const labelMap = new Map(labels.map((c) => [c.id, c]));
      const text = (value: string | null): ReportCell =>
        value === null ? { type: 'null' } : { type: 'text', value };
      const contactGroups: { id: string; title: string; rows: ReportRow[] }[] = [];
      const expectedContacts = contacts
        .filter((c) => {
          const owner = c.clientId === null ? undefined : clientMap.get(c.clientId);
          return (
            owner?.status?.toLowerCase() === 'active' &&
            owner?.cashOrProbono?.toLowerCase() === 'cash'
          );
        })
        .sort((a, b) => {
          const x = clientMap.get(a.clientId!)!,
            y = clientMap.get(b.clientId!)!;
          const nameOrder =
            x.nameEn === null
              ? y.nameEn === null
                ? 0
                : 1
              : y.nameEn === null
                ? -1
                : Buffer.compare(Buffer.from(x.nameEn), Buffer.from(y.nameEn));
          return nameOrder || x.id - y.id || a.id - b.id;
        });
      for (const c of expectedContacts) {
        const owner = clientMap.get(c.clientId!)!;
        let group = contactGroups.at(-1);
        if (group?.id !== `client:${owner.id}`) {
          group = {
            id: `client:${owner.id}`,
            title: owner.nameAr + (owner.nameEn ? '\n' + owner.nameEn : ''),
            rows: [],
          };
          contactGroups.push(group);
        }
        group.rows.push({
          id: `contact:${c.id}`,
          cells: [
            c.contactName,
            c.email,
            c.jobTitle,
            c.businessPhone,
            c.mobilePhone,
            c.address,
            c.city,
            c.countryRegion,
          ].map(text),
        });
      }
      const actualContacts = await activeClientContacts.query(
        tx,
        parseReportInput(activeClientContacts.descriptor, new URLSearchParams('format=preview'))
          .parameters,
      );
      assert.deepEqual(actualContacts, {
        subtitle: '',
        sections: [{ id: 'contacts', title: t.clients.contacts, groups: contactGroups }],
        totals: [],
      });
      assert.equal(
        validateReportData(activeClientContacts.descriptor, actualContacts),
        expectedContacts.length,
      );
      const ordered = <T extends { id: number; ordinal: number | null }>(values: T[]) =>
        values.sort((a, b) => (a.ordinal ?? Infinity) - (b.ordinal ?? Infinity) || a.id - b.id);
      const side = (matterId: number, side: string): ReportCell => {
        const current = ordered(
          parties.filter((p) => p.matterId === matterId && p.side === side && !p.isRetired),
        );
        if (!current.length) return { type: 'null' };
        return text(
          current
            .map((p) => {
              const roles = ordered(capacities.filter((r) => r.partyId === p.id && !r.isRetired));
              return [
                p.partyName ?? t.reports.nullValue,
                ...roles.map((r) => {
                  const label = labelMap.get(r.roleId)!;
                  return '"' + (p.gender === 'f' ? label.labelArF : label.labelArM) + '"';
                }),
              ].join('\n');
            })
            .join('\n\n'),
        );
      };
      const judgmentRuns: {
        clientId: number;
        from: string;
        to: string;
        rows: number;
        sha256: string;
      }[] = [];
      let judgmentSample: { clientId: number; rows: number; data: ReportData } | null = null;
      async function compareJudgments(clientId: number, from: string, to: string) {
        const expected = hearings
          .filter((h) => {
            const day = h.hearingDate?.toISOString().slice(0, 10);
            return (
              h.matterId !== null &&
              matterMap.get(h.matterId)?.clientId === clientId &&
              h.outcome !== null &&
              h.outcome !== '' &&
              day &&
              day >= from &&
              day <= to
            );
          })
          .sort((a, b) => a.hearingDate!.getTime() - b.hearingDate!.getTime() || a.id - b.id);
        const rows: ReportRow[] = expected.map((h) => {
          const m = matterMap.get(h.matterId!)!;
          const court = h.courtId === null ? null : (courtMap.get(h.courtId) ?? null);
          let courtValue = court;
          if (h.circuit !== null && h.circuit !== '' && h.circuit !== court) {
            const circuit = /^\(.*\)$/su.test(h.circuit) ? h.circuit : '(' + h.circuit + ')';
            courtValue = (court ?? t.reports.nullValue) + '\n' + circuit;
          }
          return {
            id: `hearing:${h.id}`,
            cells: [
              m.caseNumberAr === null
                ? { type: 'null' }
                : { type: 'identifier', value: m.caseNumberAr },
              text(courtValue),
              side(m.id, 'client'),
              side(m.id, 'opponent'),
              text(m.subject),
              text(
                h.hearingDate!.toISOString().slice(0, 10).split('-').join('/') +
                  '\n' +
                  (h.decision ?? t.reports.nullValue),
              ),
            ],
          };
        });
        const groups: ReportGroup[] = [{ id: 'judgments', title: '', rows }];
        const expectedData: ReportData = {
          subtitle: clientMap.get(clientId)!.nameAr,
          totals: [],
          sections: [{ id: 'judgments', title: '', groups }],
        };
        const params = parseReportInput(
          clientJudgments.descriptor,
          new URLSearchParams({ format: 'preview', client: String(clientId), from, to }),
        ).parameters;
        const actual = await clientJudgments.query(tx, params);
        assert.deepEqual(actual, {
          subtitle: clientMap.get(clientId)!.nameAr,
          totals: [],
          sections: [{ id: 'judgments', title: '', groups }],
        });
        assert.equal(validateReportData(clientJudgments.descriptor, actual), expected.length);
        if (
          from === '0001-01-01' &&
          to === '9998-12-31' &&
          rows.length &&
          (!judgmentSample ||
            rows.length < judgmentSample.rows ||
            (rows.length === judgmentSample.rows && clientId < judgmentSample.clientId))
        )
          judgmentSample = { clientId, rows: rows.length, data: expectedData };
        judgmentRuns.push({
          clientId,
          from,
          to,
          rows: rows.length,
          sha256: createHash('sha256').update(JSON.stringify(actual)).digest('hex'),
        });
      }
      for (const c of clients) await compareJudgments(c.id, '0001-01-01', '9998-12-31');
      const dated = hearings.filter(
        (h) => h.hearingDate && h.outcome && h.matterId && matterMap.get(h.matterId)?.clientId,
      );
      assert.ok(dated.length > 0);
      const examples = [
        dated[0]!,
        dated.at(-1)!,
        ...dated.filter((h) => h.hearingDate!.toISOString().slice(5, 10) === '02-29').slice(0, 2),
      ];
      for (const h of examples) {
        const day = h.hearingDate!.toISOString().slice(0, 10);
        await compareJudgments(matterMap.get(h.matterId!)!.clientId!, day, day);
      }
      await compareJudgments(clients[0]!.id, '9998-12-31', '9998-12-31');
      assert.ok(judgmentRuns.some((r) => r.rows === 0));
      assert.ok(judgmentRuns.some((r) => r.rows > 1));
      return {
        status: 'PASS',
        scope: 'Full pristine restored data; read-only adapters, not browser/auth/export proof',
        volumes: {
          clients: clients.length,
          contacts: contacts.length,
          matters: matters.length,
          hearings: hearings.length,
        },
        contacts: {
          rows: expectedContacts.length,
          groups: contactGroups.length,
          sha256: createHash('sha256').update(JSON.stringify(actualContacts)).digest('hex'),
        },
        judgmentRuns,
        exportOracles: {
          contacts: {
            columns: activeClientContacts.descriptor.columns,
            data: {
              subtitle: '',
              sections: [{ id: 'contacts', title: t.clients.contacts, groups: contactGroups }],
              totals: [],
            },
          },
          judgments: { columns: clientJudgments.descriptor.columns, sample: judgmentSample },
        },
      };
    },
    { isolationLevel: 'RepeatableRead', timeout: 120000 },
  );
  const output = process.env['TASK51_OUTPUT'];
  if (output)
    writeFileSync(join(output, 'source-oracle.json'), JSON.stringify(proof, null, 2), {
      flag: 'wx',
    });
  console.log(
    `PASS complete contact data and ${proof.judgmentRuns.length} judgment runs over ${proof.volumes.hearings} hearings`,
  );
}
main()
  .catch(() => {
    console.error(
      'Client source oracle failed; assertion details withheld from business-data logs',
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
