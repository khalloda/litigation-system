import type { ClientBase } from 'pg';

type Person = {
  id: number;
  nameAr: string;
  isStaff: boolean;
  isActive: boolean;
  isApplicationNative: boolean;
  teamId: number | null;
};
export type RosterBaseline = {
  people: Person[];
  aliases: { id: number; personId: number; aliasAr: string; person: { nameAr: string } }[];
  teams: { labelAr: string; reviewer: { nameAr: string } | null; members: { nameAr: string }[] }[];
};

/** The caller first proves the complete checkpoint/snapshot. These are only
 * immutable historical assertions, never current operational projections. */
export async function readRosterBaseline(
  db: ClientBase,
  staffBoundary: boolean,
): Promise<RosterBaseline> {
  const personTable = staffBoundary ? '_migration.staff_roster_person' : 'public.people';
  const aliasTable = staffBoundary ? '_migration.staff_roster_alias' : 'public.person_name_alias';
  const teamTable = staffBoundary ? '_migration.staff_roster_team' : 'public.lookup_team';
  const people = (
    await db.query<Person>(
      `SELECT id,name_ar "nameAr",is_staff "isStaff",is_active "isActive",is_application_native "isApplicationNative",team_id "teamId" FROM ${personTable} ORDER BY id`,
    )
  ).rows;
  const aliases = (
    await db.query<{ id: number; personId: number; aliasAr: string; nameAr: string }>(
      `SELECT a.id,a.person_id "personId",a.alias_ar "aliasAr",p.name_ar "nameAr" FROM ${aliasTable} a JOIN ${personTable} p ON p.id=a.person_id ORDER BY a.id`,
    )
  ).rows.map(({ nameAr, ...row }) => ({ ...row, person: { nameAr } }));
  const teams = (
    await db.query<{ id: number; labelAr: string; reviewerId: number | null }>(
      `SELECT id,label_ar "labelAr",reviewer_id "reviewerId" FROM ${teamTable} ORDER BY id`,
    )
  ).rows.map((row) => ({
    labelAr: row.labelAr,
    reviewer: people.find((p) => p.id === row.reviewerId) ?? null,
    members: people.filter((p) => p.teamId === row.id),
  }));
  return { people, aliases, teams };
}
