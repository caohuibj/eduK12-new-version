import sys,os
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from scoring import score

# 1. all 1 with reverse check: items 2,6,7 -> 4; others 1 -> sum = 9*1 + 3*4 = 21, mean 1.75
r=score({i:1 for i in range(1,13)})
t=r['total']
assert t['sum']==21 and abs(t['mean']-21/12)<1e-9, t
d=r['dimensions']['mindful_qualities']
assert d['sum']==21 and d['answered']==12 and d['missing']==[]

# 2. all 4 with reverse check: items 2,6,7 -> 1; others 4 -> sum = 9*4 + 3*1 = 39
r=score({i:4 for i in range(1,13)})
assert r['total']['sum']==39

# 3. extremes: min possible = all raw 4 (max reversal on reverse items) -> 39 is not min; true min:
#    raw 4 on items 2,6,7 and raw 1 elsewhere is 9+3=12
a={i:1 for i in range(1,13)}; a[2]=4; a[6]=4; a[7]=4
r=score(a)
assert r['total']['sum']==12, r['total']
#    max possible = raw 1 on items 2,6,7 and raw 4 elsewhere -> 36+3=48
a={i:4 for i in range(1,13)}; a[2]=1; a[6]=1; a[7]=1
r=score(a)
assert r['total']['sum']==48, r['total']

# 4. midpoint all 2 (reverse -> 3): sum = 9*2 + 3*3 = 27, mean 2.25
r=score({i:2 for i in range(1,13)})
assert r['total']['sum']==27 and abs(r['total']['mean']-2.25)<1e-9

# 5. one item missing -> score null, missing recorded
a={i:3 for i in range(1,13)}; a[7]=None
r=score(a)
assert r['total']['answered']==11 and r['total']['missing']==[7]
assert r['total']['sum'] is None and r['total']['mean'] is None

# 6. all missing / empty -> null
r=score({i:None for i in range(1,13)})
assert r['total']['mean'] is None and r['total']['answered']==0
r=score({})
assert r['total']['mean'] is None and r['total']['required']==12

# 7. invalid values rejected
try:
    score({1:0}); raise AssertionError('expected ValueError for value 0')
except ValueError: pass
try:
    score({1:5}); raise AssertionError('expected ValueError for value 5')
except ValueError: pass
try:
    score({13:3}); raise AssertionError('expected ValueError for item 13')
except ValueError: pass
try:
    score({1:'3'}); raise AssertionError('expected ValueError for str response')
except ValueError: pass

print('cams_r12 test_scoring: all golden cases PASS')
