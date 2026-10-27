"""ERICA 16 scoring, complete response sets only; input uses original item numbers."""
DIMENSIONS = {'emotional_control': (5,7,9,10,12,14,16), 'emotional_self_awareness': (1,3,4,11,13), 'situational_responsiveness': (2,6,8,15)}
REVERSE = frozenset((5,7,8,9,10,11,12,13,14,16))

def score(answers):
    if not isinstance(answers, dict) or any(type(k) is not int or k not in range(1,17) for k in answers):
        raise ValueError('item IDs must be integers 1..16')
    if any(v is not None and (type(v) is not int or v not in range(1,6)) for v in answers.values()):
        raise ValueError('responses must be integers 1..5 or None')
    def one(ids):
        missing = [i for i in ids if answers.get(i) is None]
        vals = [6-answers[i] if i in REVERSE else answers[i] for i in ids if answers.get(i) is not None]
        return {'answered':len(vals), 'required':len(ids), 'missing':missing,
                'sum':None if missing else sum(vals), 'mean':None if missing else sum(vals)/len(ids)}
    return {'dimensions':{k:one(v) for k,v in DIMENSIONS.items()}, 'total':one(tuple(range(1,17)))}
