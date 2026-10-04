"""Focused offline checks and corruption probes for the comprehensive inventory."""

import copy
import importlib.util
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('inventory', Path(__file__).with_name('inventory-task69-quarantines.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def main():
    snapshot_path, inventory_path, output_path = map(Path, sys.argv[1:])
    snapshot, inventory = module.read(snapshot_path), module.read(inventory_path)
    module.validate(inventory, snapshot)
    cases = []

    def rejected(name, mutate):
        changed = copy.deepcopy(inventory)
        mutate(changed)
        try:
            module.validate(changed, snapshot)
        except (AssertionError, KeyError, ValueError) as error:
            cases.append({'case': name, 'status': 'REJECTED', 'reason': str(error)[:250]})
            return
        raise AssertionError('Corruption accepted: ' + name)

    rejected('duplicate source issue', lambda d: d['issues'].append(copy.deepcopy(d['issues'][0])))
    rejected('missing quarantine issue', lambda d: d['issues'].pop())
    rejected('mutated original evidence', lambda d: d['issues'][0]['original'].update(reason_codes=['invented']))
    rejected('re-release already released matter', lambda d: d['issues'][0].update(status='approved_mapping'))
    rejected('missing secondary finding', lambda d: d['registers'].pop(0))
    rejected('invented parent dependency', lambda d: next(x for x in d['issues'] if x['dependencies'])['dependencies'].append('nonexistent-parent'))
    rejected('hidden sibling omitted', lambda d: next(x for x in d['issues'] if x.get('allSiblingSourceSteps'))['allSiblingSourceSteps'].pop())
    rejected('parent dependency removed', lambda d: next(x for x in d['issues'] if x['dependencies'])['dependencies'].clear())
    rejected('P3 outdated combined client block', lambda d: next(x for x in d['knownDecisionOverlay']['fields'] if x['matter'] == 3317 and x['side'] == 'client')['blocks'][0].update(name='الشرقية إيسترن كومباني\nجهاز حماية المنافسة'))
    rejected('P3 missing intervention role', lambda d: next(x for x in d['knownDecisionOverlay']['fields'] if x['matter'] == 3317 and x['side'] == 'opponent')['blocks'][1]['roleIds'].pop())
    rejected('S2 falsely approved', lambda d: d['knownDecisionOverlay'].update(S1S2='APPROVED'))
    rejected('fragment conservation false', lambda d: d['fragmentConservation'].update(spans=16601))
    rejected('source comparison omission', lambda d: d['sourceCopies']['issueComparisons'].pop())
    rejected('false source identity cardinality', lambda d: d['sourceCopies']['issueComparisons'][0].update(matchCount=2))
    rejected('N1 falsely fixed', lambda d: d['historicalSemantics'].update(N1='FIXED'))
    rejected('false PDF search certification', lambda d: d['historicalSemantics'].update(PDFSearch='CERTIFIED'))
    rejected('partition counts do not match records', lambda d: d['partitionsByStoreAndUnit'][0]['partitions'].update(approved_mapping=100))
    rejected('false acceptance status', lambda d: d.update(status='TASK69_ACCEPTED'))

    issues = inventory['issues']
    assert sum(i['store'] == 'quarantine.admin_task_transform' for i in issues) == 544
    assert sum(i['store'] == 'quarantine.task_action_transform' for i in issues) == 769
    assert sum(i['store'] == 'deferred.D54' for i in issues) == 123
    pages = [i for i in issues if i['store'] == 'quarantine.document_evidence' and i['original']['field_kind'] == 'page_count']
    assert len(pages) == 14 and all(i['status'] == 'deliberately_excluded' and i['proposed']['page_count'] is None for i in pages)
    assert inventory['approvedEffectCounts']['exactTwentyFieldOverlay']['newParties'] == 22
    assert inventory['approvedEffectCounts']['exactTwentyFieldOverlay']['newPartyRoles'] == 27
    assert inventory['approvedEffectCounts']['approvedForwardFeeLinks'] == 26
    assert all(len(s['matches']) == 0 for r in inventory['orphanParentSearches'] for s in r['searches'])
    assert len(inventory['orphanParentSearches']) == 36
    # Existing parser spelling boundary remains exact: no J -> ق equivalence.
    assert module.reviewed_key('140J') != module.reviewed_key('140ق')
    assert module.reviewed_key('  شرق\r\n القاهرة\t') == 'شرق\nالقاهرة'
    assert inventory['firstNewQuestion']['rawValue'] == 'خبراء شرق القاهرة'
    assert len(inventory['firstNewQuestion']['sourceTaskIds']) == 45
    output = {'status': 'PASS', 'method': 'Offline complete row coverage, release/fragment/source/dependency/decision checks; no database or browser mutation',
              'corruptionCases': cases, 'issuesByUnit': dict(module.collections.Counter(i['unit'] for i in issues)),
              'approvedEffectCounts': inventory['approvedEffectCounts']}
    with output_path.open('xb') as stream:
        stream.write(module.encoded(output))
    print(json.dumps({'status': 'PASS', 'corruptionCases': len(cases)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
