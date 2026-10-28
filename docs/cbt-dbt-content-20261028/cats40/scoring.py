DIMENSIONS={'physical_threat':(4,7,9,12,16,20,24,33,36,39),'social_threat':(1,6,8,14,18,21,25,29,31,32),'personal_failure':(3,11,13,17,23,26,28,30,34,38),'hostile_intent':(2,5,10,15,19,22,27,35,37,40)}
REVERSE=frozenset()
def score(answers):
    if not isinstance(answers,dict) or any(type(k) is not int or k not in range(1,41) for k in answers):raise ValueError('item ID must be integer 1..40')
    if any(v is not None and (type(v) is not int or v not in range(0,5)) for v in answers.values()):raise ValueError('response must be integer 0..4 or None')
    def one(ids):
        missing=[i for i in ids if answers.get(i) is None]
        vals=[answers[i] for i in ids if answers.get(i) is not None]
        return {'answered':len(vals),'required':len(ids),'missing':missing,'sum':None if missing else sum(vals),'mean':None if missing else sum(vals)/len(ids)}
    return {'dimensions':{k:one(v) for k,v in DIMENSIONS.items()},'total':one(tuple(range(1,41)))}
