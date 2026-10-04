"""Evidence corruption probes for the Task 6.9 independent comparator."""

import copy
import importlib.util
import json
import sys
from pathlib import Path

spec = importlib.util.spec_from_file_location("oracle", Path(__file__).with_name("reconcile-task69.py"))
oracle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(oracle)
root = Path(sys.argv[1]).resolve()
expected = json.loads((root / "current-expected.json").read_text(encoding="utf-8"))
previews = {"outputs/browser/" + key + "-preview.json": json.loads((root / "outputs/browser" / (key + "-preview.json")).read_text(encoding="utf-8")) for key in expected}
assert len(oracle.validate_outputs(expected, lambda name: previews[name])) == 8
path = "outputs/browser/2-judgments-preview.json"


def mutate(kind):
    values = copy.deepcopy(previews)
    report = values[path]
    group = report["data"]["sections"][0]["groups"][0]
    row = group["rows"][0]
    if kind == "omitted-row":
        group["rows"].pop()
    elif kind == "wrong-identity":
        row["id"] = "hearing:99999999"
    elif kind == "null-versus-empty":
        i = next(i for i, cell in enumerate(row["cells"]) if cell["type"] == "null")
        row["cells"][i] = {"type": "text", "value": ""}
    elif kind == "decision-changed":
        row["cells"][-1]["value"] += " CHANGED"
    elif kind == "wrong-group":
        group["title"] = "CHANGED"
    elif kind == "chart-count":
        report["data"]["outcomeCounts"][0]["count"] += 1
    elif kind == "total-count":
        report["data"]["totals"][0]["value"]["value"] = "999"
    else:
        raise AssertionError(kind)
    try:
        oracle.validate_outputs(expected, lambda name: values[name])
    except AssertionError:
        return {"probe": kind, "rejected": True}
    raise AssertionError("Corruption accepted: " + kind)


probes = [mutate(kind) for kind in ["omitted-row", "wrong-identity", "null-versus-empty", "decision-changed", "wrong-group", "chart-count", "total-count"]]
(root / "oracle-corruption-probes.json").write_text(json.dumps({"status": "PASS", "validScopes": 8, "probes": probes}, indent=2), encoding="utf-8")
print("PASS eight valid scopes and seven rejected row/field/group/chart/total corruptions")
