#!/usr/bin/env python3
"""SAS-SV — official scoring reference.

Source: Kwon M, Kim DJ, Cho H, Yang S. (2013). The Smartphone Addiction Scale:
Development and Validation of a Short Version for Adolescents. PLoS ONE 8(12):e83558.
Items verbatim from author-supplied Appendix S1 (CC BY).
Official scoring: sum of the 10 items on the 6-point scale (1-6); total 10-60.
No reverse-scored items, no subscales (the short form is scored as a single total).
Author ROC cut-offs (boys 31, girls 33) are recorded for provenance only and are
NOT applied as report bands or levels.

Missing answers: complete_required — a missing item makes the official total
undefined; returned as None rather than prorated or filled with 0.
"""

ITEMS = [f"SASSV-{i:02d}" for i in range(1, 11)]
RESPONSE_VALUES = {str(v): float(v) for v in range(1, 7)}

# Author ROC cut-offs (Korean middle-school sample N=540; boys AUC .963, girls .947).
# Recorded for provenance; not used by the report.
AUTHOR_CUTOFFS = {"boys": 31, "girls": 33}


def score(answers):
    missing = [c for c in ITEMS if c not in answers]
    if missing:
        return {
            "quality": "invalid",
            "scores": {"smartphone_addiction_risk": None},
            "missing": missing,
            "note": "complete_required: 官方计分为 10 题总和，缺题不补 0、不按比例折算。",
        }
    total = sum(RESPONSE_VALUES[str(answers[c])] for c in ITEMS)
    return {
        "quality": "interpretable",
        "scores": {"smartphone_addiction_risk": total},
        "range": (10, 60),
    }


if __name__ == "__main__":
    golden = [
        ("minimum-keyed", {c: "1" for c in ITEMS}, "interpretable", 10),
        ("maximum-keyed", {c: "6" for c in ITEMS}, "interpretable", 60),
        ("sample-mixed", dict(zip(ITEMS, ["4", "4", "2", "3", "3", "5", "2", "4", "5", "4"])), "interpretable", 36),
        ("missing-item", {c: v for c, v in zip(ITEMS, ["4", "4", "2", "3", "3", "5", "2", "4", "5"])}, "invalid", None),
    ]
    for name, answers, want_quality, want_score in golden:
        got = score(answers)
        gs = got["scores"]["smartphone_addiction_risk"]
        ok = got["quality"] == want_quality and gs == want_score
        print(f"{name}: quality={got['quality']} score={gs} {'PASS' if ok else 'FAIL'}")
        assert ok, (name, got)
    print("all golden cases PASS")
