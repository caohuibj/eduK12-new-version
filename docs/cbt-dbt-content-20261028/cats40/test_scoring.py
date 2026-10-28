import unittest
from scoring import DIMENSIONS,REVERSE,score
class TestCATS(unittest.TestCase):
 def test_partition(self):
  allids=[i for ids in DIMENSIONS.values() for i in ids];self.assertEqual(len(set(allids)),40);self.assertEqual(set(allids),set(range(1,41)))
 def test_endpoints(self):
  for n in (0,4):
   a={i:n for i in range(1,41)};r=score(a)
   self.assertEqual(r['total']['sum'],40*n)
   for k,v in DIMENSIONS.items():self.assertEqual(r['dimensions'][k]['sum'],len(v)*n)
 def test_each_item(self):
  a={i:0 for i in range(1,41)}
  for k,ids in DIMENSIONS.items():
   for i in ids:
    b=a.copy();b[i]=4;r=score(b);self.assertEqual(r['total']['sum'],4)
    for k2,ids2 in DIMENSIONS.items():self.assertEqual(r['dimensions'][k2]['sum'],4 if k2==k else 0)
 def test_missing_and_invalid(self):
  a={i:2 for i in range(1,41)};a[1]=None;r=score(a)
  self.assertIsNone(r['total']['sum']);self.assertIsNone(r['dimensions']['social_threat']['sum']);self.assertEqual(r['dimensions']['physical_threat']['sum'],20)
  for v in (-1,5,2.5,True,'3'):
   with self.assertRaises(ValueError):score({1:v})
  for k in (0,41,'1',True):
   with self.assertRaises(ValueError):score({k:1})
 def test_sample(self):
  a={i:(2 if i in DIMENSIONS['social_threat'] else 1) for i in range(1,41)};r=score(a)
  self.assertEqual(r['dimensions']['social_threat']['sum'],20)
  self.assertEqual(r['dimensions']['physical_threat']['sum'],10)
  self.assertEqual(r['total']['sum'],50)
if __name__=='__main__':unittest.main()
