DIMENSIONS={'pmdc':(7,10,14,20,26),'nsne':(2,3,9,21,23,24,28),'lse':(17,18),'helplessness':(29,30)}
REVERSE=frozenset()
def score(answers):
    if not isinstance(answers,dict) or any(type(k) is not int or k not in range(1,31) for k in answers):raise ValueError('item ID must be integer 1..30')
    if any(v is not None and (type(v) is not int or v not in range(1,6)) for v in answers.values()):raise ValueError('response must be integer 1..5 or None')
    def one(ids):
        missing=[i for i in ids if answers.get(i) is None]
        vals=[answers[i] for i in ids if answers.get(i) is not None]
        return {'answered':len(vals),'required':len(ids),'missing':missing,'sum':None if missing else sum(vals),'mean':None if missing else sum(vals)/len(ids)}
    return {'dimensions':{k:one(v) for k,v in DIMENSIONS.items()},'total':one(tuple(range(1,31)))}
