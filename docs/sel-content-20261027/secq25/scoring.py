"""SECQ-25 source-code mapping and explicit conservative display convention."""

DIMENSIONS = {
    "self_awareness": ("SA1", "SA2", "SA3", "SA4", "SA5"),
    "social_awareness": ("SoA1", "SoA2", "SoA3", "SoA4", "SoA5"),
    "self_management": ("SM1", "SM2", "SM3", "SM4", "SM5"),
    "relationship_management": ("RM1", "RM2", "RM3", "RM4", "RM5"),
    "responsible_decision_making": ("RDM1", "RDM2", "RDM3", "RDM4", "RDM5"),
}


def score(answers):
    """Return complete-dimension means; null/absent means incomplete, not zero."""
    ids = {item for items in DIMENSIONS.values() for item in items}
    if set(answers) - ids:
        raise ValueError("unknown item")
    for answer in answers.values():
        if answer is not None and (type(answer) is not int or not 1 <= answer <= 6):
            raise ValueError("answers must be integers from 1 through 6, or null")
    result = {}
    for dimension, items in DIMENSIONS.items():
        values = [answers.get(item) for item in items]
        result[dimension] = None if None in values else sum(values) / len(items)
    return result
