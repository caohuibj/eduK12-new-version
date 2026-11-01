#!/usr/bin/env python3
"""Build the authenticated read fixture from created sessions; no credential values printed.
Usage: build_fixture.py <sessions_dir> <out_path> <mode: both|catalog> <expected_count>
"""
import glob, hashlib, json, pathlib, sys

sessions_dir = pathlib.Path(sys.argv[1])
out_path = pathlib.Path(sys.argv[2])
mode = sys.argv[3] if len(sys.argv) > 3 else "both"
expected = int(sys.argv[4]) if len(sys.argv) > 4 else 10
TARGET_SHA = "d7d43535c8eac445918ae113a43b1cc04032d310"
RUN_ID = "authread-20261101-v2"

files = sorted(glob.glob(str(sessions_dir / "student-*" / "session.private.json")),
               key=lambda p: int(pathlib.Path(p).parent.name.split("-")[1]))
assert len(files) == expected, "need exactly %d sessions, got %d" % (expected, len(files))
cookies = set()
readers = []
for f in files:
    s = json.loads(pathlib.Path(f).read_text())
    assert s["role"] == "STUDENT" and s["portal"] == "training" and s["cookie"] and s["csrf"]
    assert s["cookie"] not in cookies, "DUPLICATE_SESSION"
    cookies.add(s["cookie"])
    requests = [
        {"action": "catalog", "path": "/api/courses/my?pageSize=20", "checks": [
            {"path": ["list"], "exists": True},
            {"path": ["list", 0, "id"], "exists": True}]},
    ]
    if mode == "both":
        requests.append({"action": "available", "path": "/api/composite-assessments/available",
                         "checks": [{"path": ["list"], "length": 0}]})
    else:
        requests.append({"action": "catalog-paged", "path": "/api/courses/my?pageSize=5", "checks": [
            {"path": ["list"], "exists": True}]})
    readers.append({"synthetic": True, "userId": s["id"],
                    "session": {"cookie": s["cookie"], "csrf": s["csrf"]},
                    "requests": requests})

fixture = {
    "syntheticOnly": True,
    "targetSha": TARGET_SHA,
    "runId": RUN_ID,
    "provenance": ("authread ladder 2026-11-01 v2; 50 synthetic student sessions created on production via "
                   "stdlib normal login (no MFA, 3 requests each); credentials never left production; "
                   "accounts verified extended (expires 2026-11-02T09:42:01Z), active and unfrozen in DB; "
                   "available endpoint verified empty for probed readers"),
    "origin": "https://training.eduk12.top",
    "reportDeadlineSeconds": 120,
    "readers": readers,
    "records": [],
}
data = json.dumps(fixture, indent=2, sort_keys=True)
out_path.write_text(data)
out_path.chmod(0o600)
print(json.dumps({"readers": len(readers), "mode": mode, "runId": RUN_ID,
                  "sha256": hashlib.sha256(data.encode()).hexdigest()}))
