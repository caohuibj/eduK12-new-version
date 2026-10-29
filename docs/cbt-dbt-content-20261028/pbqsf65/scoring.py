DIMENSIONS={'avoidant':(1,2,5,31,33,39,43),'dependent':(15,18,44,45,56,62,63),'passive_aggressive':(4,7,20,21,41,47,51),'obsessive_compulsive':(6,9,11,19,30,40,57),'antisocial':(23,32,35,38,42,59,61),'narcissistic':(10,16,26,27,46,58,60),'histrionic':(8,22,34,37,52,54,55),'schizoid':(12,25,28,29,36,50,53),'paranoid':(3,13,14,17,24,48,49),'borderline':(31,44,45,49,56,64,65)}
REVERSE=frozenset()
def score(answers):
    if not isinstance(answers,dict) or any(type(k) is not int or k not in range(1,66) for k in answers):raise ValueError('item ID must be integer 1..65')
    if any(v is not None and (type(v) is not int or v not in range(0,5)) for v in answers.values()):raise ValueError('response must be integer 0..4 or None')
    def one(ids):
        missing=[i for i in ids if answers.get(i) is None]
        vals=[answers[i] for i in ids if answers.get(i) is not None]
        return {'answered':len(vals),'required':len(ids),'missing':missing,'sum':None if missing else sum(vals),'mean':None if missing else sum(vals)/len(ids)}
    return {'dimensions':{k:one(v) for k,v in DIMENSIONS.items()}}
