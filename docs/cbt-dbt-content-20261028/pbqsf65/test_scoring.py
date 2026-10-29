import unittest
from scoring import DIMENSIONS,REVERSE,score
class TestPBQSF(unittest.TestCase):
 def test_coverage(self):
  slots=[i for ids in DIMENSIONS.values() for i in ids]
  self.assertEqual(len(slots),70)
  dup=sorted({i for i in slots if slots.count(i)>1})
  self.assertEqual(dup,[31,44,45,49,56])
  self.assertEqual(set(slots),set(range(1,66)))
 def test_scale_size(self):
  for k,v in DIMENSIONS.items():self.assertEqual(len(v),7)
 def test_endpoints(self):
  for n in (0,4):
   a={i:n for i in range(1,66)};r=score(a)
   for k,v in DIMENSIONS.items():self.assertEqual(r['dimensions'][k]['sum'],7*n)
 def test_each_item(self):
  a={i:0 for i in range(1,66)}
  for k,ids in DIMENSIONS.items():
   for i in ids:
    b=a.copy();b[i]=4;r=score(b)
    for k2,ids2 in DIMENSIONS.items():self.assertEqual(r['dimensions'][k2]['sum'],4 if i in ids2 else 0)
 def test_missing_and_invalid(self):
  a={i:2 for i in range(1,66)};a[44]=None;r=score(a)
  self.assertIsNone(r['dimensions']['dependent']['sum']);self.assertIsNone(r['dimensions']['borderline']['sum'])
  self.assertEqual(r['dimensions']['avoidant']['sum'],14)
  for v in (-1,5,2.5,True,'3'):
   with self.assertRaises(ValueError):score({1:v})
  for k in (0,66,'1',True):
   with self.assertRaises(ValueError):score({k:1})
 def test_sample(self):
  a={i:(2 if i%2 else 3) for i in range(1,66)};r=score(a)
  for k,v in DIMENSIONS.items():
   odd=sum(1 for i in v if i%2);even=7-odd
   self.assertEqual(r['dimensions'][k]['sum'],odd*2+even*3)
if __name__=='__main__':unittest.main()
