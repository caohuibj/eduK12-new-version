DIMENSIONS={'observe':(1,6,11,15,20,26,31,36),'describe':(2,7,12,16,22,27,32,37),'act_aware':(5,8,13,18,23,28,34,38),'nonjudge':(3,10,14,17,25,30,35,39),'nonreact':(4,9,19,21,24,29,33)}
REVERSE=frozenset((3,5,8,10,12,13,14,16,17,18,22,23,25,28,30,34,35,38,39))
def score(answers):
    if not isinstance(answers,dict) or any(type(k) is not int or k not in range(1,40) for k in answers):raise ValueError('item ID must be integer 1..39')
    if any(v is not None and (type(v) is not int or v not in range(1,6)) for v in answers.values()):raise ValueError('response must be integer 1..5 or None')
    def one(ids):
        missing=[i for i in ids if answers.get(i) is None]
        vals=[6-answers[i] if i in REVERSE else answers[i] for i in ids if answers.get(i) is not None]
        return {'answered':len(vals),'required':len(ids),'missing':missing,'sum':None if missing else sum(vals),'mean':None if missing else sum(vals)/len(ids)}
    return {'dimensions':{k:one(v) for k,v in DIMENSIONS.items()}}
