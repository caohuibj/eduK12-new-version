import sys,os
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from scoring import score

def approx(a,b,tol=1e-9):
    assert abs(a-b)<=tol, f'{a} != {b}'
    return a

# 1. all 1 (Almost Always on every lapse item = most mindless) -> lowest mean
r=score({i:1 for i in range(1,16)})
assert r['total']=={'answered':15,'required':15,'missing':[],'sum':15,'mean':1.0}, r['total']
assert r['dimensions']['dispositional_mindfulness']['mean']==1.0

# 2. all 6 (Almost Never on every lapse item = most mindful) -> highest mean
r=score({i:6 for i in range(1,16)})
assert r['total']=={'answered':15,'required':15,'missing':[],'sum':90,'mean':6.0}, r['total']

# 3. no reverse items: REVERSE is empty by design (anchors 1=Almost Always..6=Almost
#    Never already make the plain mean direction-correct; official scoring page
#    states 'simply compute a mean of the 15 items')
from scoring import REVERSE
assert len(REVERSE)==0

# 4. midpoint all 3 -> mean 3.0
r=score({i:3 for i in range(1,16)})
assert r['total']['sum']==45 and approx(r['total']['mean'],3.0)

# 5. mixed: 14 items=3, item 15=6 -> sum 48, mean 48/15=3.2
a={i:3 for i in range(1,15)}; a[15]=6
r=score(a)
assert r['total']['sum']==48 and approx(r['total']['mean'],3.2), r['total']

# 6. one item missing -> score null, missing recorded
a={i:4 for i in range(1,16)}; a[7]=None
r=score(a)
assert r['total']['answered']==14 and r['total']['missing']==[7]
assert r['total']['sum'] is None and r['total']['mean'] is None

# 7. all missing / empty -> null
r=score({i:None for i in range(1,16)})
assert r['total']['mean'] is None and r['total']['answered']==0
r=score({})
assert r['total']['mean'] is None and r['total']['required']==15

# 8. invalid values rejected
try:
    score({1:0}); raise AssertionError('expected ValueError for value 0')
except ValueError: pass
try:
    score({1:7}); raise AssertionError('expected ValueError for value 7')
except ValueError: pass

# 9. invalid item ids / types rejected
try:
    score({16:3}); raise AssertionError('expected ValueError for item 16')
except ValueError: pass
try:
    score({1:'3'}); raise AssertionError('expected ValueError for str response')
except ValueError: pass

print('maas15 test_scoring: all golden cases PASS')
