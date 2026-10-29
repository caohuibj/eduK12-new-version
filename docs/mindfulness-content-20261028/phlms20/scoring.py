DIMENSIONS={'awareness':(1,3,5,7,9,11,13,15,17,19),'acceptance':(2,4,6,8,10,12,14,16,18,20)}
REVERSE=frozenset((2,4,6,8,10,12,14,16,18,20))
def score(answers):
    if not isinstance(answers,dict) or any(type(k) is not int or k not in range(1,21) for k in answers):raise ValueError('item ID must be integer 1..20')
    if any(v is not None and (type(v) is not int or v not in range(1,6)) for v in answers.values()):raise ValueError('response must be integer 1..5 or None')
    def one(ids):
        missing=[i for i in ids if answers.get(i) is None]
        vals=[6-answers[i] if i in REVERSE else answers[i] for i in ids if answers.get(i) is not None]
        return {'answered':len(vals),'required':len(ids),'missing':missing,'sum':None if missing else sum(vals),'mean':None if missing else sum(vals)/len(ids)}
    return {'dimensions':{k:one(v) for k,v in DIMENSIONS.items()},'total':one(tuple(range(1,21)))}
