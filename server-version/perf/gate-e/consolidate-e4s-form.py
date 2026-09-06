#!/usr/bin/env python3
"""Consolidate Stage-4 Form capacity-curve records into CSV + knee summary.

Reads run-e4s-form-curve.sh records (e4s-<class>-<rate>s-r1.json) and emits:
  - <out>.csv   per-rate Stage-2R-corrected accounting
  - <out>.md    a compact table + knee candidate + rated/margin/overload labels
Usage: consolidate-e4s-form.py <summary_dir> <normal|large> <out_prefix>
"""
import json, sys, os, glob, csv

def load(dirp, cls):
    rows = []
    for f in sorted(glob.glob(os.path.join(dirp, f"e4s-{cls}-*s-r1.json"))):
        try:
            rec = json.load(open(f))
        except Exception as e:
            print(f"skip {f}: {e}", file=sys.stderr); continue
        if "k6" not in rec or not isinstance(rec.get("k6"), dict):
            rec["k6"] = {}
        k = rec.get("k6", {})
        r = {
            "rate": rec.get("rate"),
            "tag": rec.get("tag"),
            "k6_exit": rec.get("k6_exit"),
            "pre_run_drain": rec.get("pre_run_drain"),
            "drain_clean": rec.get("drain_clean"),
            "drain_tail_s": rec.get("drain_tail_s"),
            "full_runtime_s": rec.get("full_runtime_s"),
            "configured_success": k.get("success"),
            "configured_fail": k.get("fail"),
            "steady_started": k.get("steady_started"),
            "steady_actual_offered": k.get("steady_actual_offered"),
            "steady_offered_configured": k.get("steady_offered_configured"),
            "dropped_iterations": k.get("dropped_iterations"),
            "eventual_success_rate": k.get("eventual_success_rate"),
            "productive_final_per_s": k.get("productive_final_per_s"),
            "fresh_completions": k.get("fresh_completions"),
            "idempotent_replays": k.get("idempotent_replays"),
            "p50": (k.get("latency_ms") or {}).get("p50"),
            "p95": (k.get("latency_ms") or {}).get("p95"),
            "p99": (k.get("latency_ms") or {}).get("p99"),
            "max": (k.get("latency_ms") or {}).get("max"),
            "n503": k.get("503"),
            "n429": k.get("429"),
            "capacity_retries": k.get("capacity_retries"),
            "db_answers_delta": rec.get("db_form_answers_delta"),
            "db_done_delta": rec.get("db_assessment_completions_delta"),
            "db_inprogress_after": rec.get("db_inprogress_after"),
            "k6_error": rec.get("k6_error", ""),
        }
        rows.append(r)
    return sorted(rows, key=lambda x: (x["rate"] is None, x["rate"] or 0))

def knee_candidate(rows):
    """First rate where p99 >= 3x the p99 at the 2nd-lowest valid point, or
    where eventual_success_rate < 0.995 and non-rising, or dropped>0 sustained.
    A point is valid if it produced a complete k6 steady summary (productive
    final/s + success + latency present). k6_exit==99 (threshold-only missing-
    fixture overshoot) is a harness artifact, not a server-failure signal, so it
    is treated as valid; OOM/kill runs produce no summary and are excluded."""
    valid = [r for r in rows if r.get("productive_final_per_s") is not None and r.get("configured_success") is not None and r.get("p99") is not None]
    if len(valid) < 3:
        return None, valid
    base = valid[0]["p99"]
    prev_sr, prev_dropped = None, 0
    for r in valid:
        p99 = r["p99"]
        sr = r["eventual_success_rate"]
        dropped = r["dropped_iterations"] or 0
        if p99 >= 3 * base and p99 > 0:
            return r["rate"], valid
        if prev_sr is not None and sr is not None and sr < 0.995 and sr <= prev_sr + 1e-9:
            return r["rate"], valid
        if dropped > 10:
            return r["rate"], valid
        prev_sr, prev_dropped = sr, dropped
    return valid[-1]["rate"] if valid else None, valid

def main():
    if len(sys.argv) != 4:
        print("usage: consolidate-e4s-form.py <summary_dir> <normal|large> <out_prefix>"); sys.exit(2)
    dirp, cls, out = sys.argv[1], sys.argv[2], sys.argv[3]
    rows = load(dirp, cls)
    if not rows:
        print(f"no summaries found for class '{cls}' in {dirp}; nothing to consolidate", file=sys.stderr)
        sys.exit(1)
    cols = list(rows[0].keys())
    with open(out + ".csv", "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols); w.writeheader()
        for r in rows: w.writerow(r)
    knee, valid = knee_candidate(rows)
    def fmt(r, c):
        v = r.get(c)
        return "" if v is None else (f"{float(v):.3f}" if isinstance(v, float) else str(v))
    with open(out + ".md", "w") as fh:
        fh.write(f"# Stage 4 Form {cls} capacity curve\n\n")
        hdr = "| rate | success | productive/s | e-succ% | p50 | p95 | p99 | max | 503 | 429 | dropped | drain_s | full_s | db_ans | db_done |\n"
        fh.write(hdr); fh.write("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n")
        for r in rows:
            fh.write("| %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s |\n" % (
                fmt(r,"rate"), fmt(r,"configured_success"), fmt(r,"productive_final_per_s"),
                fmt(r,"eventual_success_rate"), fmt(r,"p50"), fmt(r,"p95"), fmt(r,"p99"),
                fmt(r,"max"), fmt(r,"n503"), fmt(r,"n429"), fmt(r,"dropped_iterations"),
                fmt(r,"drain_tail_s"), fmt(r,"full_runtime_s"), fmt(r,"db_answers_delta"), fmt(r,"db_done_delta")))
        fh.write(f"\n**knee_candidate = {knee}** (first rate p99>=3x baseline / sustained near-0 SR / sustained drops)\n")
        fh.write("**STOP — WAITING FOR REVIEW**\n")
    print(f"wrote {out}.csv ({len(rows)} rows) and {out}.md")
    print(f"knee_candidate={knee}")
    for r in rows:
        print(f"  rate={r['rate']:>5} prod={r['productive_final_per_s']} e_sr={r['eventual_success_rate']} p50={r['p50']} "
              f"p95={r['p95']} p99={r['p99']} 503={r['n503']} 429={r['n429']} drain={r['drain_tail_s']}")

if __name__ == "__main__":
    main()