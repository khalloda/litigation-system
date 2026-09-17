#!/usr/bin/env python3
"""Build the independently verifiable Tasks 4.6/4.7 R4/R6 correction envelope."""

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


PARENT = "0623d7cefebc5f3da1ee947c6f28dfc03b54dab0"
REPORT = Path("docs/reviews/2026-09-17-tasks-4-6-4-7-r4-r6-correction.md")


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


def copy_file(source: Path, target: Path) -> None:
    assert source.is_file(), f"missing required file: {source}"
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)


def copy_tree(source: Path, target: Path) -> None:
    assert source.is_dir(), f"missing required evidence directory: {source}"
    for path in sorted(source.rglob("*")):
        if path.is_file() and "__pycache__" not in path.parts:
            destination = target / path.relative_to(source)
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, destination)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("output")
    parser.add_argument("--evidence", required=True)
    parser.add_argument("--reviewer-zip", required=True)
    parser.add_argument("--reviewer-manifest", required=True)
    args = parser.parse_args()

    root = Path.cwd().resolve()
    output = Path(args.output).resolve()
    evidence = Path(args.evidence).resolve()
    assert not output.exists(), "delivery output must be a new directory"
    output.mkdir(parents=True)
    staging = output / "_staging"
    staging.mkdir()

    commit = run("git", "rev-parse", "HEAD").decode().strip()
    parent = run("git", "rev-parse", "HEAD^").decode().strip()
    tree = run("git", "rev-parse", "HEAD^{tree}").decode().strip()
    assert parent == PARENT, f"unexpected parent {parent}"
    assert not run("git", "status", "--porcelain"), "working tree must be clean"

    fields = run("git", "diff", "--name-status", "-z", PARENT, commit).decode().split("\0")
    changed: list[dict[str, object]] = []
    index = 0
    while index < len(fields) and fields[index]:
        state, path = fields[index], fields[index + 1]
        index += 2
        assert not state.startswith(("R", "C")), "renames require explicit packaging"
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
    write(output / "tasks46-47-r4-r6-correction.patch", patch)
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
    report = (
        f"Correction commit: `{commit}`  \nCorrection tree: `{tree}`  \n"
        f"Sole parent: `{parent}`\n\n" + REPORT.read_text(encoding="utf-8")
    )
    write(staging / "metadata/correction-report.md", report)
    write(output / "tasks46-47-r4-r6-correction-report.md", report)
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
    write(
        staging / "metadata/evidence-classification.json",
        json.dumps(
            {
                "fresh": "All records under evidence/fresh retain their actual timestamps and failed attempts.",
                "reused": "Attached independent-review packages and unchanged earlier evidence are retained as inputs, not fresh execution.",
                "neverExisted": "The original owner before/after pair never existed.",
                "notPreserved": "No source body with SHA-256 66992ab0eff4144b4586d5321ecfd2649f6630e41dee591b8ac4733b4d186a87 exists.",
                "ownerBuild": "WvgH-6nuin9o1QPJrPst4",
                "workspaceBuild": "Cl3PZ1Ejw8O-lhYlVMAJP",
            },
            indent=2,
        )
        + "\n",
    )

    copy_tree(evidence, staging / "evidence/fresh")
    copy_file(Path(args.reviewer_zip), staging / "inputs/current-independent-review.zip")
    copy_file(
        Path(args.reviewer_manifest),
        staging / "inputs/current-independent-review-manifest.json",
    )
    downloads = Path.home() / "Downloads"
    for name in [
        "tasks46-47-f8751a0-independent-review.zip",
        "tasks46-47-f8751a0-independent-review-manifest.json",
        "tasks46-47-combined-implementation-handoff.zip",
        "tasks46-47-combined-implementation-handoff-manifest.json",
    ]:
        source = downloads / name
        if source.is_file():
            copy_file(source, staging / "inputs/prior" / name)

    verifier = VERIFIER.replace("candidate.patch", "correction.patch").replace(
        "['git','apply'", "['git','-c','core.autocrlf=false','apply'"
    )
    verifier_name = "verify-tasks46-47-r4-r6-correction.py"
    write(staging / "tools" / verifier_name, verifier)
    write(output / verifier_name, verifier)

    receipt_rows = []
    for path in sorted(item for item in staging.rglob("*") if item.is_file()):
        data = path.read_bytes()
        receipt_rows.append(
            {"path": path.relative_to(staging).as_posix(), "size": len(data), "sha256": digest(data)}
        )
    write(
        staging / "metadata/inner-receipt.json",
        json.dumps(
            {
                "format": "tasks46-47-r4-r6-inner-receipt-v1",
                "commit": commit,
                "tree": tree,
                "parent": parent,
                "membersBeforeReceipt": receipt_rows,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
    )

    archive = output / "tasks46-47-r4-r6-correction-review.zip"
    members = []
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as target:
        for path in sorted(item for item in staging.rglob("*") if item.is_file()):
            name, data = path.relative_to(staging).as_posix(), path.read_bytes()
            assert safe(name)
            info = zipfile.ZipInfo(name, (2026, 9, 17, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            target.writestr(info, data)
            members.append({"path": name, "size": len(data), "sha256": digest(data)})

    archive_data = archive.read_bytes()
    manifest = {
        "format": "tasks46-47-r4-r6-correction-envelope-v1",
        "candidate": {"commit": commit, "tree": tree, "parent": parent},
        "archive": {"name": archive.name, "size": len(archive_data), "sha256": digest(archive_data)},
        "members": members,
    }
    manifest_path = output / "tasks46-47-r4-r6-correction-review-manifest.json"
    write(manifest_path, json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    result = output / "tasks46-47-r4-r6-correction-verification-result.json"
    subprocess.run(
        [sys.executable, str(output / verifier_name), str(archive), str(manifest_path), "--result", str(result)],
        check=True,
    )
    shutil.rmtree(staging)

    artifacts = [
        archive,
        manifest_path,
        output / verifier_name,
        result,
        output / "tasks46-47-r4-r6-correction.patch",
        output / "tasks46-47-r4-r6-correction-report.md",
    ]
    receipt = {
        "format": "tasks46-47-r4-r6-correction-delivery-receipt-v1",
        "candidate": {"commit": commit, "tree": tree, "parent": parent},
        "artifacts": [
            {"path": path.name, "size": path.stat().st_size, "sha256": digest(path.read_bytes())}
            for path in artifacts
        ],
        "ownerMigrationApplied": False,
        "activated": False,
        "pushed": False,
        "tasksChecked": False,
    }
    write(
        output / "tasks46-47-r4-r6-correction-final-receipt.json",
        json.dumps(receipt, indent=2) + "\n",
    )
    print(json.dumps({"output": str(output), "commit": commit, "tree": tree, "members": len(members)}, indent=2))


if __name__ == "__main__":
    main()
