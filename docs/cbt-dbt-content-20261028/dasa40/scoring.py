REVERSE=frozenset((2,6,12,17,24,29,30,35,37,40))
def score(answers):
    if not isinstance(answers,dict) or any(type(k) is not int or k not in range(1,41) for k in answers):raise ValueError('item ID must be integer 1..40')
    if any(v is not None and (type(v) is not int or v not in range(1,8)) for v in answers.values()):raise ValueError('response must be integer 1..7 or None')
    missing=[i for i in range(1,41) if answers.get(i) is None]
    vals=[8-answers[i] if i in REVERSE else answers[i] for i in range(1,41) if answers.get(i) is not None]
    total=None if missing else sum(vals)
    return {'total':{'answered':len(vals),'required':40,'missing':missing,'sum':total,'mean':None if missing else round(sum(vals)/len(vals),2)}}
