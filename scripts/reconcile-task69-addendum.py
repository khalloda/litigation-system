"""Offline, read-only addendum to the frozen Task 6.9 reconciliation.

Reads retained evidence; writes only to a NEW evidence directory. Never connects
to PostgreSQL or Access. Proposed operations are data for review, not commands.
"""

import collections
import hashlib
import json
import re
import sys
from pathlib import Path


FIELDS = ['caseNumber', 'court', 'clientParty', 'opponentParty', 'subject', 'latest', 'provision']
EXTRA_GAPS = {(425, 'opponentParty'): 1865, (1079, 'clientParty'): 1884, (1156, 'opponentParty'): 1881}
TASK_IDS = {11270, 11271, 11323, 11398, 11439}
STEP_IDS = {4354, 4357, 4358, 4366, 4367, 4395, 4396, 4397, 4398}


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8')


def digest(value):
    return hashlib.sha256(encoded(value)).hexdigest()


def one(rows, description):
    assert len(rows) == 1, (description, len(rows))
    return rows[0]


def normal_lines(value):
    """Approved display spacing only; never changes retained raw evidence."""
    if value is None:
        return None
    return '\n'.join(line.strip() for line in value.replace('\r\n', '\n').replace('\r', '\n').split('\n') if line.strip())


def build(root):
    read = lambda name: json.loads((root / name).read_text(encoding='utf-8-sig'))
    tables = read('private/fixture-relations.json')['tables']
    idx = {table: {r['id']: r for r in rows} for table, rows in tables.items()}
    assert all(len(idx[k]) == len(v) for k, v in tables.items())
    lineage = read('private/lineage-relations.json')['tables']
    party_q = read('private/party-lineage.json')['tables']['quarantine.matter_relationship_transform']
    comparison = read('complete-row-field-comparison.json')
    assert len(comparison['rows']) == 117
    sources = {s: read('private/source-' + s + '-rows.json') for s in ['older', 'newer']}
    mappings = read('source-current-mappings.json')
    scopes = {s['target']: s for s in read('source-scoped-rows.json')}
    crosswalk = json.loads((Path(__file__).parents[1] / 'scripts/baselines/reviewed-links.json').read_text(encoding='utf-8'))['crosswalk']

    def legacy(table, identity):
        return one([r for r in tables[table] if r['legacy_id'] == identity], (table, identity))

    def narrow(row):
        return {k: row[k] for k in ['id', 'legacy_id', 'matter_id', 'task_id', 'client_id', 'row_version', 'is_archived', 'status', 'legacy_source_record_key', 'legacy_source_extraction_sha256'] if k in row}

    # Distinct report-field identities, keeping all repeated output occurrences.
    impacts = collections.defaultdict(list)
    for row in comparison['rows']:
        for field in row['fields']:
            if field['classification'] == 'proved-data-projection-difference':
                key = (row['sourceKeys']['source_matter_id'], field['field'])
                assert field['currentCell'] == {'type': 'null'}
                impacts[key].append({'scope': row['scope'], 'occurrence': row['queryOccurrence'], 'sourceLocation': row['sourceLocation'], 'currentLocations': row['currentLocations']})
    assert len(impacts) == 17 and sum(map(len, impacts.values())) == 21
    assert len({k[0] for k in impacts}) == 14 and not (set(impacts) & set(EXTRA_GAPS))
    for row in comparison['currentExtraRows']:
        for field in ['clientParty', 'opponentParty']:
            key = (row['sourceKeys']['matter'], field)
            if key in EXTRA_GAPS:
                impacts[key].append({'scope': row['scope'], 'sourceOccurrence': None, 'currentLocations': row['currentLocations'], 'cohort': 'extra-current-financial'})

    party_witnesses = []
    proposal_roles = {
        (30, 'clientParty'): [(11, 'f'), (4, 'f')], (30, 'opponentParty'): [(9, 'm'), (3, 'm')],
        (61, 'clientParty'): [(9, 'm'), (3, 'm')], (81, 'opponentParty'): [(2, 'm')],
        (425, 'opponentParty'): [(2, 'm')], (527, 'opponentParty'): [(2, 'm')],
        (1079, 'clientParty'): [(2, 'm')], (1083, 'opponentParty'): [(4, 'm')],
        (1156, 'opponentParty'): [(8, 'm')], (1677, 'opponentParty'): [(2, 'm')],
        (1695, 'clientParty'): [('NEW:ملتمس ضده', 'm')], (1695, 'opponentParty'): [('NEW:ملتمس', 'm')],
        (1702, 'clientParty'): [(2, 'm')], (1710, 'opponentParty'): [(2, 'm')],
        (1724, 'clientParty'): [('NEW:خصم متدخل إنضمامي', 'm')],
        (1762, 'clientParty'): [(2, 'm')], (1767, 'clientParty'): [(2, 'm')], (1768, 'clientParty'): [(2, 'm')],
        (1769, 'opponentParty'): [(4, 'm'), (3, 'm')],
    }
    for key, locations in sorted(impacts.items()):
        source_id, field = key
        side = 'client' if field == 'clientParty' else 'opponent'
        matter = legacy('matters', source_id)
        q = one([q for q in party_q if str(q['legacy_matter_id']) == str(source_id) and q['side'] == side and q['relationship_kind'] == 'party'], key)
        assert q['src_record_key'] == matter['legacy_source_record_key'] and q['extraction_sha256'] == matter['legacy_source_extraction_sha256']
        assert q['outcome'] == 'quarantined' and q['resolved_at'] is None
        assert q['source_field'] == side + '&Cap'
        assert q['source_payload'][q['source_field']] == q['raw_value'] == matter['legacy_source_payload'][q['source_field']]
        canonical = [r for r in tables['matter_parties'] if r['matter_id'] == matter['id'] and r['side'] == side]
        assert canonical == [], (key, 'unexpected canonical side')
        related_receipts = [r for r in lineage['_migration.task62_source_receipt'] if r['matter_id'] == matter['id']]
        source_values = []
        for name, source in sources.items():
            found = [r for r in source['tables']['الدعاوى'] if r['matterID'] == source_id]
            if found:
                s = one(found, (name, key))
                source_values.append({'source': name, 'accessSha256': source['sha256'], 'matterId': source_id, 'clientId': s['clientID'], 'rawValue': s[q['source_field']], 'sameTextAfterLineEndingOnly': s[q['source_field']].replace('\r\n', '\n') == q['raw_value'].replace('\r\n', '\n')})
        names = normal_lines(q['raw_value']).split('\n')
        decisions = ['P1']
        treatment = 'Preserve the complete unquoted name block; do not split people or entities on commas, conjunctions, or وآخرين. Canonical role rendering changes plural/composite legacy typography only after owner approval.'
        if key == (1724, 'opponentParty'):
            blocks = [{'name': names[0], 'gender': 'm', 'roleIds': [1]}, {'name': '\n'.join(names[2:4]), 'gender': 'm', 'roleIds': [2]}]
            decisions = ['P3']
            treatment = 'Owner must confirm two ordered blocks and attribution of the final dual capacity to the two-name second block.'
        else:
            roles = proposal_roles[key]
            name = '\n'.join(n for n in names if not n.startswith('"'))
            if source_id == 1769:
                name = 'فيري كابي'
                decisions = ['P4']
                treatment = 'HOLD. Malformed quote and trailing مستأنف: owner must confirm whether both capacities belong to this party. Candidate dual roles are conditional, not an inferred repair.'
            elif key == (1724, 'clientParty'):
                decisions = ['P2', 'P3']
                treatment = 'HOLD attribution pending owner confirmation: capacity may apply to the whole two-name block or only its last entity. Conditional proposal preserves one multiline name block; do not silently allocate the role.'
            elif source_id == 1695:
                decisions = ['P2']
                treatment = 'Exact source capacity requires a new approved editable role; no mapping to appeal/cassation roles. Owner must confirm labels and gender forms; no legal terminology invented.'
            blocks = [{'name': name, 'gender': roles[0][1], 'roleIds': [r[0] for r in roles]}]
        if key in EXTRA_GAPS:
            assert q['id'] == EXTRA_GAPS[key]
        proposed_render = []
        for block in blocks:
            labels = [idx['lookup_party_role'][role]['label_ar_' + block['gender']] if isinstance(role, int) else role.removeprefix('NEW:') for role in block['roleIds']]
            proposed_render.append('\n'.join([block['name']] + ['"' + label + '"' for label in labels]))
        party_witnesses.append({
            'operationId': f'party:{source_id}:{side}', 'sourceMatter': source_id, 'field': field, 'side': side,
            'currentMatter': narrow(matter), 'sourceCopies': source_values,
            'quarantine': q, 'quarantineJsonSha256': digest(q), 'canonicalSideRowsIncludingRetired': canonical,
            'existingTask62ReceiptsForMatter': related_receipts,
            'receiptConclusion': 'All receipts for this matter enumerated; no canonical party on the affected side. Receipt presence on other sides is not repair of this field.',
            'rawSourceValue': q['raw_value'], 'rawRoles': [n.strip('"') for n in names if '"' in n or source_id == 1769 and n != 'فيري كابي'],
            'cohort': 'extra-current-financial' if key in EXTRA_GAPS else 'original-matched-source',
            'reportCellOccurrences': locations, 'before': {'rendered': None, 'canonicalSideCount': 0, 'matterVersion': matter['row_version']},
            'proposedAfter': {'blocks': blocks, 'conditionalRenderedText': '\n\n'.join(proposed_render), 'treatment': treatment, 'allHistoricalColumnsUnchanged': True},
            'ownerDecisions': decisions, 'status': 'PROPOSED_NOT_APPLIED',
            'confidence': 'High for identity, raw text, quarantine and absence. Capacity interpretation requires the listed owner decision.',
            'mechanism': 'Future bounded source-aware party repair journal and guarded canonical writes; existing Task62 runner is pinned to a different plan and is not reusable as-is.',
            'preconditions': ['Exact source/extraction/record-key and quarantine hashes', 'Affected side still empty, including retired rows', 'Exact matter version and source payload hash', 'Approved role/name-block mapping; new roles resolved to explicit returned IDs', 'Fresh guarded permission and archive check; never auto-unarchive'],
            'preservation': ['Raw payload and quarantine remain immutable', 'Other side, lawyers, client/closed/lawyer/admin choices and hearing 11003 unchanged'],
            'rollback': 'Atomic transaction rollback before commit. After commit, reviewed compensating retire operations only against journaled IDs and versions; keep audit/provenance. Never delete historical evidence.',
        })
    assert len(party_witnesses) == 20 and len({r['sourceMatter'] for r in party_witnesses}) == 17

    financial = []
    for extra in comparison['currentExtraRows']:
        raw_m, raw_h = (extra['sourceOutsidePrintedScope'][k] for k in ['matter', 'hearing'])
        assert raw_m == one([s for s in sources['older']['tables']['الدعاوى'] if s['matterID'] == raw_m['matterID']], 'financial source matter')
        assert raw_h == one([s for s in sources['older']['tables']['الجلسات'] if s['ID_hearings'] == raw_h['ID_hearings']], 'financial source hearing')
        m, h = (idx[t][extra['row']['keys'][k]] for t, k in [('matters', 'matter'), ('hearings', 'hearing')])
        assert h['matter_id'] == m['id'] and m['legacy_id'] == raw_m['matterID'] and h['legacy_id'] == raw_h['ID_hearings'] and raw_h['matterID'] == raw_m['matterID']
        date = raw_h['التاريخ'][:10].replace('-', '/')
        source_court = raw_h['المحكمة'] if raw_h['الدائرة'] is None else raw_h['المحكمة'] + '\n(' + raw_h['الدائرة'] + ')'
        source_values = [raw_m['matterAR'], source_court, raw_m['client&Cap'], raw_m['opponent&Cap'], raw_m['matterSubject'], 'في ' + date + '\n' + raw_h['القرار'], raw_m['المخصص المالي']]
        raw_columns = [['matterAR'], ['المحكمة', 'الدائرة'], ['client&Cap'], ['opponent&Cap'], ['matterSubject'], ['التاريخ', 'القرار'], ['المخصص المالي']]
        cells = []
        for i, field in enumerate(FIELDS):
            court_mapping = None
            current = extra['row']['cells'][i]
            source_value = source_values[i]
            witness = next((x for x in party_witnesses if x['sourceMatter'] == raw_m['matterID'] and x['field'] == field), None)
            if source_value is None:
                assert current == {'type': 'null'}
                disposition = 'exact-typed-null'
            elif witness:
                assert current == {'type': 'null'} and normal_lines(source_value) == normal_lines(witness['rawSourceValue'])
                disposition = 'proved-quarantined-party-missing'
            elif field == 'latest':
                assert normal_lines(current['value']) == normal_lines(source_value.removeprefix('في '))
                disposition = 'approved-date-prefix-and-line-spacing'
            elif source_value == current.get('value'):
                disposition = 'exact'
            elif field == 'court' and raw_h['المحكمة'] != idx['lookup_court'][h['court_id']]['label_ar']:
                court_mapping = one([c for c in crosswalk if c['sourceField'] == 'court' and c['sourceValue'] == raw_h['المحكمة'] and c['targetField'] == 'court' and c['targetValue'] == idx['lookup_court'][h['court_id']]['label_ar']], 'reviewed court mapping')
                assert h['legacy_court_raw'] == raw_h['المحكمة']
                assert normal_lines(current['value']) == normal_lines(source_value.replace(court_mapping['sourceValue'], court_mapping['targetValue'], 1))
                disposition = 'proved-reviewed-court-label-mapping'
            else:
                assert normal_lines(source_value) == normal_lines(current['value']), (raw_m['matterID'], field, source_value, current)
                disposition = 'approved-line-spacing'
            raw_container = raw_h if field in ['court', 'latest'] else raw_m
            cells.append({'field': field, 'rawComponents': {k: raw_container[k] for k in raw_columns[i]}, 'sourceDisplayExpression': source_value, 'currentCell': current, 'disposition': disposition, 'reviewedCourtMapping': court_mapping, 'witnessOperation': None if witness is None else witness['operationId']})
        financial.append({'sourceKeys': extra['sourceKeys'], 'currentKeys': extra['row']['keys'], 'rowId': extra['row']['id'], 'sourceAccessSha256': sources['older']['sha256'], 'sourceCopy': 'older', 'currentMatter': narrow(m), 'currentHearing': narrow(h), 'currentCourt': idx['lookup_court'][h['court_id']], 'currentCircuit': h['circuit'], 'locations': extra['currentLocations'], 'sourcePdfOccurrence': None, 'eligibility': extra['classification'], 'eligibilityExplanation': extra['decision'], 'cells': cells})

    # Administrative restoration: exactly five roots, nine dependent rows.
    repairs = []
    task_field_map = {'required_work': 'العمل المطلوب', 'status': 'الحالة', 'circuit': 'الدائرة', 'result': 'النتيجة', 'previous_decision': 'القرار السابق', 'task_created_date': 'تاريخ الإنشاء', 'execution_date': 'تاريخ التنفيذ', 'last_followup': 'آخر متابعة', 'deadline': 'آخر موعد', 'legacy_assignee_raw': 'القائم بالعمل', 'legacy_court_raw': 'المحكمة', 'legacy_destination_raw': 'الجهة', 'legacy_circuit_raw': 'الدائرة'}
    for table, qtable, ids, key in [('admin_tasks', 'quarantine.admin_task_transform', TASK_IDS, 'legacy_task_id'), ('task_actions', 'quarantine.task_action_transform', STEP_IDS, 'legacy_action_id')]:
        for identity in sorted(ids):
            q = one([q for q in lineage[qtable] if str(q[key]) == str(identity)], (qtable, identity))
            assert not [r for r in tables[table] if r['legacy_id'] == identity]
            payload = q['source_payload']
            if table == 'admin_tasks':
                assert q['reason_codes'] == ['unmapped_destination']
                assert payload['الحالة'] != 'منجزة'
                m = legacy('matters', int(payload['matterID']))
                court = one([r for r in tables['lookup_court'] if r['label_ar'] == payload['المحكمة']], ('court', identity))
                after = {dest: payload[src] for dest, src in task_field_map.items()}
                for field in ['task_created_date', 'execution_date', 'last_followup', 'deadline']:
                    if after[field] is not None:
                        after[field] = after[field][:10]
                assert payload['تنبيه'] == 'false' and payload['القائم بالعمل'] is None
                after.update({'id': f'FUTURE_TASK:{identity}', 'matter_id': m['id'], 'court_id': court['id'], 'destination_id': 'FUTURE_DESTINATION:' + payload['الجهة'], 'assigned_to_person_id': None, 'alert': payload['تنبيه'], 'is_archived': False})
                parent = narrow(m)
                dependencies = ['D1:' + payload['الجهة'], 'R1:bounded-source-release-mechanism']
            else:
                assert q['reason_codes'] == ['parent_task_quarantined'] and int(payload['ID_Task']) in TASK_IDS
                assert payload['القائم بالعمل'] is None
                siblings = sorted([s for s in lineage[qtable] if s['legacy_task_id_raw'] == payload['ID_Task']], key=lambda s: (int(s['legacy_action_id']), s['src_record_key']))
                ordinal = next(i for i, s in enumerate(siblings, 1) if s['src_record_key'] == q['src_record_key'])
                after = {'id': f'FUTURE_STEP:{identity}', 'task_id': 'FUTURE_TASK:' + payload['ID_Task'], 'action_date': payload['تاريخ الإجراء'][:10] if payload['تاريخ الإجراء'] else None, 'result': payload['النتيجة'], 'next_appointment': payload['الموعد القادم'], 'report': payload['تقرير'], 'performed_by_person_id': None, 'legacy_performed_by_raw': payload['القائم بالعمل'], 'legacy_task_id_raw': payload['ID_Task'], 'is_archived': False, 'source_ordinal': ordinal, 'current_order': None}
                parent = {'sourceTaskId': int(payload['ID_Task']), 'currentId': None}
                dependencies = ['task:' + payload['ID_Task']]
            after.update({'legacy_id': identity, 'legacy_source_payload': payload, 'legacy_source_record_key': q['src_record_key'], 'legacy_source_extraction_sha256': q['extraction_sha256']})
            source_table, source_id = ('admin work table', 'ID_Task') if table == 'admin_tasks' else ('إجراءات المهام', 'ID_process')
            source_rows = [{'source': name, 'accessSha256': s['sha256'], 'raw': one([r for r in s['tables'][source_table] if r[source_id] == identity], (name, identity))} for name, s in sources.items()]
            repairs.append({'operationId': ('task:' if table == 'admin_tasks' else 'step:') + str(identity), 'table': table, 'sourceId': identity, 'before': {'currentCount': 0, 'parent': parent}, 'quarantine': q, 'quarantineJsonSha256': digest(q), 'sourceCopies': source_rows, 'proposedAfter': after, 'dependencies': dependencies, 'status': 'PROPOSED_NOT_APPLIED', 'preconditions': ['Exact source/quarantine hash and unique legacy identity still absent', 'Exact existing parent, active approved lookups, original null/text/date types', 'Fresh archive/permission checks; no automatic unarchive'], 'mechanism': 'New reviewed bounded source-aware release, not global transform and not native admin_edit_save. Must journal original quarantine key and returned ID, protect lineage and integrate db:check before execution.', 'rollback': 'Transaction rollback before commit; after commit guarded compensating deselection/archive of only returned IDs after dependency/version checks; keep immutable source, quarantine, journal and audits.'})
    destinations = []
    for label in sorted({r['quarantine']['source_payload']['الجهة'] for r in repairs if r['table'] == 'admin_tasks'}):
        exact = [r for r in tables['lookup_matter_destination'] if r['label_ar'] == label]
        assert exact == []
        destinations.append({'label': label, 'exactDestinationMatches': exact, 'existingDestinationCandidates': [{k: r[k] for k in ['id', 'label_ar', 'is_active']} for r in tables['lookup_matter_destination'] if ('الجيزة' in label and 'الجيزة' in r['label_ar']) or ('مجلس الدولة' in label and 'مجلس الدولة' in r['label_ar'])], 'exactCourtMatches': [r for r in tables['lookup_court'] if r['label_ar'] == label], 'aliasConclusion': 'Admin transform resolves reviewed_text_key against destination labels; no destination alias mechanism. Court labels/crosswalk do not establish destination equivalence. person_name_alias is unrelated.', 'proposedAfter': {'id': 'FUTURE_DESTINATION:' + label, 'label_ar': label, 'label_en': None, 'is_active': True, 'sort_order': 'owner-approved placement, no semantic effect'}, 'decision': 'D1', 'status': 'PROPOSED_NOT_APPLIED', 'dependencies': ['Owner confirms distinct destination or explicitly supplies existing ID equivalence', 'Reviewed narrow lookup/provenance mechanism'], 'preservation': 'No change to any existing lookup, court or destination binding', 'rollback': 'Before commit rollback; after commit retain label and deactivate only if no active uses and journal/version checks pass.'})

    # Exact, deduplicated choices for the sampled current report contracts.
    choices = []
    for record in [m for m in mappings if m['target'] == 'lawyer-current-position']:
        m, h = (idx[t][record['mapped'][t]['id']] for t in ['matters', 'hearings'])
        assert h['matter_id'] == m['id'] and m['status'] == 'سارية' and h['decision'] not in (None, '')
        principals = [r for r in tables['matter_lawyers'] if r['matter_id'] == m['id'] and not r['is_retired'] and r['role'] in ['lead', 'co_lead']]
        assert 4 in {r['person_id'] for r in principals}
        choices.append({'operationId': 'lawyer-choice:' + str(m['id']), 'scope': 'lawyer', 'sourceKeys': record['sourceKeys'], 'matter': narrow(m), 'hearing': narrow(h), 'principals': principals, 'selectableNow': not (m['is_archived'] or h['is_archived']), 'before': {'selection': None, 'selectionVersion': '0'}, 'proposedAfter': {'matterId': m['id'], 'hearingId': h['id'], 'isSelected': True}, 'mechanism': 'public.lawyer_report_selection_save through saveLawyerReportSelection', 'dependencies': ['S1', 'fresh matter/hearing versions and genuine authorized actor'], 'reportPurpose': 'lawyer-current-position sample: lawyer4, January2026, Selected. Shared lawyer choices also affect the other lawyer report variants under their filters.'})
    admin_maps = [m for m in mappings if m['target'] in ['administrative-by-client', 'administrative-all-destinations']]
    assert {tuple(sorted(m['sourceKeys'].items())) for m in admin_maps if m['target'] == 'administrative-by-client'} <= {tuple(sorted(m['sourceKeys'].items())) for m in admin_maps if m['target'] == 'administrative-all-destinations'}
    for table, source_key, scope in [('hearings', 'source_hearing_id', 'administrative-hearing'), ('task_actions', 'source_step_id', 'administrative-step')]:
        by_id = collections.defaultdict(list)
        for m in admin_maps:
            by_id[m['sourceKeys'][source_key]].append(m)
        for source_id, occurrences in sorted(by_id.items()):
            mapped = occurrences[0]['mapped'][table]
            assert all(x['mapped'][table] == mapped for x in occurrences)
            row = None if mapped is None else idx[table][mapped['id']]
            matter = idx['matters'][occurrences[0]['mapped']['matters']['id']]
            parent = matter if table == 'hearings' else (idx['admin_tasks'][occurrences[0]['mapped']['admin_tasks']['id']] if occurrences[0]['mapped']['admin_tasks'] else None)
            if row:
                assert row['matter_id' if table == 'hearings' else 'task_id'] == parent['id']
            choices.append({'operationId': scope + ':' + str(source_id), 'scope': scope, 'sourceId': source_id, 'currentId': None if row is None else row['id'], 'record': None if row is None else narrow(row), 'parent': None if parent is None else narrow(parent), 'matter': narrow(matter), 'sourceParentId': occurrences[0]['sourceKeys']['source_matter_id' if table == 'hearings' else 'source_task_id'], 'selectableNow': row is not None and not (row['is_archived'] or parent['is_archived'] or matter['is_archived']), 'before': {'selection': None, 'selectionVersion': '0'}, 'proposedAfter': {'id': row['id'] if row else f'FUTURE_STEP:{source_id}', 'isSelected': True}, 'sourceOccurrences': [{'report': x['target'], 'occurrence': x['queryOccurrence'], 'keys': x['sourceKeys']} for x in occurrences], 'dependencies': ['S2'] + ([] if row else ['step:' + str(source_id)]), 'mechanism': 'public.' + scope.replace('-', '_') + '_report_selection_save via existing application gateway', 'reportPurpose': 'Shared administrative scope: selected hearings supply matter contexts, selected steps supply work contexts. Not a client/lawyer/closed selection.'})
    assert all(not tables[n] for n in ['lawyer_report_selections', 'administrative_hearing_report_selections', 'administrative_step_report_selections'])
    for choice in choices:
        choice.update({'status': 'PROPOSED_NOT_APPLIED', 'preconditions': ['Scope still empty for each exact key', 'Fresh identity/parent/archive/role and version checks', 'Preserve all other choices; no bulk replacement', 'New submission UUID and genuine actor at any future authorized execution'], 'preservation': 'Client ten and all other purpose scopes unchanged; hearing11003 unchanged', 'rollback': 'Guarded deselect only newly inserted, journaled choice keys at expected versions; retain choice rows, receipts and audits.'})

    counts = {}
    for target in ['administrative-by-client', 'administrative-all-destinations']:
        rows = [r for r in admin_maps if r['target'] == target]
        tasks = {r['sourceKeys']['source_task_id'] for r in rows}
        current_tasks = {r['mapped']['admin_tasks']['id'] for r in rows if r['mapped']['admin_tasks'] is not None}
        for task in current_tasks:
            assert idx['admin_tasks'][task]['status'] != 'منجزة'
        counts[target] = {'sourceOccurrences': len(rows), 'uniqueWorkItems': len(tasks), 'existingSelectableWorkRows': len(current_tasks), 'afterFiveTaskNineStepRepairWorkRows': len(tasks), 'sourceTaskIds': sorted(tasks), 'currentTaskIds': sorted(current_tasks), 'missingTaskIds': sorted(tasks & TASK_IDS), 'rowMeaning': 'One work row, all chosen hearing and step contexts aggregated, no Cartesian multiplication.'}
    # Independently simulate the present all/client query from selected contexts.
    proposed_hearings = {c['currentId'] for c in choices if c['scope'] == 'administrative-hearing'}
    proposed_steps = {c['currentId'] for c in choices if c['scope'] == 'administrative-step' and c['currentId'] is not None}
    qualified_tasks = [w for w in tables['admin_tasks'] if w['status'] != 'منجزة' and w['matter_id'] in idx['matters'] and idx['matters'][w['matter_id']]['client_id'] in idx['clients'] and any(h['matter_id'] == w['matter_id'] and h['id'] in proposed_hearings for h in tables['hearings']) and any(f['task_id'] == w['id'] and f['id'] in proposed_steps for f in tables['task_actions'])]
    assert {w['id'] for w in qualified_tasks} == set(counts['administrative-all-destinations']['currentTaskIds'])
    assert {w['id'] for w in qualified_tasks if idx['matters'][w['matter_id']]['client_id'] == 245} == set(counts['administrative-by-client']['currentTaskIds'])
    sibling_open_rows = [h for h in tables['hearings'] if h['id'] in proposed_hearings and idx['matters'][h['matter_id']]['status'] == 'سارية' and idx['matters'][h['matter_id']]['client_id'] in idx['clients'] and h['next_hearing_date'] is not None and h['next_hearing_date'] < '2026-10-04']
    plan = {
        'status': 'PROPOSAL_READY_OWNER_DECISIONS_PENDING_REPAIRS_NOT_APPLIED', 'task69Accepted': False,
        'partyFields': party_witnesses, 'administrativeRepairs': repairs, 'destinationDecisions': destinations,
        'currentRoleLookup': tables['lookup_party_role'],
        'outOfScopeDependentSteps': [{'sourceStep': int(q['legacy_action_id']), 'sourceTask': int(q['legacy_task_id_raw']), 'sourceRecordKey': q['src_record_key'], 'disposition': 'Remain quarantined; excluded from this bounded proposal'} for q in lineage['quarantine.task_action_transform'] if q['legacy_task_id_raw'] is not None and int(q['legacy_task_id_raw']) in TASK_IDS and int(q['legacy_action_id']) not in STEP_IDS],
        'outOfScopeDestinationTasks': [{'sourceTask': int(q['legacy_task_id']), 'sourceRecordKey': q['src_record_key'], 'destination': q['source_payload']['الجهة'], 'reasons': q['reason_codes']} for q in lineage['quarantine.admin_task_transform'] if q['source_payload']['الجهة'] in {d['label'] for d in destinations} and int(q['legacy_task_id']) not in TASK_IDS],
        'selectionChoices': choices, 'currentRuleCounts': counts,
        'selectionCounts': dict(collections.Counter(c['scope'] for c in choices)),
        'selectableCounts': dict(collections.Counter(c['scope'] for c in choices if c['selectableNow'])),
        'sharedScopeImpact': {'openDecisionsAllDestinationsAt20261004': [{'hearingId': h['id'], 'matterId': h['matter_id'], 'nextDate': h['next_hearing_date']} for h in sibling_open_rows], 'limitation': 'Other destination/dated variants depend on chosen future parameters; administrative-by-destination can include additional works because it uses latest steps, not the selected-step scope. Future rehearsal must quantify requested destination slices before any selection application.'},
        'preservedSelectionStores': {k: v for k, v in tables.items() if k.endswith('_report_selections')},
        'migration': '78 stays unchanged. No DDL generated. Future bounded source-release journal/constraints and db:check integration require separate implementation review; assess candidate migration only then.',
        'mechanismLimit': 'Task62 runner/receipt is pinned to its signed plan and kind. admin_edit_save creates native records and cannot stand in for historical release. Do not rerun global transforms or edit quarantine resolved fields.',
        'historicalInvariantRequirement': 'admin-reconciliation.ts recomputes quarantine from current destination lookups. Adding these labels naively would alter expectations for all listed destination tasks, and releasing parents would alter expectations for all sibling steps. Future design must pin the existing historical lookup/reason basis and add an exact append-only release overlay for these five tasks/nine steps, with permanent constraints/db:check mapping assertions. Do not broadly suppress mismatch checks or change any unapproved row.',
        'executionGate': 'Separate owner business decisions, reviewed implementation/rehearsal and explicit actual-operation authorization required. This inventory is not executable.',
        'effort': 'Approximately 2–4 development/rehearsal days for narrow provenance/repair tooling after decisions, plus 0.5–1 day for guarded choices and report verification. Owner review about 30–60 minutes if source interpretation is available; no new service/license cost. Wider ambiguities remain held.',
        'auditAccounting': 'No events expected in this read-only pass. Future runner must produce and validate exact per-operation audit/receipt delta during isolated rehearsal, freeze it for actual operation, and reconcile genuine authentication separately. No guessed numerical audit allowance.',
    }
    evidence = {'status': 'EVIDENCE_COMPLETE_NOT_LITERAL_EQUALITY', 'originalSourceOccurrences': 117, 'originalMissingOccurrences': 21, 'originalDistinctFields': 17, 'originalDistinctMatters': 14, 'extraRows': financial, 'extraCells': 35, 'extraMissingFields': 3, 'deduplicatedFields': 20, 'deduplicatedMatters': 17, 'partyWitnesses': party_witnesses, 'sourceIdentities': {k: v['sha256'] for k, v in sources.items()}, 'method': 'Unique legacy ID and parent checks over verified frozen source/current relations; join exact source record key and extraction SHA to immutable quarantine, enumerate all canonical side rows including retired, enumerate existing Task62 receipts. Source Access SHA is distinct from extraction SHA. Compare each typed current cell with exact retained source components. No database/report execution.', 'comparisonLimits': 'Five rows are outside the source PDF population. Field evidence does not make the six reports literally equal. Finance latest-overall and no Selected mode stay unchanged.'}
    validate(evidence, comparison)
    return evidence, plan


def validate(evidence, original):
    """Prevent a row-eligibility explanation from hiding omitted/different cells."""
    assert len(original['rows']) == evidence['originalSourceOccurrences'] == 117
    expected = {r['row']['id']: r for r in original['currentExtraRows']}
    actual = {r['rowId']: r for r in evidence['extraRows']}
    assert len(expected) == len(actual) == len(evidence['extraRows']) == 5
    assert actual.keys() == expected.keys()
    gaps = {}
    for identity, row in actual.items():
        source = expected[identity]
        assert row['sourceKeys'] == source['sourceKeys'] and row['currentKeys'] == source['row']['keys']
        assert row['sourceCopy'] == 'older' and row['sourceAccessSha256'] == evidence['sourceIdentities']['older']
        assert row['sourcePdfOccurrence'] is None
        assert [c['field'] for c in row['cells']] == FIELDS
        assert [c['currentCell'] for c in row['cells']] == source['row']['cells']
        for c in row['cells']:
            assert 'rawComponents' in c and 'sourceDisplayExpression' in c
            raw = source['sourceOutsidePrintedScope']['hearing' if c['field'] in ['court', 'latest'] else 'matter']
            assert c['rawComponents'] and all(v == raw[k] for k, v in c['rawComponents'].items())
            key = (row['sourceKeys']['matter'], c['field'])
            if key in EXTRA_GAPS:
                assert c['disposition'] == 'proved-quarantined-party-missing' and c['currentCell'] == {'type': 'null'}
                witness = one([w for w in evidence['partyWitnesses'] if w['operationId'] == c['witnessOperation']], key)
                q = witness['quarantine']
                assert q['id'] == EXTRA_GAPS[key] and q['reason_codes'] == ['unreviewed_party_role'] and q['resolved_at'] is None
                assert q['raw_value'] == witness['rawSourceValue'] and normal_lines(c['sourceDisplayExpression']) == normal_lines(q['raw_value'])
                assert witness['canonicalSideRowsIncludingRetired'] == [] and witness['currentMatter']['id'] == row['currentKeys']['matter']
                assert q['src_record_key'] == witness['currentMatter']['legacy_source_record_key'] and q['extraction_sha256'] == witness['currentMatter']['legacy_source_extraction_sha256']
                gaps[key] = True
            elif c['sourceDisplayExpression'] is None:
                assert c['currentCell'] == {'type': 'null'} and c['disposition'] == 'exact-typed-null'
            else:
                current = c['currentCell']['value']
                want = c['sourceDisplayExpression'].removeprefix('في ') if c['field'] == 'latest' else c['sourceDisplayExpression']
                if c['disposition'] == 'proved-reviewed-court-label-mapping':
                    mapping = c['reviewedCourtMapping']
                    assert c['field'] == 'court' and mapping['sourceField'] == mapping['targetField'] == 'court'
                    assert c['rawComponents']['المحكمة'] == mapping['sourceValue']
                    want = want.replace(mapping['sourceValue'], mapping['targetValue'], 1)
                assert normal_lines(current) == normal_lines(want)
    assert set(gaps) == set(EXTRA_GAPS) and sum(len(r['cells']) for r in actual.values()) == evidence['extraCells'] == 35
    assert evidence['status'] == 'EVIDENCE_COMPLETE_NOT_LITERAL_EQUALITY'


if __name__ == '__main__':
    source, output = (Path(x).resolve() for x in sys.argv[1:3])
    assert output != source and source not in output.parents
    evidence, plan = build(source)
    output.mkdir(parents=True, exist_ok=True)
    for name, value in [('financial-field-addendum.json', evidence), ('resolution-proposal.json', plan)]:
        with (output / name).open('xb') as handle:
            handle.write(encoded(value))
    print('PASS: 35 extra cells; 21+3 occurrences, 20 distinct fields /17 matters; exact unapplied proposal')
