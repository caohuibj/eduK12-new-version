DIMENSIONS={'observe':(1,5,9,13,17,21,25,29,30,33,37,39),'describe':(2,6,10,14,18,22,26,34),'act_awareness':(3,7,11,15,19,23,27,31,35,38),'accept_without_judgment':(4,8,12,16,20,24,28,32,36)}
REVERSE=frozenset((3,4,8,11,12,14,16,18,20,22,23,24,27,28,31,32,35,36))
def score(answers):
    if not isinstance(answers,dict) or any(type(k) is not int or k not in range(1,40) for k in answers):raise ValueError('item ID must be integer 1..39')
    if any(v is not None and (type(v) is not int or v not in range(1,6)) for v in answers.values()):raise ValueError('response must be integer 1..5 or None')
    def one(ids):
        missing=[i for i in ids if answers.get(i) is None]
        vals=[6-answers[i] if i in REVERSE else answers[i] for i in ids if answers.get(i) is not None]
        return {'answered':len(vals),'required':len(ids),'missing':missing,'sum':None if missing else sum(vals),'mean':None if missing else sum(vals)/len(ids)}
    return {'dimensions':{k:one(v) for k,v in DIMENSIONS.items()}}
