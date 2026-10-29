#!/usr/bin/env python3
"""IGDS9-SF — official scoring reference.

Source: Pontes HM, Griffiths MD. (2015). Measuring DSM-5 internet gaming
disorder: Development and validation of a short psychometric scale.
Computers in Human Behavior 45:137-143. Items and instruction verbatim from the
author-deposited accepted manuscript (Birkbeck eprints 43473).
Official scoring: five-point Likert 1 (Never) to 5 (Very Often); total = sum of
the nine items, range 9-45. No reverse-scored items, no subscales.
No author cut-off archived; the report does not apply thresholds.

Missing answers: complete_required — a missing item makes the official total
undefined; returned as None rather than prorated or filled with 0.
"""

ITEMS = [f"IGDS9-{i:02d}" for i in range(1, 10)]
RESPONSE_VALUES = {str(v): float(v) for v in range(1, 6)}


def score(answers):
    missing = [c for c in ITEMS if c not in answers]
    if missing:
        return {
            "quality": "invalid",
            "scores": {"igd_disordered_gaming": None},
            "missing": missing,
            "note": "complete_required: 官方计分为 9 题总和，缺题不补 0、不按比例折算。",
        }
    total = sum(RESPONSE_VALUES[str(answers[c])] for c in ITEMS)
    return {
        "quality": "interpretable",
        "scores": {"igd_disordered_gaming": total},
        "range": (9, 45),
    }


if __name__ == "__main__":
    golden = [
        ("minimum-keyed", {c: "1" for c in ITEMS}, "interpretable", 9),
        ("maximum-keyed", {c: "5" for c in ITEMS}, "interpretable", 45),
        ("sample-mixed", dict(zip(ITEMS, ["4", "3", "4", "2", "2", "3", "1", "4", "2"])), "interpretable", 25),
        ("missing-item", {c: v for c, v in zip(ITEMS, ["4", "3", "4", "2", "2", "3", "1", "4"])}, "invalid", None),
    ]
    for name, answers, want_quality, want_score in golden:
        got = score(answers)
        gs = got["scores"]["igd_disordered_gaming"]
        ok = got["quality"] == want_quality and gs == want_score
        print(f"{name}: quality={got['quality']} score={gs} {'PASS' if ok else 'FAIL'}")
        assert ok, (name, got)
    print("all golden cases PASS")
