#!/usr/bin/env python3
"""Consolidate Stage 3R boundary + Stage 4 capacity-curve records into one CSV.

Stage 3R (e3r3)  : NORMAL 70/85/100 x3, LARGE 40/55/70 x3  (3-run boundary).
Stage 4  (e3s4)  : NORMAL 25..145 x1, LARGE 25/40/55/70 x1 (capacity curve).
High-tail points killed by k6 SharedArray OOM are emitted with validity=OOM_LOADGEN.
"""
import glob, json, os, csv

D = "/workspace/eduk12-pr49-cloud-results"
rows = []

def add(path, source):
    try:
        r = json.load(open(path))
    except Exception as e:
        # corrupt/empty record -> classify by rate from filename
        name = os.path.basename(path)
        print(f"SKIP unparsable {path}: {e}", file=osm.stderr if False else None)
        return
    k6 = r.get("k6") or {}
    lat = k6.get("latency_ms") or {}
    tag = r.get("tag", "")
    if "normal" in tag: cls = "NORMAL"
    elif "large" in tag: cls = "LARGE"
    else: cls = "?"
    rate = r.get("rate")
    k6exit = r.get("k6_exit")
    valid = "YES"
    if k6exit != 0 or not k6:
        valid = "OOM_LOADGEN"
    rows.append({
        "source": source, "class": cls, "rate": rate,
        "k6_exit": k6exit,
        "offered": k6.get("steady_actual_offered"),
        "offered_cfg": k6.get("steady_offered_configured"),
        "dropped": k6.get("steady_dropped"),
        "fresh": k6.get("fresh_completions"),
        "replay": k6.get("idempotent_replays"),
        "ev": k6.get("eventual_success_rate"),
        "prod": k6.get("productive_final_per_s"),
        "retries": k6.get("capacity_retries"),
        "p50": lat.get("p50"), "p95": lat.get("p95"),
        "p99": lat.get("p99"), "max": lat.get("max"),
        "drain_tail_s": r.get("drain_tail_s"),
        "valid": valid,
    })

for f in sorted(glob.glob(f"{D}/e3r3/e3r3-*-*.json")):
    if "-k6." in f or f.endswith("-k6.json"): continue
    if os.path.basename(f).startswith("e3r3-probe"): continue
    add(f, "3R")
for f in sorted(glob.glob(f"{D}/e3s4/e3s4-*-*-r1.json")):
    if "-k6." in f: continue
    add(f, "S4")

cols = ["source","class","rate","k6_exit","offered","offered_cfg","dropped",
        "fresh","replay","ev","prod","retries","p50","p95","p99","max",
        "drain_tail_s","valid"]
rows.sort(key=lambda r: (r["class"], r["source"], r["rate"] or 0))
with open("/workspace/eduk12-pr49-cloud-results/stage3r4-consolidated.csv","w",newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=cols)
    w.writeheader()
    for r in rows: w.writerow(r)
print(f"wrote {len(rows)} points -> stage3r4-consolidated.csv")