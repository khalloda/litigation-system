import { Prisma } from '@/generated/prisma/client';
import { t } from '@/strings';
import { reportText } from './client-report-data';
import type { ReportDefinition, ReportGroup, ReportRow } from './types';

type ContactRow = {
  id: number;
  clientId: number;
  clientName: string;
  clientEnglishName: string | null;
  name: string | null;
  email: string | null;
  job: string | null;
  businessPhone: string | null;
  mobile: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
};

/** Saved Access `Contact list` business predicates, with stable current IDs. */
export const activeClientContacts: ReportDefinition = {
  descriptor: {
    id: 'client-active-contacts',
    version: '1',
    title: t.clientReports.contactsTitle,
    description: t.clientReports.contactsDescription,
    parameters: {},
    layout: 'grouped',
    clientFacing: false,
    permissions: [{ area: 'clients', action: 'view' }],
    columns: [
      { key: 'name', label: t.clients.contactName, width: 25 },
      { key: 'email', label: t.clients.email, width: 30 },
      { key: 'job', label: t.clients.jobTitle, width: 25 },
      { key: 'businessPhone', label: t.clients.businessPhone, width: 20 },
      { key: 'mobile', label: t.clients.mobile, width: 20 },
      { key: 'address', label: t.clients.address, width: 35 },
      { key: 'city', label: t.clients.city, width: 20 },
      { key: 'country', label: t.clients.countryRegion, width: 20 },
    ],
  },
  query: readActiveClientContacts,
};

async function readActiveClientContacts(tx: Prisma.TransactionClient) {
  const rows = await tx.$queryRaw<ContactRow[]>(Prisma.sql`
      SELECT k.id,c.id AS "clientId",c.name_ar AS "clientName",c.name_en AS "clientEnglishName",
        k.contact_name AS name,k.email,k.job_title AS job,k.business_phone AS "businessPhone",
        k.mobile_phone AS mobile,k.address,k.city,k.country_region AS country
      FROM public.contacts k JOIN public.clients c ON c.id=k.client_id
      WHERE lower(c.status)='active' AND lower(c.cash_or_probono)='cash'
      ORDER BY c.name_en COLLATE "C" NULLS LAST,c.id,k.id`);
  const groups: (Omit<ReportGroup, 'rows'> & { rows: ReportRow[] })[] = [];
  for (const row of rows) {
    const id = `client:${row.clientId}`;
    let group = groups.at(-1);
    if (group?.id !== id) {
      group = {
        id,
        title:
          row.clientName +
          (row.clientEnglishName === null || row.clientEnglishName === ''
            ? ''
            : `\n${row.clientEnglishName}`),
        rows: [],
      };
      groups.push(group);
    }
    group.rows.push({
      id: `contact:${row.id}`,
      cells: [
        row.name,
        row.email,
        row.job,
        row.businessPhone,
        row.mobile,
        row.address,
        row.city,
        row.country,
      ].map(reportText),
    });
  }
  return {
    subtitle: '',
    sections: [{ id: 'contacts', title: t.clients.contacts, groups }],
    totals: [],
  };
}
