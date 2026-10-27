import unittest
from scoring import DIMENSIONS,REVERSE,score
class TestBES(unittest.TestCase):
 def test_partition(self):
  allids=[i for ids in DIMENSIONS.values() for i in ids];self.assertEqual(len(set(allids)),20);self.assertEqual(set(allids),set(range(1,21)))
 def test_endpoints(self):
  for n in (1,5):
   a={i:(6-n if i in REVERSE else n) for i in range(1,21)};r=score(a)
   self.assertEqual(r['total']['sum'],20*n)
   for k,v in DIMENSIONS.items():self.assertEqual(r['dimensions'][k]['sum'],len(v)*n)
 def test_each_item(self):
  a={i:(5 if i in REVERSE else 1) for i in range(1,21)}
  for k,ids in DIMENSIONS.items():
   for i in ids:
    b=a.copy();b[i]=1 if i in REVERSE else 5;r=score(b);self.assertEqual(r['total']['sum'],24)
    for k2,ids2 in DIMENSIONS.items():self.assertEqual(r['dimensions'][k2]['sum'],len(ids2)+(4 if k2==k else 0))
 def test_missing_and_invalid(self):
  a={i:3 for i in range(1,21)};a[6]=None;r=score(a)
  self.assertIsNone(r['total']['sum']);self.assertIsNone(r['dimensions']['cognitive_empathy']['mean']);self.assertEqual(r['dimensions']['affective_empathy']['sum'],33)
  for v in (0,6,2.5,True,'3'):
   with self.assertRaises(ValueError):score({1:v})
  for k in (0,21,'1',True):
   with self.assertRaises(ValueError):score({k:1})
 def test_sample(self):
  a={i:(6-n if i in REVERSE else n) for n,ids in zip((4,3),DIMENSIONS.values()) for i in ids};r=score(a)
  self.assertEqual(r['dimensions']['affective_empathy']['sum'],44);self.assertEqual(r['dimensions']['cognitive_empathy']['sum'],27);self.assertEqual((r['total']['sum'],r['total']['mean']),(71,3.55))
if __name__=='__main__':unittest.main()
