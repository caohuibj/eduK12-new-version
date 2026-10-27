"""CCNES Teacher Version, 72 independent ratings and 6 mean scores."""
DIMENSIONS={
 'distress_reactions':('1B','2A','3A','4D','5E','6C','7C','8C','9B','10A','11B','12D'),
 'punitive_reactions':('1A','2F','3F','4A','5D','6D','7E','8E','9E','10B','11C','12E'),
 'expressive_encouragement':('1E','2E','3E','4B','5F','6E','7F','8A','9A','10C','11F','12B'),
 'emotion_focused':('1F','2B','3D','4E','5A','6A','7B','8F','9F','10D','11E','12C'),
 'problem_focused':('1C','2D','3C','4F','5B','6F','7A','8B','9D','10E','11D','12A'),
 'minimization':('1D','2C','3B','4C','5C','6B','7D','8D','9C','10F','11A','12F')}
REVERSE=frozenset(('2A','7C','8C','10A'))
ALL_ITEMS=frozenset(f'{i}{letter}' for i in range(1,13) for letter in 'ABCDEF')

def score(answers):
    if not isinstance(answers,dict) or any(type(k) is not str or k not in ALL_ITEMS for k in answers): raise ValueError('invalid response code')
    if any(v is not None and (type(v) is not int or v not in range(1,8)) for v in answers.values()): raise ValueError('responses must be integers 1..7 or None')
    def one(ids):
        missing=[i for i in ids if answers.get(i) is None]
        values=[8-answers[i] if i in REVERSE else answers[i] for i in ids if answers.get(i) is not None]
        return {'answered':len(values),'required':12,'missing':missing,'mean':None if missing else sum(values)/12}
    return {name:one(ids) for name,ids in DIMENSIONS.items()}
