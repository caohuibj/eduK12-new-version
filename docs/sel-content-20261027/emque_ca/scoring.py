"""EmQue-CA reference scoring: three mean scores, complete responses only."""
DIMENSIONS = {'affective_empathy': (1, 2, 3, 4, 5, 6),
              'cognitive_empathy': (7, 8, 9),
              'intention_to_comfort': (10, 11, 12, 13, 14)}

def score(answers):
    if not isinstance(answers, dict) or any(type(k) is not int or k not in range(1, 15) for k in answers):
        raise ValueError('item IDs must be integers 1..14')
    if any(v is not None and (type(v) is not int or v not in range(1, 4)) for v in answers.values()):
        raise ValueError('responses must be integers 1..3 or None')
    out = {}
    for name, ids in DIMENSIONS.items():
        vals = [answers.get(i) for i in ids]
        missing = [i for i, v in zip(ids, vals) if v is None]
        out[name] = {'answered': len(ids) - len(missing), 'required': len(ids), 'missing': missing,
                     'mean': None if missing else sum(vals) / len(ids)}
    return out
