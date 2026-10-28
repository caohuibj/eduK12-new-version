"""TSEC-22 reference scoring: three mean scores over 7-point responses, complete responses only."""
DIMENSIONS = {'self_emotional_mastery': tuple(range(1, 7)),
              'professional_relationship_building': tuple(range(7, 15)),
              'professional_affairs_responsibility': tuple(range(15, 23))}

def score(answers):
    if not isinstance(answers, dict) or any(type(k) is not int or k not in range(1, 23) for k in answers):
        raise ValueError('item IDs must be integers 1..22')
    if any(v is not None and (type(v) is not int or v not in range(1, 8)) for v in answers.values()):
        raise ValueError('responses must be integers 1..7 or None')
    out = {}
    for name, ids in DIMENSIONS.items():
        vals = [answers.get(i) for i in ids]
        missing = [i for i, v in zip(ids, vals) if v is None]
        out[name] = {'answered': len(ids) - len(missing), 'required': len(ids), 'missing': missing,
                     'mean': None if missing else sum(vals) / len(ids)}
    return out
