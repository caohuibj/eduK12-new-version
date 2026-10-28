REVERSE=frozenset(range(1,16))
def score(answers):
    if not isinstance(answers,dict) or any(type(k) is not int or k not in range(1,16) for k in answers):raise ValueError('item ID must be integer 1..15')
    if any(v is not None and (type(v) is not int or v not in range(1,6)) for v in answers.values()):raise ValueError('response must be integer 1..5 or None')
    missing=[i for i in range(1,16) if answers.get(i) is None]
    vals=[6-answers[i] for i in range(1,16) if answers.get(i) is not None]
    total=None if missing else round(sum(vals)/len(vals),2)
    return {'total':{'answered':len(vals),'required':15,'missing':missing,'mean':total,'sum':None if missing else round(sum(vals),2)}}
