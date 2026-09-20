import assert from 'node:assert/strict';
// Explicit product surfaces; no discovery from whichever buttons happen to exist.
export const requiredEntryTables = [
  'clients',
  'client_logos',
  'contacts',
  'matters',
  'matter_lawyers',
  'matter_parties',
  'matter_party_roles',
  'hearings',
  'hearing_attendees',
  'admin_tasks',
  'task_actions',
  'powers_of_attorney',
  'power_of_attorney_lawyers',
  'documents',
  'fee_letters',
  'fee_letter_matters',
  'matter_fee_letter_references',
  'invoices',
  'invoice_allocations',
  'payments',
  'people',
  'person_name_alias',
  'user_accounts',
];
export const globalOnlyFamilies = ['attendance', 'lookup_*'];
export async function browserSurfaceOracle(db) {
  const routes = [];
  const populations = [];
  async function add(table, route, sql, surface = table, optional = false) {
    const rows = (await db.query(sql)).rows;
    populations.push({ surface, sql, selected: rows });
    if (optional && !rows.length) return;
    assert.equal(rows.length, 1, 'Required populated surface ' + surface);
    const row = rows[0];
    routes.push({ table, id: String(row.id), route: route(row), surface });
  }
  for (const [table, route, where] of [
    ['clients', 'clients', 'true'],
    ['matters', 'matters', 'true'],
    ['hearings', 'hearings', 'true'],
    ['admin_tasks', 'admin-works', 'true'],
    ['powers_of_attorney', 'powers-of-attorney', 'true'],
    ['documents', 'documents', 'true'],
    ['fee_letters', 'fee-letters', 'true'],
    ['invoices', 'billing/invoices', 'true'],
    ['payments', 'billing/payments', 'true'],
    ['people', 'staff', 'is_staff'],
  ])
    await add(
      table,
      (r) => `/${route}/${r.id}`,
      `SELECT id FROM ${table} WHERE ${where} ORDER BY id LIMIT 1`,
    );
  await add('user_accounts', () => '/users', 'SELECT id FROM user_accounts ORDER BY id LIMIT 1');
  for (const [table, parent, route, condition] of [
    ['client_logos', 'client_id', 'clients', 'true'],
    ['contacts', 'client_id', 'clients', 'true'],
    ['matter_lawyers', 'matter_id', 'matters', 'NOT is_retired'],
    ['matter_parties', 'matter_id', 'matters', 'NOT is_retired'],
    ['hearing_attendees', 'hearing_id', 'hearings', 'NOT is_retired'],
    ['task_actions', 'task_id', 'admin-works', 'NOT is_archived'],
    ['power_of_attorney_lawyers', 'power_of_attorney_id', 'powers-of-attorney', 'NOT is_retired'],
    ['fee_letter_matters', 'fee_letter_id', 'fee-letters', 'NOT is_retired'],
    ['matter_fee_letter_references', 'fee_letter_id', 'fee-letters', 'NOT is_retired'],
    ['invoice_allocations', 'invoice_id', 'billing/invoices', 'true'],
    [
      'person_name_alias',
      'person_id',
      'staff',
      'NOT is_retired AND person_id IN(SELECT id FROM people WHERE is_staff)',
    ],
  ]) {
    await add(
      table,
      (r) => `/${route}/${r.parent}`,
      `SELECT id,${parent} parent FROM ${table} WHERE ${parent} IS NOT NULL AND ${condition} ORDER BY id LIMIT 1`,
      table + '-current-parent',
    );
  }
  await add(
    'contacts',
    (r) => `/clients/${r.parent}/contacts/${r.id}`,
    'SELECT id,client_id parent FROM contacts WHERE client_id IS NOT NULL ORDER BY id LIMIT 1',
    'contacts-own-detail',
  );
  await add(
    'matter_party_roles',
    (r) => `/matters/${r.parent}`,
    'SELECT r.id,p.matter_id parent FROM matter_party_roles r JOIN matter_parties p ON p.id=r.party_id WHERE NOT r.is_retired AND NOT p.is_retired ORDER BY r.id LIMIT 1',
  );
  for (const [table, parent, route, column] of [
    ['hearing_attendees', 'hearing_id', 'hearings', 'is_retired'],
    ['task_actions', 'task_id', 'admin-works', 'is_archived'],
    ['power_of_attorney_lawyers', 'power_of_attorney_id', 'powers-of-attorney', 'is_retired'],
    ['fee_letter_matters', 'fee_letter_id', 'fee-letters', 'is_retired'],
    ['matter_fee_letter_references', 'fee_letter_id', 'fee-letters', 'is_retired'],
    ['person_name_alias', 'person_id', 'staff', 'is_retired'],
  ])
    await add(
      table,
      (r) => `/${route}/${r.parent}${table === 'task_actions' ? '?stepArchive=archived' : ''}`,
      `SELECT id,${parent} parent FROM ${table} WHERE ${column} AND ${parent} IS NOT NULL ${table === 'person_name_alias' ? 'AND person_id IN(SELECT id FROM people WHERE is_staff)' : ''} ORDER BY id LIMIT 1`,
      table + '-retired-parent',
      true,
    );
  assert.deepEqual(
    [...new Set(routes.map((r) => r.table))].sort(),
    [...requiredEntryTables].sort(),
  );
  // Independent joins/raw event snapshots, never the product's scope function.
  const raw = (
    await db.query(
      'SELECT id::text,entity_table,entity_key,before_values,after_values FROM audit_events ORDER BY id',
    )
  ).rows;
  const associations = new Map();
  for (const [child, field, parent] of [
    ['contacts', 'client_id', 'clients'],
    ['client_logos', 'client_id', 'clients'],
    ['matter_lawyers', 'matter_id', 'matters'],
    ['matter_parties', 'matter_id', 'matters'],
    ['matter_party_roles', 'party_id', 'matter_parties'],
    ['hearing_attendees', 'hearing_id', 'hearings'],
    ['task_actions', 'task_id', 'admin_tasks'],
    ['power_of_attorney_lawyers', 'power_of_attorney_id', 'powers_of_attorney'],
    ['fee_letter_matters', 'fee_letter_id', 'fee_letters'],
    ['fee_letter_matters', 'matter_id', 'matters'],
    ['matter_fee_letter_references', 'matter_id', 'matters'],
    ['matter_fee_letter_references', 'fee_letter_id', 'fee_letters'],
    ['invoice_allocations', 'invoice_id', 'invoices'],
    ['payments', 'invoice_id', 'invoices'],
    ['person_name_alias', 'person_id', 'people'],
    ['user_accounts', 'person_id', 'people'],
  ]) {
    const map = new Map(
      (await db.query(`SELECT id::text,${field}::text parent FROM ${child}`)).rows.map((r) => [
        r.id,
        r.parent,
      ]),
    );
    for (const e of raw.filter((e) => e.entity_table === child))
      for (const v of [e.before_values, e.after_values])
        if (v?.[field] != null) {
          const parentId = String(v[field]);
          if (map.has(String(e.entity_key.id)))
            assert.equal(map.get(String(e.entity_key.id)), parentId);
          else map.set(String(e.entity_key.id), parentId);
        }
    associations.set(child + ':' + parent, map);
  }
  const parties = associations.get('matter_parties:matters');
  associations.set(
    'matter_party_roles:matters',
    new Map(
      [...associations.get('matter_party_roles:matter_parties')].map(([id, party]) => [
        id,
        parties.get(party),
      ]),
    ),
  );
  for (const r of routes)
    r.expected = raw
      .filter(
        (e) =>
          (e.entity_table === r.table && String(e.entity_key?.id) === r.id) ||
          associations.get(e.entity_table + ':' + r.table)?.get(String(e.entity_key?.id)) === r.id,
      )
      .map((e) => e.id)
      .sort();
  return { routes, populations, requiredEntryTables, globalOnlyFamilies };
}
