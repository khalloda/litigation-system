"""Offline corruption probes for extra-row field completeness, not row eligibility."""

import copy
import importlib.util
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location('addendum', Path(__file__).with_name('reconcile-task69-addendum.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
original_root, addendum_root = (Path(p).resolve() for p in sys.argv[1:3])
read = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
original = read(original_root / 'complete-row-field-comparison.json')
evidence = read(addendum_root / 'financial-field-addendum.json')
module.validate(evidence, original)
probes = []


def reject(name, mutate):
    damaged = copy.deepcopy(evidence)
    mutate(damaged)
    try:
        module.validate(damaged, original)
    except (AssertionError, KeyError, TypeError):
        probes.append({'case': name, 'status': 'REJECTED'})
        return
    raise AssertionError('Accepted corruption: ' + name)


reject('extra row omitted', lambda e: e['extraRows'].pop())
reject('cell omitted despite row eligibility explanation', lambda e: e['extraRows'][0]['cells'].pop())
reject('duplicate extra row masquerades as complete', lambda e: e['extraRows'].__setitem__(1, copy.deepcopy(e['extraRows'][0])))
reject('typed null coerced to empty text', lambda e: e['extraRows'][0]['cells'][3].update(currentCell={'type': 'text', 'value': ''}))
reject('missing party called approved row-inclusion difference', lambda e: e['extraRows'][0]['cells'][3].update(disposition='approved-eligibility'))
reject('raw null provision coerced to zero', lambda e: e['extraRows'][0]['cells'][6]['rawComponents'].update({'المخصص المالي': 0}))
reject('invented source PDF occurrence', lambda e: e['extraRows'][0].update(sourcePdfOccurrence=3))
reject('wrong Access copy binding', lambda e: e['extraRows'][0].update(sourceAccessSha256=e['sourceIdentities']['newer']))
reject('wrong source-parent identity', lambda e: e['extraRows'][0]['sourceKeys'].update(matter=426))
reject('quarantine witness omitted', lambda e: e.update(partyWitnesses=[w for w in e['partyWitnesses'] if w['quarantine']['id'] != 1865]))
reject('unrelated quarantine ID substituted', lambda e: next(w for w in e['partyWitnesses'] if w['quarantine']['id'] == 1865)['quarantine'].update(id=1866))
reject('canonical absence contradicted', lambda e: next(w for w in e['partyWitnesses'] if w['quarantine']['id'] == 1865).update(canonicalSideRowsIncludingRetired=[{'id': 1}]))
reject('wrong extraction lineage', lambda e: next(w for w in e['partyWitnesses'] if w['quarantine']['id'] == 1865)['quarantine'].update(extraction_sha256='0' * 64))
reject('explained variance promoted to equality', lambda e: e.update(status='PASS_LITERAL_EQUALITY'))
report = Path(sys.argv[3]) if len(sys.argv) > 3 else addendum_root / 'addendum-corruption-probes.json'
with report.open('xb') as handle:
    handle.write(module.encoded({'status': 'PASS', 'validCells': 35, 'negativeTests': probes}))
print(f'PASS: 35 complete cells; {len(probes)} meaningful corruptions rejected')
