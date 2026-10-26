#!/usr/bin/env python3
"""Read immutable Git snapshots; emit a factual source inventory, never runtime acceptance."""
import argparse
import hashlib
import json
import pathlib
import subprocess

PREFIX = "server-version/backend/src/modules/scale/instruments/"

def collect(repo, baseline, snapshot):
    def git(*args):
        return subprocess.check_output(["git", "-C", str(repo), *args])
    baseline = git("rev-parse", "--verify", baseline + "^{commit}").decode().strip()
    snapshot = git("rev-parse", "--verify", snapshot + "^{commit}").decode().strip()
    paths = git("diff", "--no-renames", "--name-only", "--diff-filter=A", "-z", baseline, snapshot, "--", PREFIX).decode().split("\0")
    records = []
    for path in sorted(p for p in paths if p.endswith("/source.json")):
        raw = git("show", snapshot + ":" + path)
        source = json.loads(raw)
        executable = source.get("executable")
        if not executable:
            continue
        d = executable["definition"]
        records.append({
            **source["identity"], "sourcePath": path,
            "sourceSha256": hashlib.sha256(raw).hexdigest(),
            "sourceBlob": git("rev-parse", snapshot + ":" + path).decode().strip(),
            "name": source["catalog"]["identity"]["canonicalName"],
            "itemCount": len(d["items"]),
            "content": {"scoringVersion": d["scoring"]["scoringVersion"], "localizationVersion": source.get("localization", {}).get("localizationVersion")},
            "parameter": {"referencePolicy": d["referencePolicy"], "referenceVersions": [r["referenceVersion"] for r in executable["references"]], "independentScoreOnlyVersion": None},
            "report": {"version": d["report"]["reportVersion"], "interpretationCount": len(d["report"]["interpretations"])},
            "releaseStatus": executable["releaseStatus"],
            "runtimeValidation": "NOT_INFERRED_FROM_SOURCE",
            "databaseState": "NOT_QUERIED", "productionAvailability": "NOT_CLAIMED",
        })
    return {
        "schemaVersion": 1, "kind": "DEVELOPMENT_BASELINE_NOT_PUBLICATION_ACCEPTANCE",
        "baseline": baseline, "snapshotHead": snapshot,
        "snapshotTree": git("rev-parse", snapshot + "^{tree}").decode().strip(),
        "countingUnit": "Added executable source versions, not independent constructs or activated tools",
        "executableSourcePackageCount": len(records),
        "toolIdentityCount": len({r["instrumentKey"] for r in records}),
        "records": records,
    }

if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--repo", required=True)
    p.add_argument("--baseline", required=True)
    p.add_argument("--snapshot", required=True)
    p.add_argument("--out", required=True)
    args = p.parse_args()
    result = collect(args.repo, args.baseline, args.snapshot)
    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"snapshotHead": result["snapshotHead"], "sourceVersions": result["executableSourcePackageCount"], "toolIdentities": result["toolIdentityCount"]}))
