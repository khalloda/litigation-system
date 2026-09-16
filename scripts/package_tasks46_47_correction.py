#!/usr/bin/env python3
"""Build the independently verifiable Tasks 4.6/4.7 correction envelope."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
import zipfile

from package_tasks46_47_review import VERIFIER


PARENT = "f8751a0133f2d618ff0a1bb18c6a53ebaebf2afa"
ORIGINAL = Path(r"D:\Projects\LitigationData\review-evidence\tasks46-47-combined-20260916T152647Z")
TASK45 = Path(r"D:\Projects\LitigationData\review-evidence\task45-a1-20260916T092051Z")


def run(*args: str) -> bytes:
    return subprocess.check_output(args)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def write(path: Path, data: bytes | str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data.encode("utf-8") if isinstance(data, str) else data)


def safe(name: str) -> bool:
    path = PurePosixPath(name)
    return (
        name == path.as_posix()
        and not path.is_absolute()
        and ".." not in path.parts
        and "" not in path.parts
        and "\\" not in name
        and ":" not in name
    )


def git_blob(revision: str, path: str) -> bytes | None:
    probe = subprocess.run(
        ["git", "cat-file", "-e", f"{revision}:{path}"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return None if probe.returncode else run("git", "show", f"{revision}:{path}")


def copy_tree(source: Path, target: Path, selected: bool = False) -> None:
    if not source.exists():
        return
    for path in sorted(source.rglob("*")):
        if not path.is_file() or "__pycache__" in path.parts:
            continue
        if selected and path.suffix.lower() not in {".json", ".log", ".txt", ".png"}:
            continue
        destination = target / path.relative_to(source)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, destination)


def copy_file(source: Path, target: Path) -> None:
    assert source.is_file(), f"missing evidence: {source}"
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("output")
    parser.add_argument("--historical", required=True)
    parser.add_argument("--browser", required=True)
    parser.add_argument("--canonical", required=True)
    parser.add_argument("--reviewer-zip", required=True)
    parser.add_argument("--reviewer-manifest", required=True)
    args = parser.parse_args()
    root = Path.cwd().resolve()
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    staging = output / "_correction_staging"
    assert not staging.exists()
    staging.mkdir()
    commit = run("git", "rev-parse", "HEAD").decode().strip()
    parent = run("git", "rev-parse", "HEAD^").decode().strip()
    tree = run("git", "rev-parse", "HEAD^{tree}").decode().strip()
    assert parent == PARENT, parent

    status = run("git", "diff", "--name-status", "-z", PARENT, commit).decode().split("\0")
    changed: list[dict[str, object]] = []
    index = 0
    while index < len(status) and status[index]:
        state, path = status[index], status[index + 1]
        index += 2
        assert not state.startswith(("R", "C"))
        before, after = git_blob(PARENT, path), git_blob(commit, path)
        if before is not None:
            write(staging / "preimages" / path, before)
        if after is not None:
            write(staging / "postimages" / path, after)
        changed.append(
            {
                "status": state,
                "path": path,
                "preimage": before is not None,
                "preimageSize": None if before is None else len(before),
                "preimageSha256": None if before is None else digest(before),
                "postimage": after is not None,
                "postimageSize": None if after is None else len(after),
                "postimageSha256": None if after is None else digest(after),
            }
        )
    patch = run("git", "diff", "--binary", "--full-index", PARENT, commit)
    write(staging / "git/correction.patch", patch)
    write(output / "tasks46-47-correction.patch", patch)
    write(staging / "git/raw-commit.txt", run("git", "cat-file", "-p", commit))
    write(staging / "git/correction-tree.txt", run("git", "ls-tree", "-r", "--full-tree", commit))
    write(staging / "git/parent-tree.txt", run("git", "ls-tree", "-r", "--full-tree", PARENT))
    write(staging / "git/diff-stat.txt", run("git", "diff", "--stat", PARENT, commit))
    write(staging / "git/diff-numstat.txt", run("git", "diff", "--numstat", PARENT, commit))
    write(
        staging / "metadata/changed-files.json",
        json.dumps(
            {"base": PARENT, "commit": commit, "tree": tree, "files": changed},
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
    )
    report_source = root / "docs/reviews/2026-09-16-tasks-4-6-4-7-correction.md"
    report = (
        f"Correction commit: `{commit}`  \nCorrection tree: `{tree}`  \n"
        f"Sole parent: `{parent}`\n\n" + report_source.read_text(encoding="utf-8")
    )
    write(staging / "metadata/correction-report.md", report)
    write(output / "tasks46-47-correction-report.md", report)
    write(
        staging / "metadata/source-pin.json",
        json.dumps(
            {
                "commit": commit,
                "tree": tree,
                "parent": parent,
                "branch": run("git", "branch", "--show-current").decode().strip(),
                "tasksCheckboxesChanged": False,
                "ownerMigrationApplied": False,
                "activated": False,
                "pushed": False,
            },
            indent=2,
        )
        + "\n",
    )

    copy_tree(Path(args.historical), staging / "evidence/fresh/historical-final")
    copy_tree(Path(args.browser), staging / "evidence/fresh/browser-final")
    copy_tree(Path(args.canonical), staging / "evidence/fresh/canonical-final")
    final_directories = {
        Path(args.historical).resolve(),
        Path(args.browser).resolve(),
        Path(args.canonical).resolve(),
    }
    for directory in sorted((root / "test-results").glob("tasks46-47-correction-*")):
        if directory.is_dir() and directory.resolve() not in final_directories:
            copy_tree(directory, staging / "evidence/attempts" / directory.name, selected=True)
    for path in sorted(output.glob("owner-*.json")):
        copy_file(path, staging / "evidence/fresh/owner" / path.name)
    for name in [
        "project-check.log",
        "git-validation.json",
        "cleanup-final.json",
        "owner-capture-source.ts",
    ]:
        path = output / name
        if path.exists():
            copy_file(path, staging / "evidence/fresh/gates" / name)

    copy_file(ORIGINAL / "verification-result.json", staging / "evidence/reused/original/verification-result.json")
    for name in [
        "final-receipt.json",
        "implementation-report.md",
        "cleanup.json",
        "tasks46-47-combined-review-manifest.json",
    ]:
        copy_file(ORIGINAL / name, staging / "evidence/reused/original" / name)
    copy_tree(root / "test-results/tasks46-47-browser-final12", staging / "evidence/reused/original/browser-final12")
    copy_tree(root / "test-results/tasks46-47-canonical-final4", staging / "evidence/reused/original/canonical-final4")
    for name in ["accepted-launch.json", "actual-health.json", "actual-authenticated-observation.json"]:
        copy_file(TASK45 / name, staging / "evidence/reused/task45-runtime" / name)
    original_executed = root / "test-results/tasks46-47-canonical"
    for relative in [
        "copy-before.json",
        "executed-source.json",
        "deploy.log",
        "invariants69.log",
        "setup69.log",
        "executed/scripts/test-documents-fee-letters.ts.txt",
    ]:
        copy_file(original_executed / relative, staging / "evidence/reused/original/canonical-first" / relative)

    copy_file(Path(args.reviewer_zip), staging / "inputs/independent-review.zip")
    copy_file(Path(args.reviewer_manifest), staging / "inputs/independent-review-manifest.json")
    accounting = {
        "originalVerificationResult": {
            "status": "RECOVERED_UNCHANGED",
            "bytes": 483,
            "sha256": "68895b570670bc9c1edec0824fd622c3b553829d85cca3f04dc008937c638662",
        },
        "requestedOriginalOwnerBeforeAfter": "NEVER_CREATED; no retrospective replacement",
        "requestedExecutedSource66992": "NOT_PRESERVED; referenced by final browser manifest but no matching body exists",
        "freshCorrectionEvidence": "separately timestamped and labelled fresh",
        "buildDiscrepancy": "Cl3PZ1Ejw8O-lhYlVMAJP is workspace .next; PID 67728 runs accepted artifact WvgH-6nuin9o1QPJrPst4",
    }
    write(
        staging / "metadata/missing-evidence-accounting.json",
        json.dumps(accounting, indent=2) + "\n",
    )
    correction_verifier = VERIFIER.replace("candidate.patch", "correction.patch").replace(
        "['git','apply'", "['git','-c','core.autocrlf=false','apply'"
    )
    write(staging / "tools/verify-correction.py", correction_verifier)
    write(output / "verify-tasks46-47-correction.py", correction_verifier)

    inner_rows = []
    for path in sorted(item for item in staging.rglob("*") if item.is_file()):
        data = path.read_bytes()
        inner_rows.append(
            {"path": path.relative_to(staging).as_posix(), "size": len(data), "sha256": digest(data)}
        )
    write(
        staging / "metadata/inner-receipt.json",
        json.dumps(
            {
                "format": "tasks46-47-correction-inner-receipt-v1",
                "commit": commit,
                "tree": tree,
                "parent": parent,
                "membersBeforeReceipt": inner_rows,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
    )

    archive = output / "tasks46-47-correction-review.zip"
    members = []
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as target:
        for path in sorted(item for item in staging.rglob("*") if item.is_file()):
            name, data = path.relative_to(staging).as_posix(), path.read_bytes()
            assert safe(name)
            info = zipfile.ZipInfo(name, (2026, 9, 16, 0, 0, 0))
            info.compress_type, info.external_attr = zipfile.ZIP_DEFLATED, 0o100644 << 16
            target.writestr(info, data)
            members.append({"path": name, "size": len(data), "sha256": digest(data)})
    archive_bytes = archive.read_bytes()
    manifest = {
        "format": "tasks46-47-correction-envelope-v1",
        "candidate": {"commit": commit, "tree": tree, "parent": parent},
        "archive": {"name": archive.name, "size": len(archive_bytes), "sha256": digest(archive_bytes)},
        "members": members,
    }
    manifest_path = output / "tasks46-47-correction-review-manifest.json"
    write(manifest_path, json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    result = output / "tasks46-47-correction-verification-result.json"
    subprocess.run(
        [sys.executable, str(output / "verify-tasks46-47-correction.py"), str(archive), str(manifest_path), "--result", str(result)],
        check=True,
    )
    shutil.rmtree(staging)
    artifacts = [archive, manifest_path, output / "verify-tasks46-47-correction.py", result,
                 output / "tasks46-47-correction.patch", output / "tasks46-47-correction-report.md"]
    receipt = {
        "format": "tasks46-47-correction-delivery-receipt-v1",
        "candidate": {"commit": commit, "tree": tree, "parent": parent},
        "artifacts": [{"path": p.name, "size": p.stat().st_size, "sha256": digest(p.read_bytes())} for p in artifacts],
        "ownerMigrationApplied": False,
        "activated": False,
        "pushed": False,
        "tasksChecked": False,
    }
    write(output / "tasks46-47-correction-final-receipt.json", json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({"output": str(output), "commit": commit, "tree": tree, "members": len(members)}, indent=2))


if __name__ == "__main__":
    main()
