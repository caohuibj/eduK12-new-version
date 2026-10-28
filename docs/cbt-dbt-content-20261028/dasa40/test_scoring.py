import unittest
from scoring import REVERSE,score
class TestDASA(unittest.TestCase):
 def test_reverse_count(self):
  self.assertEqual(len(REVERSE),10)
 def test_endpoints(self):
  for n in (1,7):
   a={i:(8-n if i in REVERSE else n) for i in range(1,41)};r=score(a)
   self.assertEqual(r['total']['sum'],40*n)
 def test_keyed_direction(self):
  a={i:7 for i in range(1,41)};r=score(a)
  self.assertEqual(r['total']['sum'],30*7+10*1)
  b={i:1 for i in range(1,41)};r2=score(b)
  self.assertEqual(r2['total']['sum'],30*1+10*7)
 def test_each_item(self):
  base=40
  a={i:(7 if i in REVERSE else 1) for i in range(1,41)}
  for i in range(1,41):
   b=a.copy();b[i]=1 if i in REVERSE else 7;r=score(b);self.assertEqual(r['total']['sum'],base+6)
 def test_missing_and_invalid(self):
  a={i:4 for i in range(1,41)};a[2]=None;r=score(a)
  self.assertIsNone(r['total']['sum']);self.assertEqual(r['total']['missing'],[2])
  for v in (0,8,2.5,True,'3'):
   with self.assertRaises(ValueError):score({1:v})
  for k in (0,41,'1',True):
   with self.assertRaises(ValueError):score({k:1})
 def test_sample(self):
  a={i:(3 if i in REVERSE else 5) for i in range(1,41)};r=score(a)
  self.assertEqual(r['total']['sum'],10*5+30*5)
  self.assertEqual(r['total']['mean'],5.0)
if __name__=='__main__':unittest.main()
