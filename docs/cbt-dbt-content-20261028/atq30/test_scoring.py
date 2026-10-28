import unittest
from scoring import DIMENSIONS,REVERSE,score
class TestATQ(unittest.TestCase):
 def test_partition(self):
  allids=[i for ids in DIMENSIONS.values() for i in ids];self.assertEqual(len(set(allids)),16);self.assertTrue(set(allids)<=set(range(1,31)))
 def test_endpoints(self):
  for n in (1,5):
   a={i:n for i in range(1,31)};r=score(a)
   self.assertEqual(r['total']['sum'],30*n)
   for k,v in DIMENSIONS.items():self.assertEqual(r['dimensions'][k]['sum'],len(v)*n)
 def test_each_item(self):
  a={i:1 for i in range(1,31)}
  for k,ids in DIMENSIONS.items():
   for i in ids:
    b=a.copy();b[i]=5;r=score(b);self.assertEqual(r['total']['sum'],34)
    for k2,ids2 in DIMENSIONS.items():self.assertEqual(r['dimensions'][k2]['sum'],len(ids2)+(4 if k2==k else 0))
 def test_missing_and_invalid(self):
  a={i:3 for i in range(1,31)};a[7]=None;r=score(a)
  self.assertIsNone(r['total']['sum']);self.assertIsNone(r['dimensions']['pmdc']['mean']);self.assertEqual(r['dimensions']['nsne']['sum'],21)
  self.assertEqual(r['dimensions']['lse']['sum'],6)
  for v in (0,6,2.5,True,'3'):
   with self.assertRaises(ValueError):score({1:v})
  for k in (0,31,'1',True):
   with self.assertRaises(ValueError):score({k:1})
 def test_sample(self):
  a={i:(4 if i in DIMENSIONS['nsne'] else 2) for i in range(1,31)};r=score(a)
  self.assertEqual(r['dimensions']['nsne']['sum'],28);self.assertEqual(r['dimensions']['lse']['sum'],4)
  self.assertEqual(r['total']['sum'],74)
if __name__=='__main__':unittest.main()
