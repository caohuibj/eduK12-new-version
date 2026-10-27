"""DSECS-R2 complete-case example. Missing-data policy is product-specific."""
from __future__ import annotations

DIMENSIONS = {
    "responsible_decision_making": (1, 6, 11, 16),
    "social_awareness": (2, 7, 12, 17),
    "self_management": (3, 8, 13, 18),
    "relationship_skills": (4, 9, 14, 19),
    "self_awareness": (5, 10, 15, 20),
}


def score(answers):
    """Accept mapping integer item IDs 1..20 to integers 1..4 or None."""
    if not isinstance(answers, dict) or any(type(k) is not int or k not in range(1, 21) for k in answers):
        raise ValueError("item IDs must be integers 1..20")
    if any(v is not None and (type(v) is not int or v not in range(1, 5)) for v in answers.values()):
        raise ValueError("responses must be integers 1..4 or None")
    def result(ids):
        values = [answers.get(i) for i in ids]
        missing = [i for i, value in zip(ids, values) if value is None]
        return {"answered": len(ids) - len(missing), "required": len(ids), "missing": missing,
                "sum": None if missing else sum(values),
                "mean": None if missing else sum(values) / len(values)}
    return {"dimensions": {name: result(ids) for name, ids in DIMENSIONS.items()},
            "total": result(tuple(range(1, 21)))}
