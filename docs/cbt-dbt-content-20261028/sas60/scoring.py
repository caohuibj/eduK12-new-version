DIMENSIONS={'soc_concern_disapproval':(50,44,38,24,11,33,29,17,27,18),'soc_attachment_separation':(31,49,34,35,4,53,40,19,26,58,59,47,8),'soc_pleasing_others':(5,1,46,7,52,15,56),'aut_individualistic_achievement':(60,32,14,3,12,9,30,48,45,39,20,2),'aut_mobility_freedom':(21,55,54,13,57,41,28,23,36,43,6,22),'aut_preference_solitude':(16,42,10,37,25,51)}
TOTALS={'sociotropy':(50,44,38,24,11,33,29,17,27,18,31,49,34,35,4,53,40,19,26,58,59,47,8,5,1,46,7,52,15,56),'autonomy':(60,32,14,3,12,9,30,48,45,39,20,2,21,55,54,13,57,41,28,23,36,43,6,22,16,42,10,37,25,51)}
REVERSE=frozenset()
def score(answers):
    if not isinstance(answers,dict) or any(type(k) is not int or k not in range(1,61) for k in answers):raise ValueError('item ID must be integer 1..60')
    if any(v is not None and (type(v) is not int or v not in range(0,5)) for v in answers.values()):raise ValueError('response must be integer 0..4 or None')
    def one(ids):
        missing=[i for i in ids if answers.get(i) is None]
        vals=[answers[i] for i in ids if answers.get(i) is not None]
        return {'answered':len(vals),'required':len(ids),'missing':missing,'sum':None if missing else sum(vals),'mean':None if missing else sum(vals)/len(ids)}
    r={'dimensions':{k:one(v) for k,v in DIMENSIONS.items()},'totals':{k:one(v) for k,v in TOTALS.items()}}
    return r
