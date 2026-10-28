import sys,os
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from scoring import score

# 1. all 0 (Not at all) -> both subscales 0
r=score({i:0 for i in range(1,14)})
assert r['dimensions']['curiosity']=={'answered':6,'required':6,'missing':[],'sum':0,'mean':0.0}
assert r['dimensions']['decentering']['sum']==0
assert r['total']['sum']==0

# 2. all 4 (Very much) -> curiosity 24, decentering 28, total 52
r=score({i:4 for i in range(1,14)})
assert r['dimensions']['curiosity']['sum']==24
assert r['dimensions']['decentering']['sum']==28
assert r['total']['sum']==52

# 3. official key partition: no reverse items, curiosity+decentering = 13 items exactly
from scoring import DIMENSIONS
allids=sorted(DIMENSIONS['curiosity']+DIMENSIONS['decentering'])
assert allids==list(range(1,14))
assert list(DIMENSIONS['curiosity'])==[3,5,6,10,12,13]
assert list(DIMENSIONS['decentering'])==[1,2,4,7,8,9,11]

# 4. mixed: curiosity items all 4, decentering items all 0
a={i:(4 if i in (3,5,6,10,12,13) else 0) for i in range(1,14)}
r=score(a)
assert r['dimensions']['curiosity']['sum']==24 and r['dimensions']['decentering']['sum']==0

# 5. missing one curiosity item -> curiosity null, decentering normal
a={i:2 for i in range(1,14)}; a[3]=None
r=score(a)
assert r['dimensions']['curiosity']['missing']==[3] and r['dimensions']['curiosity']['sum'] is None
assert r['dimensions']['decentering']['sum']==14

# 6. missing one decentering item -> decentering null
a={i:1 for i in range(1,14)}; a[9]=None
r=score(a)
assert r['dimensions']['decentering']['missing']==[9] and r['dimensions']['decentering']['sum'] is None
assert r['dimensions']['curiosity']['sum']==6

# 7. all missing / empty -> null
r=score({i:None for i in range(1,14)})
assert r['total']['sum'] is None
r=score({})
assert r['total']['required']==13 and r['total']['sum'] is None

# 8. invalid values rejected
try:
    score({1:-1}); raise AssertionError('expected ValueError for -1')
except ValueError: pass
try:
    score({1:5}); raise AssertionError('expected ValueError for 5')
except ValueError: pass
try:
    score({14:3}); raise AssertionError('expected ValueError for item 14')
except ValueError: pass

print('tms13 test_scoring: all golden cases PASS')
