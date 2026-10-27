"""ERQ-CA scoring reference: separate complete-case strategies."""
DIMENSIONS = {'cognitive_reappraisal': (1,3,5,7,8,10), 'expressive_suppression': (2,4,6,9)}

def score(answers):
    if not isinstance(answers, dict) or any(type(k) is not int or k not in range(1,11) for k in answers):
        raise ValueError('item IDs must be integers 1..10')
    if any(v is not None and (type(v) is not int or v not in range(1,6)) for v in answers.values()):
        raise ValueError('responses must be integers 1..5 or None')
    def one(ids):
        values = [answers.get(i) for i in ids]
        missing = [i for i, value in zip(ids, values) if value is None]
        return {'answered': len(ids)-len(missing), 'required': len(ids), 'missing': missing,
                'sum': None if missing else sum(values), 'mean': None if missing else sum(values)/len(values)}
    return {name: one(ids) for name, ids in DIMENSIONS.items()}
