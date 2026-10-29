import unittest
from scoring import DIMENSIONS,TOTALS,REVERSE,score
class TestSAS(unittest.TestCase):
 def test_partition(self):
  allids=[i for ids in DIMENSIONS.values() for i in ids]
  self.assertEqual(len(allids),60);self.assertEqual(len(set(allids)),60);self.assertEqual(set(allids),set(range(1,61)))
  for k,v in TOTALS.items():
   self.assertEqual(len(v),30)
   self.assertEqual(set(v),{i for d,ids in DIMENSIONS.items() if d.startswith('soc_' if k=='sociotropy' else 'aut_') for i in ids})
 def test_sizes(self):
  self.assertEqual([len(DIMENSIONS[k]) for k in ('soc_concern_disapproval','soc_attachment_separation','soc_pleasing_others','aut_individualistic_achievement','aut_mobility_freedom','aut_preference_solitude')],[10,13,7,12,12,6])
 def test_endpoints(self):
  for n in (0,4):
   a={i:n for i in range(1,61)};r=score(a)
   self.assertEqual(r['totals']['sociotropy']['sum'],30*n);self.assertEqual(r['totals']['autonomy']['sum'],30*n)
   for k,v in DIMENSIONS.items():self.assertEqual(r['dimensions'][k]['sum'],len(v)*n)
 def test_each_item(self):
  a={i:0 for i in range(1,61)}
  for k,ids in DIMENSIONS.items():
   for i in ids:
    b=a.copy();b[i]=4;r=score(b)
    for k2,ids2 in DIMENSIONS.items():self.assertEqual(r['dimensions'][k2]['sum'],4 if i in ids2 else 0)
 def test_missing_and_invalid(self):
  a={i:2 for i in range(1,61)};a[31]=None;r=score(a)
  self.assertIsNone(r['totals']['sociotropy']['sum']);self.assertIsNone(r['dimensions']['soc_attachment_separation']['sum'])
  self.assertEqual(r['totals']['autonomy']['sum'],60)
  for v in (-1,5,2.5,True,'3'):
   with self.assertRaises(ValueError):score({1:v})
  for k in (0,61,'1',True):
   with self.assertRaises(ValueError):score({k:1})
 def test_sample(self):
  a={i:(2 if i in TOTALS['sociotropy'] else 3) for i in range(1,61)};r=score(a)
  self.assertEqual(r['totals']['sociotropy']['sum'],60)
  self.assertEqual(r['totals']['autonomy']['sum'],90)
if __name__=='__main__':unittest.main()
