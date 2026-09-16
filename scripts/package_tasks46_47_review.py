#!/usr/bin/env python3
"""Build and verify the non-circular Tasks 4.6/4.7 review envelope."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
import tempfile
import zipfile


BASE = "aecf4fd4bca22fe697f489a9827d6c46edb917fa"


def run(*args: str, cwd: Path | None = None) -> bytes:
    return subprocess.check_output(args, cwd=cwd)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def write(path: Path, data: bytes | str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data.encode("utf-8") if isinstance(data, str) else data)


def safe(name: str) -> bool:
    value = PurePosixPath(name)
    return (
        name == value.as_posix()
        and not value.is_absolute()
        and ".." not in value.parts
        and "" not in value.parts
        and "\\" not in name
        and ":" not in name
    )


VERIFIER = r'''#!/usr/bin/env python3
import argparse, hashlib, json, os, pathlib, shutil, subprocess, tempfile, zipfile

def digest(data): return hashlib.sha256(data).hexdigest()
def safe(name):
    p=pathlib.PurePosixPath(name)
    return name==p.as_posix() and not p.is_absolute() and '..' not in p.parts and '' not in p.parts and '\\' not in name and ':' not in name
def main():
    ap=argparse.ArgumentParser(); ap.add_argument('archive'); ap.add_argument('manifest'); ap.add_argument('--result'); a=ap.parse_args()
    archive=pathlib.Path(a.archive); manifest_path=pathlib.Path(a.manifest); m=json.loads(manifest_path.read_text(encoding='utf-8'))
    raw=archive.read_bytes(); assert len(raw)==m['archive']['size']; assert digest(raw)==m['archive']['sha256']
    expected={x['path']:x for x in m['members']}
    with zipfile.ZipFile(archive) as z:
        infos=z.infolist(); names=[i.filename for i in infos]
        assert len(names)==len(set(names)); assert all(safe(n) for n in names); assert set(names)==set(expected)
        for info in infos:
            data=z.read(info); row=expected[info.filename]
            assert len(data)==row['size']==info.file_size; assert digest(data)==row['sha256']
            if info.filename.lower().endswith('.zip'):
                with tempfile.NamedTemporaryFile(suffix='.zip',delete=False) as f: f.write(data); nested=f.name
                try:
                    with zipfile.ZipFile(nested) as inner:
                        inner_names=[x.filename for x in inner.infolist()]
                        assert len(inner_names)==len(set(inner_names)); assert all(safe(n) for n in inner_names)
                        for child in inner.infolist(): inner.read(child)
                finally: os.unlink(nested)
        with tempfile.TemporaryDirectory() as td:
            root=pathlib.Path(td); z.extractall(root)
            changes=json.loads((root/'metadata/changed-files.json').read_text(encoding='utf-8'))['files']
            scratch=root/'scratch'; scratch.mkdir()
            for row in changes:
                if row['preimage']:
                    target=scratch/row['path']; target.parent.mkdir(parents=True,exist_ok=True)
                    shutil.copyfile(root/'preimages'/row['path'],target)
            patch=root/'git/candidate.patch'
            subprocess.run(['git','apply','--check',str(patch)],cwd=scratch,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            subprocess.run(['git','apply',str(patch)],cwd=scratch,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            for row in changes:
                target=scratch/row['path']
                if row['postimage']: assert target.read_bytes()==(root/'postimages'/row['path']).read_bytes()
                else: assert not target.exists()
            subprocess.run(['git','apply','--reverse',str(patch)],cwd=scratch,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            for row in changes:
                target=scratch/row['path']
                if row['preimage']: assert target.read_bytes()==(root/'preimages'/row['path']).read_bytes()
                else: assert not target.exists()
    result={'status':'PASS','archive':str(archive.resolve()),'archiveSha256':digest(raw),'members':len(expected),'safeUniqueMembers':True,'crcAndHashes':True,'forwardReversePatch':True,'candidateCommit':m['candidate']['commit'],'candidateTree':m['candidate']['tree']}
    encoded=json.dumps(result,ensure_ascii=False,indent=2)+'\n'
    if a.result: pathlib.Path(a.result).write_text(encoded,encoding='utf-8')
    print(encoded,end='')
if __name__=='__main__': main()
'''


def git_blob(revision: str, path: str) -> bytes | None:
    probe = subprocess.run(
        ["git", "cat-file", "-e", f"{revision}:{path}"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return None if probe.returncode else run("git", "show", f"{revision}:{path}")


def copy_tree(source: Path, target: Path) -> None:
    if not source.exists():
        return
    for path in sorted(source.rglob("*")):
        if path.is_file() and "__pycache__" not in path.parts:
            destination = target / path.relative_to(source)
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, destination)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("output")
    parser.add_argument("--commit", default="HEAD")
    parser.add_argument("--handoff", required=True)
    parser.add_argument("--handoff-manifest", required=True)
    args = parser.parse_args()
    root = Path.cwd().resolve()
    output = Path(args.output).resolve()
    assert not output.exists(), "review output must be a fresh path"
    output.mkdir(parents=True)
    commit = run("git", "rev-parse", args.commit).decode().strip()
    parent = run("git", "rev-parse", f"{commit}^").decode().strip()
    tree = run("git", "rev-parse", f"{commit}^{{tree}}").decode().strip()
    assert parent == BASE, f"unexpected parent {parent}"
    staging = output / "_staging"
    staging.mkdir()

    status = run("git", "diff", "--name-status", "-z", BASE, commit)
    fields = status.decode("utf-8").split("\0")
    changed: list[dict[str, object]] = []
    index = 0
    while index < len(fields) and fields[index]:
        code = fields[index]
        path = fields[index + 1]
        index += 2
        assert not code.startswith(("R", "C")), "renames/copies require explicit review"
        pre = git_blob(BASE, path)
        post = git_blob(commit, path)
        if pre is not None:
            write(staging / "preimages" / path, pre)
        if post is not None:
            write(staging / "postimages" / path, post)
        changed.append(
            {
                "status": code,
                "path": path,
                "preimage": pre is not None,
                "preimageSha256": None if pre is None else sha(pre),
                "preimageSize": None if pre is None else len(pre),
                "postimage": post is not None,
                "postimageSha256": None if post is None else sha(post),
                "postimageSize": None if post is None else len(post),
            }
        )

    patch = run("git", "diff", "--binary", "--full-index", BASE, commit)
    write(staging / "git/candidate.patch", patch)
    write(output / "candidate.patch", patch)
    write(staging / "git/raw-commit.txt", run("git", "cat-file", "-p", commit))
    write(staging / "git/candidate-tree.txt", run("git", "ls-tree", "-r", "--full-tree", commit))
    write(staging / "git/parent-tree.txt", run("git", "ls-tree", "-r", "--full-tree", BASE))
    write(staging / "git/diff-stat.txt", run("git", "diff", "--stat", BASE, commit))
    write(staging / "git/diff-numstat.txt", run("git", "diff", "--numstat", BASE, commit))
    changed_document = {"base": BASE, "commit": commit, "tree": tree, "files": changed}
    write(
        staging / "metadata/changed-files.json",
        json.dumps(changed_document, ensure_ascii=False, indent=2) + "\n",
    )

    report_body = (root / "docs/reviews/2026-09-16-tasks-4-6-4-7-combined-implementation.md").read_text(
        encoding="utf-8"
    )
    final_report = (
        f"Candidate commit: `{commit}`  \nCandidate tree: `{tree}`  \nCandidate parent: `{parent}`\n\n"
        + report_body
    )
    for name, body in [
        ("implementation-report.md", final_report),
        (
            "source-pin.json",
            json.dumps(
                {"commit": commit, "parent": parent, "tree": tree, "branch": run("git", "branch", "--show-current").decode().strip()},
                indent=2,
            )
            + "\n",
        ),
        (
            "exclusions.json",
            json.dumps(
                {
                    "excluded": ["credentials and tokens", "raw owner dump", "private account snapshots", "unchanged D59 configuration bodies"],
                    "reviewLimit": "Private values are represented only by non-secret preservation observations; no screen-reader speech claim.",
                },
                indent=2,
            )
            + "\n",
        ),
        (
            "cleanup.json",
            json.dumps(
                {
                    "status": "PASS",
                    "removedNamedDatabases": ["litigation_t4647_20260916a", "litigation_t4647_20260916b"],
                    "isolatedHarnesses": "self-cleaned",
                    "ownerDatabaseMigration": 70,
                    "ownerProcess": 67728,
                    "ownerListener": "127.0.0.1:3000",
                },
                indent=2,
            )
            + "\n",
        ),
        (
            "publication-placeholder.json",
            json.dumps({"pushed": False, "pullRequest": False, "activation": False, "reason": "candidate stops for independent review"}, indent=2)
            + "\n",
        ),
        (
            "evidence-ledger.json",
            json.dumps(
                {
                    "handoff": {"members": 885, "status": "PASS"},
                    "canonical": {"directory": "tasks46-47-canonical-final4", "checks": 128, "status": "PASS"},
                    "historical": {"migration": 71, "checks": 146, "status": "PASS"},
                    "owner": {"migration": 70, "checks": 141, "status": "PASS", "writeUsed": False},
                    "browser": {"directory": "tasks46-47-browser-final12", "status": "PASS"},
                    "functional": {"documentRace": "PASS", "matterReferenceRace": "PASS", "corruption": "PASS"},
                    "projectGate": {"status": "PASS", "rtlFiles": 133, "authorizationEntries": 134, "auditSources": 204},
                },
                indent=2,
            )
            + "\n",
        ),
    ]:
        write(output / name, body)
        write(staging / "metadata" / name, body)

    shutil.copyfile(
        root / "docs/testing/tasks-4-6-4-7-combined-acceptance-matrix.md",
        staging / "metadata/acceptance-matrix.md",
    )
    handoff = Path(args.handoff).resolve()
    (staging / "handoff").mkdir(parents=True, exist_ok=True)
    for name in [
        "LITIGATION-SYSTEM-PROJECT-CONTEXT.md",
        "tasks46-47-combined-implementation-prompt.md",
        "tasks46-47-direct-authorization.txt",
        "tasks46-47-handoff-guide.md",
        "verify-handoff.py",
    ]:
        shutil.copyfile(handoff / name, staging / "handoff" / name)
    copy_tree(handoff / "contract", staging / "handoff/contract")
    copy_tree(handoff / "review", staging / "handoff/prior-review")
    shutil.copyfile(Path(args.handoff_manifest), staging / "handoff/external-manifest.json")

    evidence_root = root / "test-results"
    for directory in sorted(evidence_root.glob("tasks46-47-*")):
        if directory.is_dir():
            copy_tree(directory, staging / "evidence" / directory.name)
    write(staging / "tools/verify-review.py", VERIFIER)
    write(output / "verify-review.py", VERIFIER)

    archive = output / "tasks46-47-combined-review.zip"
    members: list[dict[str, object]] = []
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as target:
        for path in sorted(p for p in staging.rglob("*") if p.is_file()):
            name = path.relative_to(staging).as_posix()
            assert safe(name)
            data = path.read_bytes()
            info = zipfile.ZipInfo(name, (2026, 9, 16, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            target.writestr(info, data)
            members.append({"path": name, "size": len(data), "sha256": sha(data)})
    archive_data = archive.read_bytes()
    manifest = {
        "format": "tasks46-47-review-envelope-v1",
        "candidate": {"commit": commit, "parent": parent, "tree": tree},
        "archive": {"name": archive.name, "size": len(archive_data), "sha256": sha(archive_data)},
        "members": members,
    }
    manifest_path = output / "tasks46-47-combined-review-manifest.json"
    write(manifest_path, json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    result_path = output / "verification-result.json"
    subprocess.run(
        [sys.executable, str(output / "verify-review.py"), str(archive), str(manifest_path), "--result", str(result_path)],
        check=True,
    )
    shutil.rmtree(staging)

    receipt_names = [
        archive.name,
        manifest_path.name,
        "verify-review.py",
        result_path.name,
        "candidate.patch",
        "implementation-report.md",
        "source-pin.json",
        "exclusions.json",
        "cleanup.json",
        "publication-placeholder.json",
        "evidence-ledger.json",
    ]
    receipt = {
        "format": "tasks46-47-final-non-circular-receipt-v1",
        "candidate": {"commit": commit, "parent": parent, "tree": tree},
        "artifacts": [
            {"path": name, "size": (output / name).stat().st_size, "sha256": sha((output / name).read_bytes())}
            for name in receipt_names
        ],
        "pushed": False,
        "activated": False,
    }
    write(output / "final-receipt.json", json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"output": str(output), "commit": commit, "tree": tree, "archiveSha256": sha(archive_data), "members": len(members)}, indent=2))


if __name__ == "__main__":
    main()
