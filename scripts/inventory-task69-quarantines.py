"""Offline, read-only Task 6.9 inventory. Never opens a database or applies repairs.

Inputs are protected consistent snapshots and frozen evidence; outputs are review
proposals. Names are matched exactly, with explicit cardinalities, never fuzzily.
"""

import argparse
import collections
import copy
import hashlib
import json
import re
from pathlib import Path


STATUSES = (
    'released_verified', 'deliberately_excluded', 'approved_mapping',
    'new_decision', 'blocked_parent', 'missing_external_evidence',
    'integrity_discrepancy',
)
D1 = {'خبراء جنوب الجيزة', 'خبراء شمال الجيزة', 'مجلس الدولة بالرحاب'}
P2 = ('ملتمس ضده', 'ملتمس', 'خصم متدخل إنضمامي')


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf8')


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                    separators=(',', ':')).encode('utf8')).hexdigest()


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def grouped(rows, field):
    result = collections.defaultdict(list)
    for row in rows:
        result[row.get(field)].append(row)
    return result


def unique(rows, field):
    result = grouped(rows, field)
    assert all(len(v) == 1 for v in result.values()), ('non-unique', field)
    return {k: v[0] for k, v in result.items()}


def reviewed_key(value):
    if value is None:
        return None
    return '\n'.join(x.strip(' \t') for x in value.replace('\\n', '\n')
                     .replace('\r\n', '\n').replace('\r', '\n')
                     .strip(' \t\n').split('\n'))


def project(row):
    """Narrow current target witness, retaining all business/provenance values."""
    if row is None:
        return None
    return {k: v for k, v in row.items() if k not in ('legacy_source_payload',)
            and not k.endswith('_normalised')}


def party_parse(raw, roles):
    """Inspect EVERY line/role, unlike the historical fail-first importer.

    This proposes no new meaning: only exact existing role labels are resolvable.
    Unknown, duplicate, malformed and mixed-gender fragments remain explicit.
    """
    blocks, fragments, errors = [], [], []
    for number, text in enumerate(raw.replace('\r\n', '\n').replace('\r', '\n').split('\n'), 1):
        text = text.strip()
        if not text:
            continue
        if not (text.startswith('"') and text.endswith('"')):
            if '"' in text:
                errors.append({'line': number, 'reason': 'malformed_quotes', 'raw': text})
            blocks.append({'name': text, 'gender': None, 'roleIds': []})
            continue
        if not blocks:
            errors.append({'line': number, 'reason': 'role_without_name', 'raw': text})
        values = [x.strip() for x in re.split('[،,]', text[1:-1]) if x.strip()]
        if not values:
            errors.append({'line': number, 'reason': 'empty_role', 'raw': text})
        for value in values:
            matches = [r for r in roles if value in (r['label_ar_m'], r['label_ar_f'])]
            fragment = {'line': number, 'raw': value, 'exactRoleMatchIds': [r['id'] for r in matches]}
            fragments.append(fragment)
            if len(matches) != 1:
                errors.append({'line': number, 'reason': 'unknown_or_ambiguous_role', 'raw': value})
            elif blocks:
                r = matches[0]
                gender = None if r['label_ar_m'] == r['label_ar_f'] else ('m' if value == r['label_ar_m'] else 'f')
                b = blocks[-1]
                if r['id'] in b['roleIds']:
                    errors.append({'line': number, 'reason': 'duplicate_role', 'raw': value})
                if gender and b['gender'] and gender != b['gender']:
                    errors.append({'line': number, 'reason': 'mixed_gender', 'raw': value})
                b['roleIds'].append(r['id'])
                if gender:
                    b['gender'] = gender
    return {'blocks': blocks, 'fragments': fragments, 'errors': errors}


def build(snapshot, previous):
    tables = snapshot['tables']
    get = lambda name: tables[name]
    issues, registers, proofs = [], [], []
    aliases = grouped(get('public.person_name_alias'), 'alias_ar')
    exclusions = unique(get('public.migration_excluded_name'), 'raw_value')
    roles = get('public.lookup_party_role') + [
        {'id': 'NEW:' + label, 'label_ar_m': label, 'label_ar_f': label}
        for label in P2
    ]
    matters = unique(get('public.matters'), 'id')
    matter_source = unique(get('public.matters'), 'legacy_source_record_key')
    matter_legacy = unique(get('public.matters'), 'legacy_id')
    hearings = unique(get('public.hearings'), 'id')
    source_targets = {}
    for name in ('matters', 'hearings', 'admin_tasks', 'task_actions', 'powers_of_attorney', 'documents', 'fee_letters'):
        source_targets[name] = grouped(get('public.' + name), 'legacy_source_record_key')
    qstores = {k: v for k, v in tables.items() if k.startswith('quarantine.')}
    known = {x['quarantine']['id']: copy.deepcopy(x) for x in previous['partyFields']}
    assert len(known) == 20
    for x in known.values():
        if x['sourceMatter'] == 1724:
            x['proposedAfter']['blocks'] = ([{'name': 'الشرقية إيسترن كومباني', 'gender': None, 'roleIds': ['NEW:خصم متدخل إنضمامي']}]
                if x['side'] == 'client' else [
                    {'name': 'شركة المنصور للتوزيع', 'gender': 'm', 'roleIds': [1]},
                    {'name': 'جهاز حماية المنافسة', 'gender': 'm', 'roleIds': [2, 'NEW:خصم متدخل إنضمامي']},
                    {'name': 'رئيس مجلس الوزراء', 'gender': 'm', 'roleIds': [2]}])
        for b in x['proposedAfter']['blocks']:
            if all(isinstance(r, str) for r in b['roleIds']):
                b['gender'] = None  # Exact same label in both gender fields.
    releases = unique(get('_migration.high_impact_resolution'), 'source_record_key')
    receipts = unique(get('_migration.task62_source_receipt'), 'source_identity')
    high_created = {(r['table'], r['id']): r for r in get('_migration.high_impact_application')[0]['created_rows']}

    def target(name, key):
        rows = source_targets[name].get(key, [])
        assert len(rows) <= 1, (name, key, 'duplicate source target')
        return rows[0] if rows else None

    def person(raw, trim=False):
        value = raw.strip() if trim and raw is not None else raw
        matches = aliases.get(value, [])
        return {'raw': raw, 'matchMode': 'exact-trim' if trim else 'exact',
                'matches': [{'personId': r['person_id'], 'aliasId': r['id'], 'retired': r['is_retired']} for r in matches],
                'resolvedPersonId': matches[0]['person_id'] if len(matches) == 1 else None,
                'reviewedExclusion': exclusions.get(value)}

    def add(store, row, key, unit, status, gap, proposal=None, decision=None, parents=None, targets=None):
        assert status in STATUSES
        issue = {'id': store + ':' + str(key), 'store': store, 'key': str(key), 'unit': unit,
                 'status': status, 'sourceRecordKey': row.get('src_record_key'),
                 'extractionSha256': row.get('extraction_sha256'), 'original': row,
                 'originalJsonSha256': digest(row), 'currentTargets': [project(r) for r in (targets or [])],
                 'gap': gap, 'proposed': proposal, 'decision': decision,
                 'dependencies': parents or [], 'evidence': 'inventory-witnesses.json',
                 'workflows': []}
        issues.append(issue)
        return issue

    # Historical record releases: original payload, exact released ID and every
    # initial release column are compared, then current edit history is replayed.
    for family, table in (('matter', 'matters'), ('hearing', 'hearings')):
        store = 'quarantine.' + family + '_transform'
        initial = unique(get('_migration.' + ('matter_edit_initial_matters' if family == 'matter' else 'hearing_edit_initial_hearings')), 'id')
        journal = grouped(get('_migration.' + family + '_edit_change'), family + '_id')
        for row in get(store):
            key = row['src_record_key']; release = releases.get(key)
            current = target(table, key); failures = []
            if not release or not current:
                failures.append('missing release or target')
            else:
                rid = release[family + '_id']
                if current['id'] != rid or release[family + '_quarantine_id'] != row['id']:
                    failures.append('release identity mismatch')
                created = high_created.get((table, rid))
                if not created:
                    failures.append('missing initial release body')
                else:
                    failures.extend('initial:' + k for k, v in created['initial'].items() if initial[rid].get(k) != v)
                latest = sorted(journal.get(rid, []), key=lambda r: r['version'])
                expected = latest[-1]['after_values'] if latest else initial[rid]
                if latest:
                    expected = expected.get(family, expected)
                # Later lifecycle adds columns; compare every initial/current
                # business column represented by retained initial view/history.
                failures.extend('current:' + k for k, v in expected.items() if k in current and current[k] != v)
                if current['legacy_source_payload'] != row['source_payload']:
                    failures.append('raw payload differs')
            issue = add(store, row, row['id'], 'record', 'integrity_discrepancy' if failures else 'released_verified',
                        'No missing record; never release again' if not failures else failures,
                        targets=[current] if current else [])
            issue['release'] = release
            proofs.append({'issue': issue['id'], 'failures': failures, 'method': 'release ID + full initial column comparison + latest authorized aggregate history'})

    # Field-level relationship issues: approved overlay is exact-ID only.
    for row in get('quarantine.matter_relationship_transform'):
        m = matter_legacy[int(row['legacy_matter_id'])]
        if row['relationship_kind'] == 'party':
            side = [p for p in get('public.matter_parties') if p['matter_id'] == m['id'] and p['side'] == row['side']]
            receipt = receipts.get('quarantine:' + str(row['id']))
            parse = party_parse(row['raw_value'], roles)
            if receipt:
                p = next((p for p in side if p['id'] == receipt['target_id']), None)
                failed = p is None or any(p.get(k) != v for k, v in receipt['after_values'].items())
                request = next(x['request'] for x in receipt['operation_manifest']['matters'] if x['result']['id'] == m['id'])
                requested = [x for x in request['parties'] if x['side'] == row['side'] and x['party_name'] == receipt['after_values']['party_name']]
                actual_roles = sorted([(x['ordinal'], x['role_id']) for x in get('public.matter_party_roles') if x['party_id'] == receipt['target_id'] and not x['is_retired']])
                failed = failed or len(requested) != 1 or actual_roles != sorted((x['ordinal'], x['role_id']) for x in requested[0]['roles'])
                status, gap, decision = ('integrity_discrepancy' if failed else 'released_verified'), 'Task6.2 receipt already released this exact field', None
                proposed = None
            elif row['id'] in known:
                x = known[row['id']]
                assert m['id'] == x['currentMatter']['id'] and row['raw_value'] == x['rawSourceValue']
                assert not side
                status, gap, proposed, decision = 'approved_mapping', 'Canonical side absent', x['proposedAfter']['blocks'], '+'.join(x['ownerDecisions'])
            elif not parse['errors']:
                status, gap, proposed, decision = 'approved_mapping', 'Exact approved role labels (including P2 future concepts) represent this field', parse['blocks'], 'Existing role labels / exact P2 concept; no P1 spelling substitution'
                assert not side
            else:
                status, gap, proposed, decision = 'new_decision', 'One or more whole-field meanings unresolved; all fragments inspected', parse, 'Q2-party-capacities'
                assert not side
            issue = add('quarantine.matter_relationship_transform', row, row['id'], 'party_field', status, gap, proposed, decision, targets=[m] + side)
            issue['fragmentInspection'] = parse
            if receipt:
                issue['release'] = {k: v for k, v in receipt.items() if k in ('kind', 'target_id', 'source_identity', 'source_sha256', 'after_values', 'audit_event_id', 'role_audit_event_id')}
            issue['workflows'] = ['Client/closed/lawyer/hearing/administrative report party display; report populations unchanged']
        else:
            exact = person(row['raw_value'])
            candidates = [person(x.strip()) for x in re.split('[،,]', row['raw_value']) if x.strip()]
            issue = add('quarantine.matter_relationship_transform', row, row['id'], 'lawyer_field', 'new_decision',
                        'Unreviewed whole-cell membership; possible exact fragments are suggestions, not approved splitting',
                        {'wholeCell': exact, 'candidateFragments': candidates, 'sourceRole': 'lead' if row['source_field'] == 'lawyerA' else 'support'},
                        'Q3-lawyer-membership', targets=[m])
            issue['workflows'] = ['Lawyer and team attribution; distinct overall hearing count remains distinct', 'No automatic report selections']

    # Parent-dependent administrative records. Recompute every field even if a
    # parent was missing when the historical importer ran.
    courts = {reviewed_key(r['label_ar']): r for r in get('public.lookup_court')}
    destinations = {reviewed_key(r['label_ar']): r for r in get('public.lookup_matter_destination')}
    assert len(courts) == len(get('public.lookup_court'))
    assert len(destinations) == len(get('public.lookup_matter_destination'))
    cross = {reviewed_key(r['source_value']): r for r in get('public.migration_crosswalk') if r['source_field'] == 'court'}
    reviews = unique([r for r in get('quarantine.review_value') if r['topic'] == 'admin_assignee'], 'value')

    def admin_person(raw):
        p = person(raw, True)
        if raw is None or not raw.strip():
            return None, []
        if p['resolvedPersonId'] is not None:
            return p['resolvedPersonId'], []
        rv = reviews.get(raw.strip())
        if rv and rv['firm_answer'] == 'not a name':
            return None, []
        if rv and rv['firm_person']:
            mapped = person(rv['firm_person'], True)
            if mapped['resolvedPersonId'] is not None:
                return mapped['resolvedPersonId'], []
        return None, [{'field': 'person', 'raw': raw, 'exactMatches': p, 'review': rv}]

    tasks = {}
    for row in get('quarantine.admin_task_transform'):
        raw = row['source_payload']; unresolved = []
        m = matter_legacy.get(int(raw['matterID'])) if raw['matterID'] is not None else None
        person_id, errors = admin_person(raw['القائم بالعمل']); unresolved.extend(errors)
        court, circuit, destination = None, raw['الدائرة'], None
        court_raw = raw['المحكمة']; rule = cross.get(reviewed_key(court_raw))
        if court_raw is not None:
            if rule is None:
                cr = courts.get(reviewed_key(court_raw)); court = cr['id'] if cr else None
                if not cr:
                    unresolved.append({'field': 'court', 'raw': court_raw})
            elif rule['target_field'] in ('court', 'SPLIT'):
                cr = courts.get(reviewed_key(rule['target_value'])); court = cr['id'] if cr else None
                if not cr:
                    unresolved.append({'field': 'court_rule', 'rule': rule})
                if rule['target_field'] == 'SPLIT':
                    found = re.search("circuit='([^']+)'", rule['reviewer_note'] or '')
                    rc = found[1] if found else None
                    if circuit is not None and rc is not None and circuit != rc:
                        unresolved.append({'field': 'circuit_conflict', 'raw': circuit, 'reviewed': rc})
                    circuit = circuit if circuit is not None else rc
            elif rule['target_field'] == 'matter_destination':
                dr = destinations.get(reviewed_key(rule['target_value'])); destination = dr['id'] if dr else None
                if not dr:
                    unresolved.append({'field': 'court_destination', 'rule': rule})
            elif rule['target_field'] == 'circuit':
                if circuit is not None and circuit != rule['target_value']:
                    unresolved.append({'field': 'circuit_conflict', 'raw': circuit, 'reviewed': rule['target_value']})
                circuit = circuit if circuit is not None else rule['target_value']
            elif rule['target_field'] is not None:
                unresolved.append({'field': 'unsupported_court_rule', 'rule': rule})
        dest_raw = raw['الجهة']
        if dest_raw is not None:
            dr = destinations.get(reviewed_key(dest_raw))
            did = dr['id'] if dr else ('NEW:' + dest_raw if dest_raw in D1 else None)
            if did is None:
                unresolved.append({'field': 'destination', 'raw': dest_raw})
            elif destination is not None and destination != did:
                unresolved.append({'field': 'destination_conflict', 'courtDestination': destination, 'sourceDestination': did})
            else:
                destination = did
        if m is None:
            unresolved.append({'field': 'matter', 'raw': raw['matterID']})
        proposed = {'legacy_id': int(row['legacy_task_id']), 'matter_id': m['id'] if m else None,
                    'court_id': court, 'circuit': circuit, 'destination_id': destination,
                    'assigned_to_person_id': person_id, 'required_work': raw['العمل المطلوب'],
                    'status': raw['الحالة'], 'alert': raw['تنبيه'], 'result': raw['النتيجة'],
                    'previous_decision': raw['القرار السابق'], 'last_followup': raw['آخر متابعة']}
        for field, source in [('task_created_date', 'تاريخ الإنشاء'), ('execution_date', 'تاريخ التنفيذ'), ('deadline', 'آخر موعد')]:
            value = raw[source]
            if value is not None:
                assert re.fullmatch(r'\d{4}-\d{2}-\d{2} 00:00:00', value)
            proposed[field] = value[:10] if value else None
        assert target('admin_tasks', row['src_record_key']) is None
        issue = add('quarantine.admin_task_transform', row, row['src_record_key'], 'record',
                    'new_decision' if unresolved else 'approved_mapping', 'Missing administrative task',
                    proposed, 'Q1-administrative-destinations' if unresolved else 'D1/current reviewed mappings + resolved Task3.5B parent',
                    targets=[m] if m else [])
        issue['remainingFields'] = unresolved
        issue['workflows'] = ['Administrative selected-hearing reports; no seed', 'All historical child steps, not old nine-step sample']
        tasks[row['legacy_task_id']] = issue
    for row in get('quarantine.task_action_transform'):
        raw = row['source_payload']; parent = tasks.get(row['legacy_task_id_raw'])
        existing = [x for x in get('public.admin_tasks') if str(x['legacy_id']) == row['legacy_task_id_raw']]
        assert len(existing) <= 1
        pid, errors = admin_person(raw['القائم بالعمل'])
        if parent:
            status = 'approved_mapping' if parent['status'] == 'approved_mapping' and not errors else 'blocked_parent'
        elif existing and not errors:
            status = 'approved_mapping'
        else:
            status = 'missing_external_evidence' if not existing else 'new_decision'
        proposal = {'legacy_id': int(row['legacy_action_id']), 'parentTask': parent['id'] if parent else (existing[0]['id'] if existing else None),
                    'performed_by_person_id': pid, 'action_date': raw['تاريخ الإجراء'][:10] if raw['تاريخ الإجراء'] else None,
                    'next_appointment': raw['الموعد القادم'][:10] if raw['الموعد القادم'] else None,
                    'result': raw['النتيجة'], 'report': raw['تقرير']}
        issue = add('quarantine.task_action_transform', row, row['src_record_key'], 'record', status,
                    'Missing historical step; complete parent history included', proposal,
                    'Q4-orphans-and-assignees' if status != 'approved_mapping' else 'Existing exact mappings',
                    parents=[parent['id']] if parent else [], targets=existing)
        issue['remainingFields'] = errors
        issue['workflows'] = ['Latest-step output including all maximum-date ties; selected-step output only after separate choice']

    for row in get('quarantine.power_of_attorney_relationship'):
        p = target('powers_of_attorney', row['src_record_key']); assert p
        excluded = row['reason_codes'] == ['reviewed_exclusion']
        partial = row['reason_codes'] == ['partially_reviewed_compound_value']
        remainder = row['reason_details'][0].get('unreviewed_remainder') if partial else row['raw_value']
        proposed = {'reviewedMemberCountAlreadyImported': row['resolved_member_count'],
                    'unreviewedRemainder': remainder,
                    'candidateFragments': [person(v.strip()) for v in re.split('[،,\r\n]', remainder or '') if v.strip()],
                    'existingLawyers': [project(v) for v in get('public.power_of_attorney_lawyers') if v['power_of_attorney_id'] == p['id']]}
        add('quarantine.power_of_attorney_relationship', row, row['src_record_key'] + ':' + row['relationship_kind'], 'relationship_field',
            'deliberately_excluded' if excluded else ('missing_external_evidence' if row['relationship_kind'] == 'client' else 'new_decision'),
            'Reviewed non-name exclusion' if excluded else 'Parent exists; do not duplicate reviewed members or treat whole source cell as resolved',
            proposed, 'Reviewed exclusion / D64' if excluded else 'Q5-poa-identities', targets=[p])
    cases = grouped(get('public.matters'), 'case_number_ar')
    for row in get('quarantine.document_evidence'):
        doc = target('documents', row['src_record_key']); assert doc
        field = row['field_kind']; raw = row['raw_value']; matches = []
        if field == 'matter':
            matches = cases.get(raw, [])
            proposal = {'exactCaseMatches': [project(m) for m in matches], 'documentClientId': doc['client_id']}
            # A same-case match is insufficient if the client's identity differs.
            ready = len(matches) == 1 and matches[0]['client_id'] == doc['client_id']
            status = 'approved_mapping' if ready else 'missing_external_evidence'
            if ready:
                proposal['matter_id'] = matches[0]['id']
        elif field == 'responsible_person':
            proposal = person(raw); ready = proposal['resolvedPersonId'] is not None
            status = 'deliberately_excluded' if row['reason_code'] == 'reviewed_exclusion' else ('approved_mapping' if ready else 'new_decision')
        else:
            proposal = {'page_count': None, 'preserveRaw': raw, 'rule': 'D65 forbids inferred numeric count; physical sheets/pages/media need explicit interpretation'}
            status = 'deliberately_excluded'
        add('quarantine.document_evidence', row, row['src_record_key'] + ':' + field, 'field', status,
            'Existing document with field evidence; never duplicate document', proposal, 'D65 approved retention of compound raw quantity, excluding numeric inference' if field == 'page_count' else ('Q6-document-evidence' if not status in ('approved_mapping', 'deliberately_excluded') else 'Existing exact mapping/exclusion'), targets=[doc])
    fees = unique(get('public.fee_letters'), 'contract_id')
    for row in get('quarantine.fee_letter_matter_transform'):
        matches = cases.get(row['matter_ref_raw'], [])
        fee = fees.get(int(row['parent_contract_id_raw']))
        assert fee
        findings = [f for f in get('quarantine.finding') if f['src_record_key'] == row['src_record_key'] and f['topic'].startswith('fee_letter_matter')]
        approved_all = len(findings) == 1 and findings[0]['firm_answer'] == 'All'
        ready = len(matches) == 1 or (len(matches) > 1 and approved_all)
        add('quarantine.fee_letter_matter_transform', row, row['src_record_key'], 'relationship',
            'approved_mapping' if ready else 'missing_external_evidence', 'Missing forward fee-letter link; independent of reverse reference',
            {'fee_letter_id': fee['id'], 'matter_id': matches[0]['id'] if len(matches) == 1 else None,
             'matter_ids': [m['id'] for m in matches] if ready else [],
             'candidateMatterIds': [m['id'] for m in matches], 'ordinal': int(row['ordinal_raw']),
             'clientAgreement': [m['client_id'] == fee['client_id'] for m in matches],
             'priorFindingAnswers': [{'id': f['id'], 'answer': f['firm_answer'], 'detail': f['detail']} for f in findings],
             'multipleTargetDesignNeeded': len(matches) > 1 and approved_all},
            'Existing exact case mapping / reviewed All answer' if ready else 'Q7-fee-references', targets=[fee] + matches)
    for row in get('quarantine.matter_fee_letter_reference'):
        m = target('matters', row['src_record_key']); fee = target('fee_letters', row['resolved_fee_letter_source_key'])
        assert m and fee
        add('quarantine.matter_fee_letter_reference', row, row['src_record_key'], 'relationship', 'approved_mapping',
            'Missing reverse reference; parent already released', {'matter_id': m['id'], 'fee_letter_id': fee['id'], 'identifier_space': row['identifier_space'], 'legacy_reference_raw': row['reference_raw']},
            'Review1331 + Task3.5B', targets=[m, fee])
    for row in get('quarantine.attendee_span'):
        h = target('hearings', row['src_record_key']); assert h
        add('quarantine.attendee_span', row, row['fragment_id'], 'fragment', 'new_decision',
            'Ambiguous retained non-person-looking fragment; no inferred attendee/date',
            {'recommendation': 'Keep as historical note/marker only after exact review; never alter an actual hearing date'}, 'Q8-attendee-fragments', targets=[h])

    # Deferred issue outside quarantine: D54 applies even though no assignment
    # field exists. Every affected client is individually keyed and preserved.
    for c in get('public.clients'):
        raw = c['legacy_contact_lawyer_raw']
        if raw is not None and raw != '':
            add('deferred.D54', {'raw_value': raw, 'client_id': c['id'], 'legacy_client_id': c['legacy_id']}, c['id'],
                'field', 'new_decision', 'D54 explicitly deferred responsible-staff mapping/workflow; current historical display correct',
                person(raw), 'Q9-client-responsibility', targets=[c])

    return {'schema': 'task69-comprehensive-inventory-v1', 'status': 'INVENTORY_IN_PROGRESS_NOT_REPAIR_AUTHORITY',
            'snapshotIdentity': snapshot['identity'], 'issues': issues, 'registers': registers,
            'releaseProofs': proofs, 'catalog': snapshot['catalog'], 'coverage': snapshot['coverage'],
            'knownDecisionOverlay': {'P1ExactFieldCount': 15, 'P2LabelsBothGenders': list(P2),
                'P3FourPartiesFiveRoles': True, 'P4Preserved': True, 'D1Labels': sorted(D1),
                'R1': 'COMPREHENSIVE', 'S1S2': 'DEFERRED_NOT_APPROVED',
                'fields': [{'quarantineId': q, 'matter': x['currentMatter']['id'], 'side': x['side'],
                            'blocks': x['proposedAfter']['blocks'], 'decisions': x['ownerDecisions']} for q, x in known.items()]}}


def enrich(result, snapshot, sources):
    """Resolve overlapping review registers and inspect non-quarantine evidence."""
    tables = snapshot['tables']; issues = result['issues']; registers = result['registers']
    by_source = grouped(issues, 'sourceRecordKey')
    current_by_source = collections.defaultdict(list)
    for name, rows in tables.items():
        if name.startswith('public.'):
            for row in rows:
                if row.get('legacy_source_record_key'):
                    current_by_source[row['legacy_source_record_key']].append((name, row))
    cells = unique(tables['_migration.attendee_source_cell'], 'cell_id')
    span_groups = grouped(tables['_migration.attendee_source_span'], 'cell_id')
    cells_by_key_column = grouped(tables['_migration.attendee_source_cell'], 'src_record_key')
    people_spans = {}
    attendee_targets = unique(tables['public.hearing_attendees'], 'source_span_id')
    quarantined_spans = unique(tables['quarantine.attendee_span'], 'fragment_id')
    fragment_proofs = []
    for cell_id, cell in cells.items():
        spans = sorted(span_groups[cell_id], key=lambda x: x['sequence'])
        # JavaScript offsets in the imported span contract are UTF-16 code units.
        raw16 = cell['original_cell'].encode('utf-16-le')
        assert ''.join(x['raw'] for x in spans) == cell['original_cell'], cell_id
        content_parts = ['attendee-cell-content-v1', cell['original_cell']]
        content = ''.join(str(len(p.encode('utf8'))) + ':' + p for p in content_parts)
        assert hashlib.sha256(content.encode('utf8')).hexdigest() == cell['original_cell_sha256']
        cursor = 0
        for s in spans:
            assert s['start_offset'] == cursor
            assert raw16[s['start_offset'] * 2:s['end_offset'] * 2].decode('utf-16-le') == s['raw']
            cursor = s['end_offset']
            if s['kind'] == 'person':
                h = attendee_targets.get(s['fragment_id'])
                assert h and h['person_id'] == s['person_id'] and h['legacy_source_record_key'] == s['src_record_key']
                people_spans[s['fragment_id']] = h['id']
            elif s['review_required']:
                assert s['fragment_id'] in quarantined_spans
        assert cursor * 2 == len(raw16)
        fragment_proofs.append({'cellId': cell_id, 'sourceRecordKey': cell['src_record_key'],
                                'sourceColumn': cell['source_column'], 'rawSha256': cell['original_cell_sha256'],
                                'spanIds': [s['fragment_id'] for s in spans],
                                'kinds': dict(collections.Counter(s['kind'] for s in spans)),
                                'personTargetIds': [people_spans[s['fragment_id']] for s in spans if s['kind'] == 'person'],
                                'issueIds': ['quarantine.attendee_span:' + s['fragment_id'] for s in spans if s['review_required']]})
    result['fragmentConservation'] = {'cells': len(cells), 'spans': sum(map(len, span_groups.values())),
                                      'kinds': dict(collections.Counter(s['kind'] for s in tables['_migration.attendee_source_span'])),
                                      'proofs': fragment_proofs, 'method': 'Every original cell reconstructed exactly; complete contiguous UTF16 spans; each person maps to exact canonical attendee; every review fragment in quarantine'}

    for f in tables['quarantine.finding']:
        links = by_source.get(f['src_record_key'], [])
        topic = f['topic']
        if topic == 'attendee_unresolved':
            matched = [c for c in cells_by_key_column.get(f['src_record_key'], []) if c['source_column'] == f['column_name']]
            assert len(matched) == 1, ('finding/cell', f['id'])
            c = matched[0]; spans = span_groups[c['cell_id']]
            links = [i for i in links if i['store'] == 'quarantine.attendee_span' and i['original']['cell_id'] == c['cell_id']]
            state = 'linked_outstanding' if links else 'resolved_fragment_classification'
            detail = {'cellId': c['cell_id'], 'spanIds': [s['fragment_id'] for s in spans], 'kinds': dict(collections.Counter(s['kind'] for s in spans))}
        else:
            relevant = {
                'admin_assignee_unresolved': ('quarantine.admin_task_transform',),
                'task_action_no_parent': ('quarantine.task_action_transform',),
                'task_action_orphan': ('quarantine.task_action_transform',),
                'fee_letter_matter_unmatched': ('quarantine.fee_letter_matter_transform',),
                'fee_letter_matter_ambiguous': ('quarantine.fee_letter_matter_transform',),
                'admin_task_no_matter': ('quarantine.admin_task_transform',),
                'matter_no_client': ('quarantine.matter_transform',),
                'poa_no_client': ('quarantine.power_of_attorney_relationship',),
            }.get(topic, ())
            links = [x for x in links if x['store'] in relevant]
            detail = {'currentTargets': [{'table': n, **project(r)} for n, r in current_by_source.get(f['src_record_key'], [])]}
            if topic == 'fee_letter_key_collision':
                value = int(f['original_value'])
                detail = {'contractMatches': [r['id'] for r in tables['public.fee_letters'] if r['contract_id'] == value],
                          'mfilesMatches': [r['id'] for r in tables['public.fee_letters'] if str(r['mfiles_id']) == str(value)],
                          'decision': 'Review1331 / D23: domains remain distinct; never coalesce numeric keys'}
                state = 'resolved_distinct_identifier_domains'
            elif topic == 'hearing_no_matter':
                hs = [(n, r) for n, r in current_by_source[f['src_record_key']] if n == 'public.hearings']
                assert len(hs) == 1 and hs[0][1]['matter_id'] is None
                h = hs[0][1]
                issue = {'id': 'deferred.hearing-parent:' + str(h['id']), 'store': 'deferred.hearing-parent', 'key': str(h['id']),
                         'unit': 'field', 'status': 'missing_external_evidence', 'sourceRecordKey': f['src_record_key'],
                         'extractionSha256': f['extraction_sha256'], 'original': f, 'originalJsonSha256': digest(f),
                         'currentTargets': [project(h)], 'gap': 'Existing unassigned hearing, no parent identity supplied; preserve under existing keep-as-is instruction',
                         'proposed': {'matter_id': None, 'preserveUnassigned': True}, 'decision': 'Existing answer: fetch if possible, otherwise keep as-is; no invented parent',
                         'dependencies': [], 'evidence': 'inventory-witnesses.json', 'workflows': ['Matter-linked reports cannot assign this hearing to a matter']}
                issues.append(issue); links = [issue]; state = 'linked_outstanding'
            elif links:
                state = 'linked_historical_issue'
            else:
                assert topic == 'admin_assignee_unresolved', ('unhandled finding', f['id'], topic)
                assert any(n == 'public.admin_tasks' for n, r in current_by_source[f['src_record_key']])
                state = 'resolved_in_existing_admin_target'
        registers.append({'id': 'quarantine.finding:' + str(f['id']), 'store': 'quarantine.finding', 'original': f,
                          'classification': state, 'issueIds': [x['id'] for x in links], 'proof': detail,
                          'counting': 'Secondary finding reference, not an additional record/field issue'})
    for rv in tables['quarantine.review_value']:
        linked = [c for c in cells.values() if c['review_value_id'] == rv['id']]
        if rv['topic'] == 'open_question':
            decisions = {1331: 'Mixed contract/MFiles domains explicitly resolved; per-reference cardinality preserved',
                         2668: 'D53 approved cash/probono classification, no new question',
                         2669: 'D19 matter-owned branch, no new question',
                         2670: 'D54 deferred responsibility; see individual client issues'}
            classification = decisions[rv['id']]
        elif rv['topic'] == 'admin_assignee':
            classification = 'Reviewed exclusion' if rv['firm_answer'] == 'not a name' else 'Exact identity or plural-assignment decision still required'
        else:
            classification = 'Historical name review; current per-cell complete fragment evidence controls'
        registers.append({'id': 'quarantine.review_value:' + str(rv['id']), 'store': 'quarantine.review_value',
                          'original': rv, 'classification': classification,
                          'cellIds': [c['cell_id'] for c in linked],
                          'issueIds': [i['id'] for i in issues if (rv['topic'] == 'open_question' and rv['id'] == 2670 and i['store'] == 'deferred.D54')
                                       or (i['store'] == 'quarantine.attendee_span' and i['original']['cell_id'] in {c['cell_id'] for c in linked})],
                          'counting': 'Secondary rule/value reference; occurrences not additive to source issues'})
    for x in tables['public.migration_excluded_name']:
        registers.append({'id': 'public.migration_excluded_name:' + digest(x), 'store': 'public.migration_excluded_name',
                          'original': x, 'classification': 'Accepted exact non-person exclusion; no deletion of raw source',
                          'issueIds': [i['id'] for i in issues if i['original'].get('raw_value') == x['raw_value']],
                          'counting': 'Rule reference, not an extra source issue'})

    # Source-copy comparison stays subordinate to original extraction. Preserve
    # every difference; new rows are a separate population, not quarantine release.
    def scalar(v):
        if isinstance(v, bool):
            return str(v).lower()
        if v is None:
            return None
        if isinstance(v, float) and v.is_integer():
            return str(int(v))  # DAO numeric integers vs extraction text (IDs/counts/year).
        text = str(v)
        text = re.sub(r'T(\d\d:\d\d:\d\d)\.0{7}$', r' \1', text)
        return text.replace('\r\n', '\n').replace('\r', '\n')

    ids = {'الدعاوى': 'matterID', 'الجلسات': 'ID_hearings', 'admin work table': 'ID_Task',
           'إجراءات المهام': 'ID_process', 'العملاء': 'ID', 'المستندات': 'مسلسل المستند ID',
           'خطابات الأتعاب': 'contractID', 'Contacts': 'ID', 'المحامين': 'ID'}
    comparisons, copy_differences = [], []
    for label, source in sources.items():
        source_tables = source['tables']
        for issue in issues:
            row = issue['original']; payload = row.get('source_payload')
            source_file = row.get('src_file', '')
            name = source_file.removeprefix('tables/').removesuffix('.csv')
            if not payload or name not in source_tables:
                continue
            rows = source_tables[name]
            id_field = ids.get(name)
            if id_field is not None and id_field in payload:
                matches = [x for x in rows if scalar(x.get(id_field)) == scalar(payload[id_field])]
                identity_method = 'exact business ID'
            else:
                # POAs have no dependable source primary key. Match complete
                # common field content as a multiset, never ordinal row number.
                matches = [x for x in rows if all(scalar(x.get(k)) == scalar(v) for k, v in payload.items() if k in x)]
                identity_method = 'full common payload; multiplicity disclosed, no invented Access ID'
            differing = []
            if len(matches) == 1:
                differing = [{'field': k, 'original': v, 'copy': matches[0].get(k)} for k, v in payload.items()
                             if k in matches[0] and scalar(v) != scalar(matches[0][k])]
            comparisons.append({'issueId': issue['id'], 'source': label, 'sourceSha256': source['sha256'],
                                'method': identity_method, 'matchCount': len(matches), 'differences': differing,
                                'matchingRowSha256': [digest(m) for m in matches]})
        # Difference inventory uses stable IDs where supplied, and a full-row
        # multiset for POAs. Changes are not authorized synchronization.
    older, newer = sources['older']['tables'], sources['newer']['tables']
    for name in sorted(set(older) & set(newer)):
        id_field = ids.get(name)
        if id_field and all(id_field in r for r in older[name] + newer[name]):
            old = grouped(older[name], id_field); new = grouped(newer[name], id_field)
            for key in sorted(set(old) | set(new), key=str):
                a, b = old.get(key, []), new.get(key, [])
                if a == b:
                    continue
                if len(a) == len(b) == 1:
                    diff = [{'field': k, 'older': a[0].get(k), 'newer': b[0].get(k)} for k in sorted(set(a[0]) | set(b[0]))
                            if scalar(a[0].get(k)) != scalar(b[0].get(k))]
                    if not diff:
                        continue
                else:
                    diff = None
                copy_differences.append({'table': name, 'idField': id_field, 'id': key, 'olderCount': len(a), 'newerCount': len(b),
                                         'classification': 'newer_only' if not a else 'older_only' if not b else 'changed_or_ambiguous',
                                         'differences': diff, 'older': a, 'newer': b})
        else:
            canonical = lambda r: digest({k: scalar(v) for k, v in r.items()})
            a = grouped([{'hash': canonical(r), 'raw': r} for r in older[name]], 'hash')
            b = grouped([{'hash': canonical(r), 'raw': r} for r in newer[name]], 'hash')
            for key in sorted(set(a) | set(b)):
                if len(a.get(key, [])) != len(b.get(key, [])):
                    copy_differences.append({'table': name, 'payloadHash': key, 'classification': 'multiset_difference_not_claimed_as_update',
                                             'olderCount': len(a.get(key, [])), 'newerCount': len(b.get(key, [])),
                                             'raw': (a.get(key) or b[key])[0]['raw']})
    result['sourceCopies'] = {'method': 'Original staging is primary. ID match cardinality asserted/disclosed; POAs full-payload multiset; line endings, date, Boolean and integral DAO-number serialization only. No J fold, fuzzy legal matching, newest-wins update or inferred deletion.',
                              'issueComparisons': comparisons, 'copyDifferences': copy_differences,
                              'identities': {label: src['sha256'] for label, src in sources.items()}}

    # Exact available-parent searches for each orphan in both copies.
    parent_searches = []
    for issue in issues:
        if issue['store'] != 'quarantine.task_action_transform' or issue['original']['legacy_task_id_raw'] is None:
            continue
        raw_id = issue['original']['legacy_task_id_raw']
        if 'invalid_task_link' not in issue['original']['reason_codes']:
            continue
        searches = []
        for label, src in sources.items():
            rows = [r for r in src['tables']['admin work table'] if scalar(r['ID_Task']) == raw_id]
            searches.append({'source': label, 'parentId': raw_id, 'matches': rows})
        parent_searches.append({'issueId': issue['id'], 'searches': searches})
    result['orphanParentSearches'] = parent_searches

    # No source-family omissions: exact source-key/target-key conservation for
    # families whose transform quarantine is empty; raw payloads must match.
    families = [('staging.الدعاوى', 'public.matters'), ('staging.الجلسات', 'public.hearings'),
                ('staging.التوكيلات', 'public.powers_of_attorney'), ('staging.المستندات', 'public.documents'),
                ('staging.خطابات الأتعاب', 'public.fee_letters'), ('staging.الفواتير', 'public.invoices'),
                ('staging.السداد', 'public.payments'), ('staging.تقسيم التحصيلات', 'public.invoice_allocations'),
                ('staging.Attendance', 'public.attendance')]
    completeness = []
    for source_name, current_name in families:
        imported = [r for r in tables[current_name] if r['legacy_source_record_key'] is not None]
        source_rows = tables[source_name]
        billing = {'public.invoices': ('invoice', 'Inv-No'), 'public.payments': ('payment', 'ID'),
                   'public.invoice_allocations': ('allocation', 'ID')}.get(current_name)
        if billing:
            kind, identity_field = billing
            source_rows = [{**r, 'src_record_key': hashlib.sha256(('billing:' + kind + ':' + r[identity_field]).encode()).hexdigest() + ':000001'} for r in source_rows]
        src = unique(source_rows, 'src_record_key'); dst = unique(imported, 'legacy_source_record_key')
        assert set(src) == set(dst), (source_name, 'source/target identity coverage')
        for key, s in src.items():
            omitted = {'src_file', 'src_row_num', 'src_record_key', 'src_extraction_sha256'}
            if current_name == 'public.invoices':
                omitted.add('Pay-Date')  # D4: excluded, never inferred/restored.
            body = {k: v for k, v in s.items() if k not in omitted}
            assert dst[key]['legacy_source_payload'] == body, (source_name, key, 'payload')
        completeness.append({'source': source_name, 'target': current_name, 'sourceCount': len(src),
                             'importedTargetCount': len(dst), 'nativeOrSeparateReceiptCount': len(tables[current_name]) - len(imported),
                             'everySourceKeyAndPayloadExact': True})
    for source_name, current_name, qname in [('staging.admin work table', 'public.admin_tasks', 'quarantine.admin_task_transform'),
                                           ('staging.إجراءات المهام', 'public.task_actions', 'quarantine.task_action_transform')]:
        src = unique(tables[source_name], 'src_record_key'); dst = unique(tables[current_name], 'legacy_source_record_key')
        q = unique(tables[qname], 'src_record_key')
        assert not set(dst) & set(q) and set(dst) | set(q) == set(src)
        completeness.append({'source': source_name, 'target': current_name, 'sourceCount': len(src),
                             'importedTargetCount': len(dst), 'quarantineCount': len(q), 'disjointAndComplete': True})
    result['familyConservation'] = completeness
    result['historicalSemantics'] = {'meetingTables': 'D2 deliberately excluded; never reconstruct as quarantines',
        'legacyPartner': 'Approved historical label, not silently mapped to current people',
        'clientBranch': 'D19 and reviewed compatibility, distinct from D54 responsibility',
        'contacts': '188 source/current contacts; optional main contact under D55; no inferred lawyer relation',
        'logos': '54 preserved; all hashes included in owner snapshot comparison',
        'billingAttendance': 'Complete source-key/payload conservation plus prior accepted reconciliation reused; no migration quarantine',
        'legacyFlags': 'Saved choices are separate approved workflows; retained flags are not quarantine or authority to seed',
        'N1': 'ACCEPTED_UNRESOLVED_NOT_FIXED', 'PDFCopying': 'ACCEPTED_NOT_FIXED',
        'PDFSearch': 'UNCERTIFIED', 'Detail_Format': 'UNREADABLE'}
    return result


def finalize(result, snapshot, previous):
    """Create explicit dependencies, focused impact scenarios and decision groups."""
    tables = snapshot['tables']; issues = result['issues']
    by_id = unique(issues, 'id')
    matters = unique(tables['public.matters'], 'id')
    qtasks = [i for i in issues if i['store'] == 'quarantine.admin_task_transform']
    qsteps = [i for i in issues if i['store'] == 'quarantine.task_action_transform']
    task_by_legacy = {str(i['proposed']['legacy_id']): i for i in qtasks}
    steps_by_parent = grouped(tables['staging.إجراءات المهام'], 'ID_Task')
    ordinals = {}
    for rows in steps_by_parent.values():
        for n, row in enumerate(sorted(rows, key=lambda r: (int(r['ID_process']), r['src_record_key'])), 1):
            ordinals[row['src_record_key']] = n
    for i in qsteps:
        i['proposed']['source_ordinal'] = ordinals[i['sourceRecordKey']]
    for i in qtasks:
        raw_id = i['original']['legacy_task_id']
        i['allSiblingSourceSteps'] = [r['src_record_key'] for r in steps_by_parent.get(raw_id, [])]
        actual = [s['sourceRecordKey'] for s in qsteps if s['original']['legacy_task_id_raw'] == raw_id]
        assert set(actual) == set(i['allSiblingSourceSteps']), ('missing hidden child', raw_id)
    task_keys = {i['sourceRecordKey'] for i in qtasks}
    step_keys = {i['sourceRecordKey'] for i in qsteps}
    old_other_tasks = previous['outOfScopeDestinationTasks']
    old_siblings = previous['outOfScopeDependentSteps']
    assert len(old_other_tasks) == 120 and len(old_siblings) == 79
    assert all(r['sourceRecordKey'] in task_keys for r in old_other_tasks)
    assert all(r['sourceRecordKey'] in step_keys for r in old_siblings)
    result['expandedScopeCoverage'] = {'previous120DestinationTasks': [r['sourceRecordKey'] for r in old_other_tasks],
                                      'previous79SiblingSteps': [r['sourceRecordKey'] for r in old_siblings],
                                      'all544Tasks': len(qtasks), 'all769Steps': len(qsteps),
                                      'everyHistoricalChildOfEveryQuarantinedTaskAccounted': True,
                                      'oldSubsetBoundariesSuperseded': True}
    for i in qtasks + qsteps:
        raw = i['original']['source_payload']
        i['proposed'].update({'id': 'RETURNED_ID:' + i['id'], 'legacy_source_record_key': i['sourceRecordKey'],
                              'legacy_source_extraction_sha256': i['extractionSha256'], 'legacy_source_payload': raw,
                              'is_archived': False})
        for field, source in ([('legacy_assignee_raw', 'القائم بالعمل'), ('legacy_court_raw', 'المحكمة'),
                               ('legacy_circuit_raw', 'الدائرة'), ('legacy_destination_raw', 'الجهة')]
                              if i in qtasks else [('legacy_performed_by_raw', 'القائم بالعمل'), ('legacy_task_id_raw', 'ID_Task')]):
            i['proposed'][field] = raw[source]
    for i in issues:
        i['preconditions'] = {'immutableIssueSha256': i['originalJsonSha256'],
                              'targetStates': [{k: r[k] for k in ('id', 'row_version', 'is_archived', 'is_retired') if k in r} for r in i['currentTargets']],
                              'archiveRule': 'Fresh guard; never auto-restore or bypass archived parent',
                              'missingTargetRule': 'Exact source identity absent; no existing release receipt; no indistinguishable current relation',
                              'futureAuthorization': 'Independent implementation review and explicit owner-operation mandate required'}
        if i['store'] == 'quarantine.document_evidence' and i['original']['field_kind'] == 'matter':
            # Candidate-only search preserves suffixes (including Latin J), never
            # writes or treats number overlap as an identity proof.
            raw = i['original']['raw_value']
            tokens = re.findall(r'(?<!\d)(\d+)\s*(?:/|لسنة)\s*(\d+)([قjJ]?)', raw)
            candidates = []
            for m in matters.values():
                mt = re.findall(r'(?<!\d)(\d+)\s*(?:/|لسنة)\s*(\d+)([قjJ]?)', m['case_number_ar'] or '')
                overlap = sorted(set(tokens) & set(mt))
                if overlap:
                    candidates.append({'matterId': m['id'], 'legacyId': m['legacy_id'], 'caseNumber': m['case_number_ar'],
                                       'clientId': m['client_id'], 'documentClientAgreement': m['client_id'] == i['currentTargets'][0]['client_id'],
                                       'overlappingTokens': overlap})
            i['proposed']['candidateOnlyTokenMatches'] = candidates
            i['proposed']['candidateWarning'] = 'No fuzzy match or legal equivalence certified; retain full strings and client context for exact owner identification'
        if i['store'] == 'quarantine.fee_letter_matter_transform' and i['status'] != 'approved_mapping':
            raw = i['original']['matter_ref_raw']; fee = i['currentTargets'][0]
            tokens = set(re.findall(r'(?<!\d)(\d+)\s*/\s*(\d+)([قjJ]?)', raw))
            i['proposed']['candidateOnlyTokenMatches'] = [
                {'matterId': m['id'], 'legacyId': m['legacy_id'], 'caseNumber': m['case_number_ar'], 'clientId': m['client_id'],
                 'feeClientAgreement': m['client_id'] == fee['client_id']}
                for m in matters.values() if tokens & set(re.findall(r'(?<!\d)(\d+)\s*/\s*(\d+)([قjJ]?)', m['case_number_ar'] or ''))]
            i['proposed']['candidateWarning'] = 'Same number/year is a lead only; exact full reference, suffix, client and source identity need resolution. No stored case-number splitting.'

    # Verify the two separately sourced hearings; they are NOT quarantine rows
    # and must not be recreated from newer-only Access differences.
    hearing_receipts = []
    for r in tables['_migration.task62_source_receipt']:
        if r['kind'] != 'hearing_source':
            continue
        h = next(h for h in tables['public.hearings'] if h['id'] == r['target_id'])
        failures = [k for k, v in r['after_values'].items() if h[k] != v]
        assert not failures
        assert h['legacy_id'] is None and h['legacy_source_record_key'] is None
        hearing_receipts.append({'sourceIdentity': r['source_identity'], 'sourceSha256': r['source_sha256'],
                                 'target': project(h), 'afterValues': r['after_values'], 'auditEventId': r['audit_event_id'],
                                 'unmappedRetained': r['source_values']['unmappedRetained'],
                                 'classification': 'VERIFIED_PRIOR_BOUNDED_SOURCE_RECEIPT_NOT_NEW_REPAIR'})
    result['priorExternalHearings'] = hearing_receipts
    for d in result.get('sourceCopies', {}).get('copyDifferences', []):
        if d.get('table') == 'الجلسات':
            receipts = [r for r in hearing_receipts if r['sourceIdentity'] == 'hearing:' + str(d.get('id'))]
            if receipts:
                d['alreadyReleasedReceiptTargetIds'] = [r['target']['id'] for r in receipts]

    # Focused offline impact: zero live selections stay zero. Counterfactual old
    # sample choices are explicitly NOT a seed recommendation or authority.
    existing_tasks = {str(t['legacy_id']): t for t in tables['public.admin_tasks']}
    existing_steps = [{'legacyId': s['legacy_id'], 'parent': str(next(t['legacy_id'] for t in tables['public.admin_tasks'] if t['id'] == s['task_id'])),
                       'date': s['action_date'], 'currentId': s['id'], 'result': s['result']} for s in tables['public.task_actions']]
    proposed_steps = [{'legacyId': s['proposed']['legacy_id'], 'parent': s['original']['legacy_task_id_raw'],
                       'date': s['proposed']['action_date'], 'issueId': s['id'], 'result': s['proposed']['result']} for s in qsteps]
    old_tasks = [x for x in previous['administrativeRepairs'] if x['table'] == 'admin_tasks']
    old_step_ids = {x['sourceId'] for x in previous['administrativeRepairs'] if x['table'] == 'task_actions'}
    history_effects = []
    for task in qtasks:
        raw_id = str(task['proposed']['legacy_id'])
        full = [s for s in proposed_steps if s['parent'] == raw_id]
        sample = [s for s in full if s['legacyId'] in old_step_ids]
        max_date = max((s['date'] for s in full if s['date'] is not None), default=None)
        old_max = max((s['date'] for s in sample if s['date'] is not None), default=None)
        history_effects.append({'taskIssueId': task['id'], 'sourceTaskId': int(raw_id), 'stepCount': len(full),
                               'status': task['proposed']['status'], 'matterId': task['proposed']['matter_id'],
                               'latestDate': max_date, 'latestStepSourceIds': [s['legacyId'] for s in full if max_date is not None and s['date'] == max_date],
                               'oldSampleStepCount': len(sample), 'oldSampleLatestDate': old_max,
                               'changedFromOldSample': bool(sample) and {s['legacyId'] for s in full if max_date is not None and s['date'] == max_date} != {s['legacyId'] for s in sample if old_max is not None and s['date'] == old_max},
                               'reportEligibleStatus': task['proposed']['status'] is not None and task['proposed']['status'] != 'منجزة'})
    chosen_hearing_ids = {x['currentId'] for x in previous['selectionChoices'] if x['scope'] == 'administrative-hearing'}
    chosen_matter_ids = {h['matter_id'] for h in tables['public.hearings'] if h['id'] in chosen_hearing_ids}
    chosen_step_ids = {x['sourceId'] for x in previous['selectionChoices'] if x['scope'] == 'administrative-step'}
    selected_parent_ids = {s['parent'] for s in existing_steps + proposed_steps if s['legacyId'] in chosen_step_ids}
    def projected(tasks):
        eligible = [(key, t) for key, t in tasks.items() if t['matter_id'] in chosen_matter_ids
                    and t['status'] is not None and t['status'] != 'منجزة']
        selected = [(key, t) for key, t in eligible if key in selected_parent_ids]
        return {'selectedAllDestinationWorkCount': len(selected),
                'selectedAllDestinationSourceTaskIds': sorted(int(k) for k, _ in selected),
                'selectedClient245WorkCount': sum(matters[t['matter_id']]['client_id'] == 245 for _, t in selected),
                'destinationModeWorkCounts': dict(collections.Counter(str(t['destination_id']) for _, t in eligible)),
                'rule': 'One work per task; chosen hearing required; all/client also chosen step; status NULL excluded as in SQL; no date filter on administrative work'}
    ready = {str(i['proposed']['legacy_id']): i['proposed'] for i in qtasks if i['status'] == 'approved_mapping'}
    all_parented = {str(i['proposed']['legacy_id']): i['proposed'] for i in qtasks if i['proposed']['matter_id'] is not None}
    result['reportEffects'] = {'currentSelections': {name: len(rows) for name, rows in tables.items() if name.startswith('public.') and name.endswith('_report_selections')},
        'unchangedSelectionsAdministrativeOutput': '0 rows before and after restoration: hearing and step choice stores remain empty',
        'historyByTask': history_effects,
        'oldSampleChoicesCounterfactual': {'authority': 'NOT_APPROVED; S1/S2 remain deferred; these are comparisons only',
            'existingTasks': projected(existing_tasks), 'approvedMappingsFullHistory': projected({**existing_tasks, **ready}),
            'allParentedTasksConditional': projected({**existing_tasks, **all_parented})},
        'restoredTaskStatusCounts': dict(collections.Counter(str(i['proposed']['status']) for i in qtasks)),
        'partyFields': [{'issueId': i['id'], 'matterId': i['currentTargets'][0]['id'], 'status': i['status'],
                        'effect': 'Display changes only; complete parties/ordered capacities; no change to report row qualification'}
                       for i in issues if i['unit'] == 'party_field' and i['status'] != 'released_verified'],
        'lawyerAttribution': [{'issueId': i['id'], 'matterId': i['currentTargets'][0]['id'],
                              'currentAssignedPeople': [{'personId': r['person_id'], 'role': r['role']} for r in tables['public.matter_lawyers'] if r['matter_id'] == i['currentTargets'][0]['id'] and not r['is_retired']],
                              'hearingCount': sum(h['matter_id'] == i['currentTargets'][0]['id'] for h in tables['public.hearings']),
                              'sourceRole': i['proposed']['sourceRole'],
                              'candidateMemberIds': [p['resolvedPersonId'] for p in i['proposed']['candidateFragments']]}
                             for i in issues if i['unit'] == 'lawyer_field'],
        'limits': ['No invented result totals for undecided lawyer identities/roles or unknown parents',
                   'A source lawyerA compound requires explicit lead/co-lead rule; never multiple lead rows that violate current constraint',
                   'Source lawyerB is supporting; team reports use all assigned lawyers, lawyer reports current lead/co_lead; overall hearings remain distinct',
                   'No new hearing repair proposed; verified prior releases and current latest hearing unchanged',
                   'Seven old date-specific open-decision rows are not a guaranteed global result; no choices seeded',
                   'POA/document/fee repairs affect relevant links/display, not a license to change report definitions']}

    # Prioritized queue: a short family-level agenda, each with exact attached
    # raw-value groups and issue references. Show ONLY first group to owner now.
    groups = []
    dest_groups = collections.defaultdict(list)
    for i in qtasks:
        for field in i['remainingFields']:
            if field['field'] == 'destination':
                dest_groups[field['raw']].append(i)
    ordered_destinations = sorted(dest_groups, key=lambda k: (k != 'خبراء شرق القاهرة', -len(dest_groups[k]), k))
    for number, raw in enumerate(ordered_destinations, 1):
        members = dest_groups[raw]
        children = [s for s in qsteps if set(s['dependencies']) & {m['id'] for m in members}]
        groups.append({'id': 'DEST-' + str(number), 'rawValue': raw,
                       'issueIds': [i['id'] for i in members], 'sourceTaskIds': [i['proposed']['legacy_id'] for i in members],
                       'currentMatterIds': sorted({i['proposed']['matter_id'] for i in members if i['proposed']['matter_id'] is not None}),
                       'childStepIssueIds': [i['id'] for i in children],
                       'recommendation': 'Confirm exact destination concept as a distinct label; provide an existing ID only if genuinely the same office. Do not use same-named court IDs.',
                       'caution': 'Geographic/shorthand labels may need a more precise office identity; full task court/circuit text remains attached'})
    def value_groups(selected, value_fn):
        d = collections.defaultdict(list)
        for i in selected:
            d[value_fn(i)].append(i['id'])
        return [{'rawValue': raw, 'issueIds': values} for raw, values in sorted(d.items(), key=lambda x: (-len(x[1]), str(x[0])))]
    queue = [
        {'id': 'Q1', 'topic': 'Additional administrative destinations and court/circuit conflicts', 'groups': groups,
         'otherConflictIssueIds': [i['id'] for i in qtasks if any(f['field'] not in ('destination', 'person', 'matter') for f in i['remainingFields'])],
         'recommendation': 'Resolve distinct offices one at a time; separately decide exact conflicting circuit/note fields. D1 remains approved.',
         'alternatives': 'An explicitly equivalent existing destination ID; retain the precise unresolved fields pending records',
         'benefit': 'Restores historical tasks without guessing offices or rewriting earlier court decisions',
         'risk': 'Unnecessary duplicate destination labels if shorthand equivalence is assumed incorrectly',
         'effort': 'Owner review 30–90 minutes across the full list; implementation/test 1–2 days within shared release mechanism; no new service'},
        {'id': 'Q2', 'topic': 'Remaining legal capacities, malformed party boundaries and plural/composite wording',
         'groups': value_groups([i for i in issues if i['unit'] == 'party_field' and i['status'] == 'new_decision'], lambda i: json.dumps(i['fragmentInspection']['errors'], ensure_ascii=False, sort_keys=True)),
         'recommendation': 'Approve exact per-field party/role allocations, grouping identical meanings only after inspection; preserve full names and ordered roles. No extension of the 15-field P1 spelling substitutions.',
         'alternatives': 'New distinct capacity labels where legally non-equivalent; leave historical text unassigned until clarified',
         'benefit': 'Accurate Arabic party descriptions across every report', 'risk': 'Flattening plural, ordinal or composite capacities could change legal meaning',
         'effort': 'Owner legal review likely several 30–60 minute batches; implementation/test 1–3 days after final mapping'},
        {'id': 'Q3', 'topic': '191 matter lawyer source fields',
         'groups': value_groups([i for i in issues if i['unit'] == 'lawyer_field'], lambda i: i['original']['raw_value']),
         'recommendation': 'Confirm exact people for each repeated compound; lawyerA first source member lead, further members co_lead is a proposal requiring approval; lawyerB remains support. Preserve order and distinct identities.',
         'alternatives': 'Owner identifies a single lead plus supporting members explicitly; retain undecided assignments',
         'benefit': 'Restores lawyer/team attribution with distinct overall hearing totals', 'risk': 'Compound text alone does not prove leadership rank or identity of titled names',
         'effort': 'Owner 20–45 minutes for 17 raw forms; implementation/test 1–2 days with attribution regression proof'},
        {'id': 'Q4', 'topic': 'Orphan steps, missing matter and administrative assignees',
         'issueIds': [i['id'] for i in qsteps if i['status'] in ('missing_external_evidence', 'new_decision')] + [i['id'] for i in qtasks if any(f['field'] in ('person', 'matter') for f in i['remainingFields'])] + [i['id'] for i in issues if i['store'] == 'deferred.hearing-parent'],
         'recommendation': 'Honor the prior promote-to-parent intent for 36 missing-parent steps after defining grouping and field placement; preserve 39 parentless steps in an explicit unassigned-history workflow. Use multiple assignees only through an explicit relation, never discard a person.',
         'alternatives': 'Supply exact original task/matter IDs from firm records; retain unmatched history pending evidence',
         'benefit': 'No fabricated parent or silently lost history', 'risk': 'Grouping unrelated steps or using result text as invented required work changes meaning',
         'effort': '0.5–2 owner review days if source records need research; 2–4 implementation/test days if a standalone-history/multiple-assignee model is adopted'},
        {'id': 'Q5', 'topic': 'POA lawyer membership and missing client',
         'groups': value_groups([i for i in issues if i['store'] == 'quarantine.power_of_attorney_relationship' and i['status'] != 'deliberately_excluded'], lambda i: i['proposed']['unreviewedRemainder']),
         'recommendation': 'Review unrecognized person identities and exact compound membership once per repeated form; preserve the 87 existing links and eight partially resolved remainders. All-null POA stays unassigned under the existing keep-as-is instruction.',
         'alternatives': 'Identify real external counsel without creating login accounts; retain exact text for identities unavailable in firm records',
         'benefit': 'Complete legitimate authorizations without confusing source wording with current edited membership',
         'risk': 'Name resemblance is not evidence that two people are the same; broad delimiter rules can split a full legal name incorrectly',
         'effort': 'Owner review highly variable, likely 1–3 days in batches; implementation/test 1–3 days after exact identities'},
        {'id': 'Q6', 'topic': 'Document matter references and responsible people',
         'groups': value_groups([i for i in issues if i['store'] == 'quarantine.document_evidence' and i['status'] not in ('approved_mapping', 'deliberately_excluded')], lambda i: i['original']['field_kind'] + ':' + i['original']['raw_value']),
         'recommendation': 'Confirm exact matter/person links using the candidate evidence. The 14 compound quantities already remain faithfully in historical text under D65; no numeric conversion or new quantity workflow is proposed.',
         'alternatives': 'Continue current optional null fields with explicit historical text where physical records cannot establish values',
         'benefit': 'Accurate document ownership', 'risk': 'Similar case numbers can belong to different clients; a title alone does not establish person identity',
         'effort': 'Owner physical-reference review 0.5–2 days; implementation/test 0.5–1.5 days within shared release mechanism'},
        {'id': 'Q7', 'topic': 'Remaining fee-letter references',
         'issueIds': [i['id'] for i in issues if i['store'] == 'quarantine.fee_letter_matter_transform' and i['status'] != 'approved_mapping'],
         'recommendation': 'Honor recorded All answers; identify remaining case targets explicitly from complete references and client context. Keep forward links independent of reverse references and contract IDs independent of MFiles IDs.',
         'alternatives': 'Supply the exact case/client file for unresolved descriptions; retain raw reference if no matter can be identified',
         'benefit': 'No accidental financial link to a different matter', 'risk': 'Partial number overlap is not a unique identity; multiple approved targets need one-to-many source provenance',
         'effort': 'Owner 30–90 minutes plus research for missing files; implementation/test 0.5–1.5 days'},
        {'id': 'Q8', 'topic': 'Ten ambiguous attendee fragments',
         'issueIds': [i['id'] for i in issues if i['store'] == 'quarantine.attendee_span'],
         'recommendation': 'Confirm exact non-person note/marker treatment per fragment, retaining original bytes and offsets; do not infer dates or attendees',
         'alternatives': 'Identify an actual attendee by ID only if original records establish it; retain ambiguity otherwise',
         'benefit': 'Closes the remaining fragment decisions without reopening accepted N1 date behavior', 'risk': 'Converting a note or date marker into a person corrupts attendance',
         'effort': 'Owner 5–15 minutes; implementation/test less than half a day within shared mechanism'},
        {'id': 'Q9', 'topic': 'Deferred D54 client responsible-staff field',
         'groups': value_groups([i for i in issues if i['store'] == 'deferred.D54'], lambda i: i['original']['raw_value']),
         'recommendation': 'Decide whether to introduce a separately maintained current responsible-staff relationship, with exact approved source membership; until then retain D54 historical display',
         'alternatives': 'Explicitly retain historical-only information as the final disposition; this is not a missing client contact',
         'benefit': 'Clear distinction between the client’s contact and the firm’s responsible lawyer', 'risk': 'Adding a workflow has training and maintenance cost and must not be silently included as data cleanup',
         'effort': 'Owner 15–30 minutes; 1–2 implementation/test days if current assignment maintenance is adopted'},
    ]
    for q in queue:
        q['financialImpact'] = 'No new subscription, licence, service or tooling purchase; existing usage only'
        q['status'] = 'PENDING_BUSINESS_DECISION_NOT_WRITE_AUTHORITY'
    result['decisionQueue'] = queue
    result['firstNewQuestion'] = groups[0]
    result['repairStages'] = [
        {'order': 1, 'name': 'Freeze original import semantics and implement additive reviewed-release ledger',
         'scope': 'No original quarantine/status/payload rewrite, no global transform rerun, no repurposed Task6.2 plan or native-create impersonation',
         'requirements': ['Exact source issue/hash and source-to-target cardinalities', 'Source-frozen expected historical state plus additive releases and current authorized edit replay',
                          'Permanent db:check constraints/proofs, not a one-time count assertion', 'One issue can resolve to multiple independently journaled targets',
                          'Genuine server-authorized actor/session, audit attribution, atomic transaction, parent/archive/version and stale-plan guards',
                          'Idempotency checks verify matching receipt result; uncertain operation outcome established before retry',
                          'No physical deletion or sequence rewind; reviewed compensating retirement/archive only for exact unchanged journaled targets']},
        {'order': 2, 'name': 'Approved role/destination concepts and exact relationship proposals',
         'issueIds': [i['id'] for i in issues if i['status'] == 'approved_mapping' and i['unit'] != 'record'],
         'newRoleLabels': list(P2), 'newDestinationLabels': sorted(D1),
         'requirements': ['Return/journal generated IDs, never use predicted IDs', 'P3 four separate parties/five ordered roles', 'Never broaden P1 beyond exact approved 15 fields']},
        {'order': 3, 'name': 'Approved administrative task parents then complete historical step sets',
         'taskIssueIds': [i['id'] for i in qtasks if i['status'] == 'approved_mapping'],
         'stepIssueIds': [i['id'] for i in qsteps if i['status'] == 'approved_mapping'],
         'requirements': ['Parent release receipt verified before every child', 'Full sibling coverage and original source ordering', 'Original NULL status/date/text values retained, no report-friendly defaults']},
        {'order': 4, 'name': 'Exact approved follow-on decisions, then their dependent children',
         'issueIds': [i['id'] for i in issues if i['status'] in ('new_decision', 'blocked_parent', 'missing_external_evidence')],
         'requirements': ['No speculative execution; every issue must gain a specific reviewed disposition', 'Missing source remains explicit if not obtainable; zero backlog cannot be achieved by invented data', 'Model extensions are proposals only, independently reviewed before implementation']},
        {'order': 5, 'name': 'Full-history isolated verification, independent implementation review, separately authorized owner operation',
         'requirements': ['Real-volume isolated restore; unchanged owner state', 'Malformed/duplicate/stale/archive/permission/idempotency and compensation tests',
                          'Per-row/source/field reconciliation and report/context counts including latest-date ties', 'Revisit S1/S2 only after effects understood; no automatic selections',
                          'No Task6.9 acceptance or Stage7 implied by inventory/review integrity PASS']},
    ]
    overlay_blocks = [b for f in result['knownDecisionOverlay']['fields'] for b in f['blocks']]
    approved_parties = [i for i in issues if i['unit'] == 'party_field' and i['status'] == 'approved_mapping']
    result['approvedEffectCounts'] = {
        'exactTwentyFieldOverlay': {'fields': 20, 'matters': len({f['matter'] for f in result['knownDecisionOverlay']['fields']}),
                                   'newParties': len(overlay_blocks), 'newPartyRoles': sum(len(b['roleIds']) for b in overlay_blocks),
                                   'P3': {'matter': 3317, 'newParties': 4, 'newRoles': 5, 'aggregateVersionAdvances': 1,
                                          'coreBusinessAuditRowsUnderExistingPerRowConvention': 10,
                                          'sharedCapacityCreationCountedSeparately': True}},
        'allApprovedPartyFields': {'fields': len(approved_parties), 'newParties': sum(len(i['proposed']) for i in approved_parties),
                                  'newRoles': sum(len(b['roleIds']) for i in approved_parties for b in i['proposed'])},
        'approvedTasks': len(ready), 'approvedSteps': sum(i['status'] == 'approved_mapping' for i in qsteps),
        'newRoleConcepts': 3, 'newDestinationConcepts': 3,
        'approvedForwardFeeLinks': sum(len(i['proposed']['matter_ids']) for i in issues if i['store'] == 'quarantine.fee_letter_matter_transform' and i['status'] == 'approved_mapping'),
        'approvedReverseFeeReferences': sum(i['store'] == 'quarantine.matter_fee_letter_reference' for i in issues),
        'auditLimit': 'P3 core insert/update effect recalculated. Final full-run audit totals depend on the independently reviewed additive ledger/model; do not claim an exact total before that implementation. Authentication, lookups, relationship writes and parent aggregate changes must each reconcile separately.'}
    result['estimate'] = {'inventory': 'This inventory round completes read-only discovery and proposals; no new build campaign',
        'ownerDecisions': 'Several staged review sessions, roughly 2–6 working days of owner/legal/source research spread as available; unavailable files may extend this',
        'implementation': 'Roughly 7–14 development days after decisions for additive provenance and agreed model/mapping work, with shared work across families',
        'isolatedVerification': 'Roughly 3–5 days at full volume plus independent review/corrections',
        'laterOwnerOperation': 'Plan 0.5–1 day for recovery, rehearsal refresh, maintenance and reconciliation after separate approval',
        'assumptions': ['No bulk Access synchronization or new services', 'Legal/identity decisions supplied in reviewable exact batches',
                        'No guaranteed wall-clock duration or invented usage-credit quote', 'Historical-only final dispositions may reduce scope; new unassigned/multi-assignee/quantity workflows can increase it']}
    result['partitionsByStoreAndUnit'] = []
    for store in sorted({c['key'] for c in snapshot['coverage'] if c['key'].startswith('quarantine.')} | {i['store'] for i in issues if i['store'].startswith('deferred.')}):
        local = [i for i in issues if i['store'] == store]
        result['partitionsByStoreAndUnit'].append({'store': store, 'issues': len(local),
            'units': dict(collections.Counter(i['unit'] for i in local)),
            'partitions': {s: sum(i['status'] == s for i in local) for s in STATUSES},
            'secondaryRegisterRows': sum(r['store'] == store for r in result['registers'])})
    result['countingContract'] = 'Issue counts are disjoint within stated units; record/field/relationship/fragment units are never presented as a total number of records. Findings, review values, rules, source-copy differences and overlapping reason codes are separate references.'
    result['status'] = 'COMPREHENSIVE_INVENTORY_COMPLETE_DECISIONS_PENDING_NO_REPAIRS_TASK69_HOLD'
    validate(result, snapshot)
    return result


def validate(result, snapshot=None):
    issues = result['issues']; by_id = unique(issues, 'id')
    assert result['status'] == 'COMPREHENSIVE_INVENTORY_COMPLETE_DECISIONS_PENDING_NO_REPAIRS_TASK69_HOLD'
    assert all(i['status'] in STATUSES for i in issues)
    assert all(i['originalJsonSha256'] == digest(i['original']) for i in issues)
    assert all(d in by_id for i in issues for d in i['dependencies'])
    assert all(not r['failures'] for r in result['releaseProofs'])
    assert sum(i['status'] == 'released_verified' and i['unit'] == 'record' for i in issues) == 382
    assert sum(i['status'] == 'released_verified' and i['unit'] == 'party_field' for i in issues) == 29
    assert len(result['priorExternalHearings']) == 2
    overlay = result['knownDecisionOverlay']
    assert overlay['S1S2'] == 'DEFERRED_NOT_APPROVED' and overlay['P1ExactFieldCount'] == 15
    assert overlay['P2LabelsBothGenders'] == list(P2) and set(overlay['D1Labels']) == D1
    p3 = [x for x in overlay['fields'] if x['matter'] == 3317]
    assert len(p3) == 2 and sum(len(x['blocks']) for x in p3) == 4
    assert sum(len(b['roleIds']) for x in p3 for b in x['blocks']) == 5
    assert next(x for x in p3 if x['side'] == 'client')['blocks'][0]['name'] == 'الشرقية إيسترن كومباني'
    opponent = next(x for x in p3 if x['side'] == 'opponent')['blocks']
    assert [b['name'] for b in opponent] == ['شركة المنصور للتوزيع', 'جهاز حماية المنافسة', 'رئيس مجلس الوزراء']
    assert opponent[1]['roleIds'] == [2, 'NEW:خصم متدخل إنضمامي']
    assert result['fragmentConservation']['cells'] == 12732 and result['fragmentConservation']['spans'] == 16602
    assert result['fragmentConservation']['kinds']['person'] == 9113 and result['fragmentConservation']['kinds']['ambiguous'] == 10
    assert len(result['sourceCopies']['issueComparisons']) == 7532
    assert all(x['matchCount'] == 1 for x in result['sourceCopies']['issueComparisons'])
    assert not any(x['differences'] for x in result['sourceCopies']['issueComparisons'] if x['source'] == 'older')
    assert result['historicalSemantics']['N1'] == 'ACCEPTED_UNRESOLVED_NOT_FIXED'
    assert result['historicalSemantics']['PDFSearch'] == 'UNCERTIFIED'
    assert len(result['expandedScopeCoverage']['previous120DestinationTasks']) == 120
    assert len(result['expandedScopeCoverage']['previous79SiblingSteps']) == 79
    keys = {i['sourceRecordKey'] for i in issues}
    assert set(result['expandedScopeCoverage']['previous120DestinationTasks']) <= keys
    assert set(result['expandedScopeCoverage']['previous79SiblingSteps']) <= keys
    assert all(x['issueIds'] == list(dict.fromkeys(x['issueIds'])) for x in result['registers'])
    assert all(d in by_id for r in result['registers'] for d in r['issueIds'])
    for p in result['partitionsByStoreAndUnit']:
        assert p['issues'] == sum(p['partitions'].values()) == sum(p['units'].values())
        members = [i for i in issues if i['store'] == p['store']]
        assert p['issues'] == len(members)
        assert p['partitions'] == {s: sum(i['status'] == s for i in members) for s in STATUSES}
        assert p['units'] == dict(collections.Counter(i['unit'] for i in members))
    for task in [i for i in issues if i['store'] == 'quarantine.admin_task_transform']:
        children = [i for i in issues if i['store'] == 'quarantine.task_action_transform' and i['original']['legacy_task_id_raw'] == task['original']['legacy_task_id']]
        assert set(task['allSiblingSourceSteps']) == {i['sourceRecordKey'] for i in children}
        assert all(i['dependencies'] == [task['id']] for i in children)
    if snapshot:
        for store, rows in snapshot['tables'].items():
            if not store.startswith('quarantine.'):
                continue
            count = sum(i['store'] == store for i in issues) + sum(r['store'] == store for r in result['registers'])
            assert count == len(rows), (store, count, len(rows))
            actual = collections.Counter(digest(r) for r in rows)
            captured = collections.Counter(digest(i['original']) for i in issues if i['store'] == store)
            captured.update(digest(r['original']) for r in result['registers'] if r['store'] == store)
            assert actual == captured, ('exact quarantine row coverage', store)
        assert len(result['catalog']) == len(snapshot['catalog']) == 175
    assert not any(i['status'] == 'integrity_discrepancy' for i in issues)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('snapshot', type=Path)
    parser.add_argument('previous', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--sources', type=Path, help='JSON mapping older/newer to retained rows plus additional source tables')
    args = parser.parse_args()
    result = build(read(args.snapshot), read(args.previous))
    if args.sources:
        result = enrich(result, read(args.snapshot), read(args.sources))
        result = finalize(result, read(args.snapshot), read(args.previous))
    with args.output.open('xb') as stream:
        stream.write(encoded(result))
    print(json.dumps({'issues': len(result['issues']), 'partitions': dict(collections.Counter(x['status'] for x in result['issues'])),
                      'releaseFailures': [x for x in result['releaseProofs'] if x['failures']]}, ensure_ascii=False))


if __name__ == '__main__':
    main()
