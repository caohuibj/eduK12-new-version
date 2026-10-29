import sys,os
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from scoring import score

# 1. official key partition: odd = awareness, even = acceptance (reversed)
from scoring import DIMENSIONS
assert list(DIMENSIONS['awareness'])==[1,3,5,7,9,11,13,15,17,19]
assert list(DIMENSIONS['acceptance'])==[2,4,6,8,10,12,14,16,18,20]

# 2. all 1 (never on everything): awareness = 10 (raw), acceptance = 10*5 = 50 (reversed)
r=score({i:1 for i in range(1,21)})
assert r['dimensions']['awareness']['sum']==10
assert r['dimensions']['acceptance']['sum']==50

# 3. all 5 (very often): awareness = 50, acceptance = 10*1 = 10
r=score({i:5 for i in range(1,21)})
assert r['dimensions']['awareness']['sum']==50
assert r['dimensions']['acceptance']['sum']==10

# 4. extremes: acceptance min = raw 5 on all even -> 10; max = raw 1 on all even -> 50
a={i:5 if i%2==0 else 1 for i in range(1,21)}
r=score(a)
assert r['dimensions']['awareness']['sum']==10 and r['dimensions']['acceptance']['sum']==10
a={i:1 if i%2==0 else 5 for i in range(1,21)}
r=score(a)
assert r['dimensions']['awareness']['sum']==50 and r['dimensions']['acceptance']['sum']==50

# 5. midpoint all 3: awareness 30, acceptance 30
r=score({i:3 for i in range(1,21)})
assert r['dimensions']['awareness']['sum']==30 and r['dimensions']['acceptance']['sum']==30

# 6. missing one awareness item -> awareness null, acceptance normal
a={i:4 for i in range(1,21)}; a[7]=None
r=score(a)
assert r['dimensions']['awareness']['missing']==[7] and r['dimensions']['awareness']['sum'] is None
assert r['dimensions']['acceptance']['sum']==20

# 7. missing one acceptance item -> acceptance null
a={i:2 for i in range(1,21)}; a[10]=None
r=score(a)
assert r['dimensions']['acceptance']['missing']==[10] and r['dimensions']['acceptance']['sum'] is None
assert r['dimensions']['awareness']['sum']==20

# 8. all missing / empty -> null
r=score({i:None for i in range(1,21)})
assert r['dimensions']['awareness']['sum'] is None
r=score({})
assert r['dimensions']['acceptance']['required']==10

# 9. invalid values rejected
try:
    score({1:0}); raise AssertionError('expected ValueError for 0')
except ValueError: pass
try:
    score({1:6}); raise AssertionError('expected ValueError for 6')
except ValueError: pass
try:
    score({21:3}); raise AssertionError('expected ValueError for item 21')
except ValueError: pass

print('phlms20 test_scoring: all golden cases PASS')
