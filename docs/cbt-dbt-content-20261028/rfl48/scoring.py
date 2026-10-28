REVERSE=frozenset()
def score(answers):
    if not isinstance(answers,dict) or any(type(k) is not int or k not in range(1,49) for k in answers):raise ValueError('item ID must be integer 1..48')
    if any(v is not None and (type(v) is not int or v not in range(1,7)) for v in answers.values()):raise ValueError('response must be integer 1..6 or None')
    missing=[i for i in range(1,49) if answers.get(i) is None]
    vals=[answers[i] for i in range(1,49) if answers.get(i) is not None]
    total=None if missing else sum(vals)
    mean=None if missing else round(sum(vals)/len(vals),2)
    return {'total':{'answered':len(vals),'required':48,'missing':missing,'sum':total,'mean':mean}}
