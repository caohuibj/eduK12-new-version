#!/usr/bin/env python3
"""Westside Test Anxiety Scale — official scoring reference.

Source: Driscoll, R. (2007). Westside Test Anxiety Scale Validation (ERIC ED495968), Appendix A.
Official scoring: sum of the 10 items, divided by 10 (mean, 1.0-5.0). No reverse-scored items.
The appendix states the scale combines six impairment and four worry items but does NOT give
a per-item factor key, so only the official total is computed here.

Missing answers: complete_required (a missing item makes the official mean undefined);
the score is returned as None rather than prorated or filled with 0.
"""


ITEMS = [f"WTS-{i:02d}" for i in range(1, 11)]
RESPONSE_VALUES = {"1": 1.0, "2": 2.0, "3": 3.0, "4": 4.0, "5": 5.0}


def score(answers):
    """answers: dict itemCode -> responseValue ('1'..'5').

    Returns dict with quality and the official test anxiety mean score.
    """
    missing = [code for code in ITEMS if code not in answers]
    if missing:
        return {
            "quality": "invalid",
            "scores": {"test_anxiety_impairment": None},
            "missing": missing,
            "note": "complete_required: 官方计分要求 10 题齐全，缺题不补 0、不按比例折算。",
        }
    total = sum(RESPONSE_VALUES[str(answers[code])] for code in ITEMS)
    mean = total / 10.0
    mean = round(mean + 0.0, 10)  # stable float; display precision is 2
    return {
        "quality": "interpretable",
        "scores": {"test_anxiety_impairment": mean},
        "total": total,
    }


# Author's descriptive ranges (source: official scale sheet, US college + grade 5 samples).
# Recorded for provenance only; the report does not apply them as individual levels.
AUTHOR_RANGES = [
    ("1.0—1.9", "Comfortably low test anxiety"),
    ("2.0—2.5", "Normal or average test anxiety"),
    ("2.5—2.9", "High normal test anxiety"),
    ("3.0—3.4", "Moderately high (some items rated 4=high)"),
    ("3.5—3.9", "High test anxiety (half or more of the items rated 4=high)"),
    ("4.0—5.0", "Extremely high anxiety (items rated 4=high and 5=extreme)"),
]


if __name__ == "__main__":
    golden = [
        ("maximum-keyed", {c: "5" for c in ITEMS}, "interpretable", 5),
        ("minimum-keyed", {c: "1" for c in ITEMS}, "interpretable", 1),
        ("sample-graded", dict(zip(ITEMS, ["5", "4", "3", "2", "1", "5", "4", "3", "2", "1"])), "interpretable", 3),
        ("missing-item", {c: v for c, v in zip(ITEMS, ["4", "3", "2", "2", "1", "5", "4", "3", "2"])}, "invalid", None),
    ]
    for name, answers, want_quality, want_score in golden:
        got = score(answers)
        got_score = got["scores"]["test_anxiety_impairment"]
        ok = got["quality"] == want_quality and got_score == want_score
        print(f"{name}: quality={got['quality']} score={got_score} {'PASS' if ok else 'FAIL'}")
        assert ok, (name, got)
    print("all golden cases PASS")
