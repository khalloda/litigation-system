"""Read-only Task 6.9 oracle over frozen DAO and PostgreSQL evidence.

Does not import application adapters, connect to a database, or change selections.
All identity joins use legacy keys plus parent checks; text is compared separately.
"""

import collections
import json
import sys
from pathlib import Path


def reconcile(root):
    def read(name):
        return json.loads((root / name).read_text(encoding="utf-8-sig"))

    tables = read("private/fixture-relations.json")["tables"]
    indexes = {name: {row["id"]: row for row in rows} for name, rows in tables.items()}
    for name, rows in tables.items():
        assert len(indexes[name]) == len(rows), name
    matters, hearings, clients = (indexes[k] for k in ("matters", "hearings", "clients"))
    null = {"type": "null"}

    def cell(value, kind="text"):
        return dict(null) if value is None else {"type": kind, "value": value}

    def nullable_key(value):
        return (value is None, value if value is not None else "")

    def label(table, identity):
        return None if identity is None else indexes[table][identity]["label_ar"]

    def court(hearing):
        name, circuit = label("lookup_court", hearing["court_id"]), hearing["circuit"]
        if circuit in (None, "", name):
            return name
        suffix = circuit if circuit.startswith("(") and circuit.endswith(")") else f"({circuit})"
        return ("غير مسجل" if name is None else name) + "\n" + suffix

    def parties(matter, side):
        rows = sorted(
            (r for r in tables["matter_parties"] if r["matter_id"] == matter and r["side"] == side and not r["is_retired"]),
            key=lambda r: (nullable_key(r["ordinal"]), r["id"]),
        )
        rendered = []
        for row in rows:
            roles = sorted(
                (r for r in tables["matter_party_roles"] if r["party_id"] == row["id"] and not r["is_retired"]),
                key=lambda r: (nullable_key(r["ordinal"]), r["id"]),
            )
            parts = ["غير مسجل" if row["party_name"] is None else row["party_name"]]
            for role in roles:
                value = indexes["lookup_party_role"][role["role_id"]]["label_ar_f" if row["gender"] == "f" else "label_ar_m"]
                parts.append('"' + value + '"')
            rendered.append("\n".join(parts))
        return "\n\n".join(rendered) if rendered else None

    by_matter = collections.defaultdict(list)
    for h in hearings.values():
        if h["matter_id"] is None:
            continue  # Both report contracts require an actual parent matter.
        assert h["matter_id"] in matters
        by_matter[h["matter_id"]].append(h)
    latest = {
        m: max(rows, key=lambda h: (h["hearing_date"] is not None, h["hearing_date"] or "", h["id"]))
        for m, rows in by_matter.items()
    }

    def basics(m, h):
        return [cell(m["case_number_ar"], "identifier"), cell(court(h)), cell(parties(m["id"], "client")), cell(parties(m["id"], "opponent")), cell(m["subject"])]

    def dated(h, field):
        date, text = h["hearing_date"], h[field]
        return text if date is None else date.replace("-", "/") + "\n" + ("غير مسجل" if text is None else text)

    def context(m, h):
        return {"matter": m["id"], "hearing": h["id"], "client": m["client_id"]}

    results = {}

    def add(scope, rows, totals):
        results[scope] = {"rows": rows, "count": len(rows), "totals": totals}

    def row(m, h, cells, group="", identity=None):
        return {"id": identity or f"matter:{m['id']}", "group": group, "keys": context(m, h), "cells": cells}

    # D62 selected client scope: the saved hearing, active matter, nonempty decision.
    selected = []
    for s in tables["client_report_selections"]:
        m = matters[s["id"]]
        if m["client_id"] != 245 or not s["is_selected"]:
            continue
        h = hearings[s["hearing_id"]]
        assert h["matter_id"] == m["id"] and m["status"] == "سارية" and h["decision"] not in (None, "")
        selected.append(row(m, h, basics(m, h) + [cell(dated(h, "decision"))]))
    add("1-client-selected", sorted(selected, key=lambda r: r["keys"]["matter"]), [len(selected), len(selected), 0])

    # D63 judgments: every hearing with a recorded (including empty) outcome.
    judgment_hearings = [h for h in hearings.values() if h["matter_id"] in matters and h["hearing_date"] is not None and "2010-03-01" <= h["hearing_date"] < "2010-12-02" and h["outcome"] is not None]
    judgment_hearings.sort(key=lambda h: (h["outcome"], h["hearing_date"], h["id"]))
    rows = []
    for h in judgment_hearings:
        m = matters[h["matter_id"]]
        rows.append(row(m, h, [cell(clients[m["client_id"]]["name_ar"])] + basics(m, h) + [cell(dated(h, "decision"))], h["outcome"], f"hearing:{h['id']}"))
    counts = collections.Counter(h["outcome"] for h in judgment_hearings)
    add("2-judgments", rows, [counts["صالح"], counts["ضد"], counts[""], sum(n for k, n in counts.items() if k not in ("صالح", "ضد", ""))])
    results["2-judgments"]["outcomeCounts"] = [{"outcome": k, "count": n} for k, n in sorted(counts.items())]

    # Approved D64-2: current principal/co-lead IDs; choose latest overall BEFORE period.
    assert not tables["lawyer_report_selections"]
    add("3-lawyer-selected", [], [0, 0, 0, 0, 0])
    assignments = collections.defaultdict(list)
    for a in tables["matter_lawyers"]:
        if not a["is_retired"] and a["role"] in ("lead", "co_lead"):
            assignments[a["matter_id"]].append(a)
    included = []
    for m in matters.values():
        if not any(a["person_id"] == 4 for a in assignments[m["id"]]):
            continue
        h = latest.get(m["id"])
        if h is None or h["hearing_date"] is None or not "2026-01-01" <= h["hearing_date"] < "2026-02-01":
            continue
        ordered = sorted(assignments[m["id"]], key=lambda a: (a["role"] != "lead", nullable_key(a["position"]), a["person_id"], a["id"]))
        identities = list(dict.fromkeys(a["person_id"] for a in ordered))
        names = "\n".join(indexes["people"][i]["name_ar"] for i in identities)
        group = clients[m["client_id"]]["name_ar"] + f" [{m['client_id']}]"
        included.append(row(m, h, basics(m, h) + [cell(h["hearing_date"], "date"), cell(h["decision"]), cell(names)], group))
    included.sort(key=lambda r: (clients[r["keys"]["client"]]["name_ar"], r["keys"]["client"], hearings[r["keys"]["hearing"]]["hearing_date"], r["keys"]["matter"]))
    add("3-lawyer-all", included, [len(included), len(included)])

    # Final distribution: ALL active-matter hearings whose NEXT date is in July.
    final = [h for h in hearings.values() if h["matter_id"] in matters and h["next_hearing_date"] is not None and "2026-07-01" <= h["next_hearing_date"] < "2026-08-01" and matters[h["matter_id"]]["status"] == "سارية"]
    final.sort(key=lambda h: (h["next_hearing_date"], nullable_key(label("lookup_court", matters[h["matter_id"]]["court_id"])), nullable_key(matters[h["matter_id"]]["circuit"]), nullable_key(matters[h["matter_id"]]["case_number_ar"]), h["id"]))
    rows = []
    for h in final:
        m = matters[h["matter_id"]]
        attendees = sorted((a for a in tables["hearing_attendees"] if a["hearing_id"] == h["id"] and not a["is_retired"]), key=lambda a: (a["current_order"] if a["current_order"] is not None else a["ordinal"], a["id"]))
        names = "\n".join(indexes["people"][a["person_id"]]["name_ar"] for a in attendees) if attendees else None
        rows.append(row(m, h, basics(m, h) + [cell(dated(h, "short_decision")), cell(names)], h["next_hearing_date"], f"hearing:{h['id']}"))
    add("4-final-distribution", rows, [len(set(h["matter_id"] for h in final))])

    # Approved separate administrative choices are initially empty; no flag seeding.
    assert not tables["administrative_hearing_report_selections"] and not tables["administrative_step_report_selections"]
    add("5-admin-client", [], [0])
    add("supplement-admin-all", [], [0])

    # Branch finance uses the latest overall hearing and does not require active status.
    rows = []
    for m in matters.values():
        if (m["client_id"], m["branch_id"]) != (197, 33):
            continue
        h = latest.get(m["id"])
        if h is None or h["decision"] in (None, ""):
            continue
        rows.append(row(m, h, basics(m, h) + [cell(dated(h, "decision")), cell(m["legacy_financial_allocation_raw"])]))
    add("6-branch-finance", sorted(rows, key=lambda r: r["keys"]["matter"]), [])

    # Stable source mappings. A source legacy ID must identify precisely one current row.
    source_indexes = {}
    lineage = read("private/lineage-relations.json")["tables"]
    for table, source_key in [("matters", "matterID"), ("hearings", "ID_hearings"), ("admin_tasks", "ID_Task"), ("task_actions", "ID_process")]:
        ix = collections.defaultdict(list)
        for r in tables[table]:
            legacy = r["legacy_id"]
            if legacy is None:
                legacy = (r.get("legacy_source_payload") or {}).get(source_key)
            if legacy is not None:
                ix[int(legacy)].append(r)
        source_indexes[table] = ix
    external = {}
    for receipt in lineage["_migration.task62_source_receipt"]:
        if receipt["kind"] != "hearing_source":
            continue
        source_id = int(receipt["source_identity"].split(":")[1])
        assert not source_indexes["hearings"][source_id]
        h = hearings[receipt["target_id"]]
        assert h["matter_id"] == receipt["matter_id"] and h["legacy_id"] is None
        source_indexes["hearings"][source_id].append(h)
        external[source_id] = {k: receipt[k] for k in ("source_identity", "source_sha256", "source_lineage", "target_id", "matter_id", "source_values", "after_values")}
    mappings = []
    for report in read("source-scoped-rows.json"):
        for occurrence, source in enumerate(report["rows"], 1):
            mapped = {}
            for table, key in [("matters", "source_matter_id"), ("hearings", "source_hearing_id"), ("admin_tasks", "source_task_id"), ("task_actions", "source_step_id")]:
                if key not in source["keys"]:
                    continue
                candidates = source_indexes[table][source["keys"][key]]
                assert len(candidates) <= 1, (table, source["keys"], "ambiguous legacy identity")
                mapped[table] = candidates[0] if candidates else None
            if mapped.get("hearings") and mapped.get("matters"):
                assert mapped["hearings"]["matter_id"] == mapped["matters"]["id"]
            if mapped.get("admin_tasks") and mapped.get("matters"):
                assert mapped["admin_tasks"]["matter_id"] == mapped["matters"]["id"]
            if mapped.get("task_actions") and mapped.get("admin_tasks"):
                assert mapped["task_actions"]["task_id"] == mapped["admin_tasks"]["id"]
            quarantine = {}
            for table, qtable, key, sourcekey in [("admin_tasks", "quarantine.admin_task_transform", "legacy_task_id", "source_task_id"), ("task_actions", "quarantine.task_action_transform", "legacy_action_id", "source_step_id")]:
                if table in mapped and mapped[table] is None:
                    candidates = [q for q in lineage[qtable] if str(q[key]) == str(source["keys"][sourcekey])]
                    assert len(candidates) == 1, (qtable, source["keys"])
                    quarantine[table] = candidates[0]
            mappings.append({"target": report["target"], "source": report["source"], "queryOccurrence": occurrence, "sourceKeys": source["keys"], "mapped": {k: None if v is None else {"id": v["id"], "legacyId": v["legacy_id"], "sourceRecordKey": v.get("legacy_source_record_key"), "extractionSha256": v.get("legacy_source_extraction_sha256")} for k, v in mapped.items()}, "quarantine": quarantine, "externalHearingReceipt": external.get(source["keys"]["source_hearing_id"])})

    checks = validate_outputs(results, read)
    for name, value in [("current-expected.json", results), ("source-current-mappings.json", mappings), ("current-contract-check.json", checks)]:
        (root / name).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(checks, ensure_ascii=False))


def validate_outputs(results, read):
    """Check every preview row/group/typed cell/total, without preview truncation."""
    checks = []
    for scope, expected in results.items():
        actual = read("outputs/browser/" + scope + "-preview.json")
        actual_rows = [(g, r) for s in actual["data"]["sections"] for g in s["groups"] for r in g["rows"]]
        assert actual["rowCount"] == expected["count"], (scope, "count")
        assert len(actual_rows) == expected["count"], (scope, "complete preview")
        for (group, got), want in zip(actual_rows, expected["rows"], strict=True):
            assert got == {"id": want["id"], "cells": want["cells"]}, (scope, want["id"], got, want)
            if want["group"]:
                assert group.get("date") == want["group"] or group.get("title") == want["group"], (scope, "group")
        assert [int(x["value"]["value"]) for x in actual["data"]["totals"]] == expected["totals"], (scope, "totals", actual["data"]["totals"], expected["totals"])
        if "outcomeCounts" in expected:
            assert actual["data"]["outcomeCounts"] == expected["outcomeCounts"]
        checks.append({"scope": scope, "rows": expected["count"], "typedCells": sum(len(r["cells"]) for r in expected["rows"]), "totals": expected["totals"], "status": "PASS_CURRENT_CONTRACT_NOT_ACCESS_EQUALITY"})
    return checks


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    reconcile(Path(sys.argv[1]).resolve())
