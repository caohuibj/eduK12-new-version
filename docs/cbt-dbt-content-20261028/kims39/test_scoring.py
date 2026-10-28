import unittest
from scoring import DIMENSIONS,REVERSE,score
class TestKIMS(unittest.TestCase):
 def test_partition(self):
  allids=[i for ids in DIMENSIONS.values() for i in ids];self.assertEqual(len(set(allids)),39);self.assertEqual(set(allids),set(range(1,40)))
 def test_reverse_key(self):
  for k,ids in DIMENSIONS.items():
   rev=[i for i in ids if i in REVERSE]
   self.assertEqual(len(rev),{'observe':0,'describe':3,'act_awareness':6,'accept_without_judgment':9}[k])
 def test_endpoints(self):
  for n in (1,5):
   a={i:(6-n if i in REVERSE else n) for i in range(1,40)};r=score(a)
   for k,v in DIMENSIONS.items():self.assertEqual(r['dimensions'][k]['sum'],len(v)*n)
 def test_each_item(self):
  a={i:(5 if i in REVERSE else 1) for i in range(1,40)}
  for k,ids in DIMENSIONS.items():
   for i in ids:
    b=a.copy();b[i]=1 if i in REVERSE else 5;r=score(b)
    for k2,ids2 in DIMENSIONS.items():self.assertEqual(r['dimensions'][k2]['sum'],len(ids2)+(4 if k2==k else 0))
 def test_missing_and_invalid(self):
  a={i:3 for i in range(1,40)};a[2]=None;r=score(a)
  self.assertIsNone(r['dimensions']['describe']['sum']);self.assertEqual(r['dimensions']['observe']['sum'],36)
  self.assertEqual(r['dimensions']['accept_without_judgment']['sum'],27)
  for v in (0,6,2.5,True,'3'):
   with self.assertRaises(ValueError):score({1:v})
  for k in (0,40,'1',True):
   with self.assertRaises(ValueError):score({k:1})
 def test_sample(self):
  a={i:(6-(4 if i in DIMENSIONS['observe'] else 3) if i in REVERSE else 4 if i in DIMENSIONS['observe'] else 3) for i in range(1,40)};r=score(a)
  self.assertEqual(r['dimensions']['observe']['sum'],48)
  self.assertEqual(r['dimensions']['describe']['sum'],24)
  self.assertEqual((r['dimensions']['act_awareness']['sum'],r['dimensions']['accept_without_judgment']['sum']),(30,27))
if __name__=='__main__':unittest.main()
