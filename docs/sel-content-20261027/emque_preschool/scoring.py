"""EmQue parent-report reference scoring for the 20-item original and the 13-item short form."""
D20 = {'emotional_contagion': (1, 4, 7, 10, 13, 16, 19),
       'attention_to_others_feelings': (3, 6, 9, 12, 15, 18, 20),
       'prosocial_actions': (2, 5, 8, 11, 14, 17)}
D13 = {'emotional_contagion': (4, 7, 10, 13),
       'attention_to_others_feelings': (3, 6, 9, 12, 15),
       'prosocial_actions': (5, 8, 14, 17)}

def _score(answers, dims, top):
    if any(type(k) is not int or k not in range(1, 21) for k in answers):
        raise ValueError('item IDs must be integers 1..20')
    if any(v is not None and (type(v) is not int or v not in range(0, top + 1)) for v in answers.values()):
        raise ValueError(f'responses must be integers 0..{top} or None')
    out = {}
    for name, ids in dims.items():
        vals = [answers.get(i) for i in ids]
        missing = [i for i, v in zip(ids, vals) if v is None]
        out[name] = {'answered': len(ids) - len(missing), 'required': len(ids), 'missing': missing,
                     'mean': None if missing else sum(vals) / len(ids)}
    return out

def score20(answers):
    return _score(answers, D20, 2)

def score13(answers):
    return _score(answers, D13, 2)
