import unittest
from scoring import score
class TestRFL(unittest.TestCase):
 def test_endpoints(self):
  for n in (1,6):
   a={i:n for i in range(1,49)};r=score(a)
   self.assertEqual(r['total']['sum'],48*n);self.assertEqual(r['total']['mean'],round(48*n/48,2))
 def test_each_item(self):
  a={i:1 for i in range(1,49)}
  for i in range(1,49):
   b=a.copy();b[i]=6;r=score(b);self.assertEqual(r['total']['sum'],53)
 def test_missing_and_invalid(self):
  a={i:3 for i in range(1,49)};a[4]=None;r=score(a)
  self.assertIsNone(r['total']['sum']);self.assertIsNone(r['total']['mean']);self.assertEqual(r['total']['missing'],[4])
  for v in (0,7,2.5,True,'3'):
   with self.assertRaises(ValueError):score({1:v})
  for k in (0,49,'1',True):
   with self.assertRaises(ValueError):score({k:1})
 def test_sample(self):
  a={i:(3 if i%2 else 4) for i in range(1,49)};r=score(a)
  self.assertEqual(r['total']['sum'],24*3+24*4)
  self.assertEqual(r['total']['mean'],3.5)
if __name__=='__main__':unittest.main()
