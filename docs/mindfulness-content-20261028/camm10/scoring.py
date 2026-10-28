DIMENSIONS={'mindful_awareness':(1,2,3,4,5,6,7,8,9,10)}
REVERSE=frozenset((1,2,3,4,5,6,7,8,9,10))
def score(answers):
    if not isinstance(answers,dict) or any(type(k) is not int or k not in range(1,11) for k in answers):raise ValueError('item ID must be integer 1..10')
    if any(v is not None and (type(v) is not int or v not in range(0,5)) for v in answers.values()):raise ValueError('response must be integer 0..4 or None')
    def one(ids):
        missing=[i for i in ids if answers.get(i) is None]
        vals=[4-answers[i] if i in REVERSE else answers[i] for i in ids if answers.get(i) is not None]
        return {'answered':len(vals),'required':len(ids),'missing':missing,'sum':None if missing else sum(vals),'mean':None if missing else sum(vals)/len(ids)}
    return {'dimensions':{k:one(v) for k,v in DIMENSIONS.items()}}
