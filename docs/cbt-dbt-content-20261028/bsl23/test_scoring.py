import unittest
from scoring import score
class TestBSL23(unittest.TestCase):
 def test_endpoints(self):
  for n in (0,4):
   a={i:n for i in range(1,24)};r=score(a)
   self.assertEqual(r['total']['sum'],23*n);self.assertEqual(r['total']['mean'],round(23*n/23,2))
 def test_each_item(self):
  a={i:0 for i in range(1,24)}
  for i in range(1,24):
   b=a.copy();b[i]=4;r=score(b);self.assertEqual(r['total']['sum'],4)
 def test_missing_and_invalid(self):
  a={i:2 for i in range(1,24)};a[5]=None;r=score(a)
  self.assertIsNone(r['total']['sum']);self.assertIsNone(r['total']['mean']);self.assertEqual(r['total']['missing'],[5])
  for v in (-1,5,2.5,True,'3'):
   with self.assertRaises(ValueError):score({1:v})
  for k in (0,24,'1',True):
   with self.assertRaises(ValueError):score({k:1})
 def test_sample(self):
  a={i:(1 if i%2 else 2) for i in range(1,24)};r=score(a)
  self.assertEqual(r['total']['sum'],12*1+11*2)
  self.assertEqual(r['total']['mean'],round(34/23,2))
if __name__=='__main__':unittest.main()
