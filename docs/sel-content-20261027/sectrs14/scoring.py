"""SECTRS-14 product reference: complete subscale descriptive means, no total."""
DIMENSIONS={'teacher_student_relationships':(1,5,8,10,14),'emotion_regulation':(2,6,11),'social_awareness':(3,7,12),'interpersonal_relationships':(4,9,13)}

def score(answers):
    if not isinstance(answers,dict) or any(type(k) is not int or k not in range(1,15) for k in answers):
        raise ValueError('item IDs must be integers 1..14')
    if any(v is not None and (type(v) is not int or v not in range(1,7)) for v in answers.values()):
        raise ValueError('responses must be integers 1..6 or None')
    def one(ids):
        missing=[i for i in ids if answers.get(i) is None]
        vals=[answers[i] for i in ids if answers.get(i) is not None]
        return {'answered':len(vals),'required':len(ids),'missing':missing,
                'sum':None if missing else sum(vals),'mean':None if missing else sum(vals)/len(ids)}
    return {name:one(ids) for name,ids in DIMENSIONS.items()}
