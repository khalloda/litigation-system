import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { parseMatterMutationInput } from '../src/lib/matter-mutation-input';
const request = {
  id: 1,
  version: '1',
  submission: randomUUID(),
  values: {},
  parties: [
    {
      id: 1,
      side: 'client',
      party_name: null,
      gender: null,
      ordinal: 1,
      roles: [
        { id: 1, role_id: 6, ordinal: 1 },
        { id: 2, role_id: 6, ordinal: 2 },
      ],
    },
  ],
};
const historical = parseMatterMutationInput('update', request);
assert.equal(historical.parties!.length, 1);
assert.equal(historical.parties![0]!.roles.length, 2);
assert.equal(Object.hasOwn(historical.parties![0]!.roles[0]!, 'display_label'), false);
assert.equal(Object.hasOwn(historical.parties![0]!, 'semantic_party_name'), false);
const newRows = structuredClone(request);
newRows.parties[0]!.roles = [
  { id: null as unknown as number, role_id: 6, ordinal: 1 },
  { id: null as unknown as number, role_id: 6, ordinal: 2 },
];
assert.throws(() => parseMatterMutationInput('update', newRows));
const qualified = {
  ...request,
  parties: [
    {
      ...request.parties[0]!,
      roles: [
        { id: null, role_id: 6, ordinal: 1, display_label: 'Task69 fixture A', qualifier: '' },
        {
          id: null,
          role_id: 6,
          ordinal: 2,
          display_label: 'Task69 fixture B',
          qualifier: 'Task69 fixture qualifier',
        },
      ],
    },
  ],
};
assert.equal(parseMatterMutationInput('update', qualified).parties![0]!.roles.length, 2);
const duplicateIds = structuredClone(request);
duplicateIds.parties[0]!.roles[1]!.id = 1;
assert.throws(() => parseMatterMutationInput('update', duplicateIds));
assert.throws(() =>
  parseMatterMutationInput('update', {
    ...request,
    parties: [{ ...request.parties[0], semantic_party_name: 42 }],
  }),
);
console.log(
  'PASS party input: existing qualified IDs retain omitted fields; duplicate new capacities/IDs and non-text context refuse',
);
