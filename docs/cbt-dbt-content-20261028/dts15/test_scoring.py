import unittest
from scoring import score
class TestDTS(unittest.TestCase):
 def test_endpoints(self):
  for n in (1,5):
   a={i:n for i in range(1,16)};r=score(a)
   self.assertEqual(r['total']['mean'],round(15*(6-n)/15,2))
 def test_each_item(self):
  a={i:1 for i in range(1,16)}
  for i in range(1,16):
   b=a.copy();b[i]=5;r=score(b);self.assertEqual(r['total']['mean'],round((14*5+1)/15,2))
 def test_missing_and_invalid(self):
  a={i:3 for i in range(1,16)};a[9]=None;r=score(a)
  self.assertIsNone(r['total']['mean']);self.assertEqual(r['total']['missing'],[9])
  for v in (0,6,2.5,True,'3'):
   with self.assertRaises(ValueError):score({1:v})
  for k in (0,16,'1',True):
   with self.assertRaises(ValueError):score({k:1})
 def test_sample(self):
  a={i:(2 if i<=5 else 3 if i<=10 else 4) for i in range(1,16)};r=score(a)
  self.assertEqual(r['total']['mean'],3.0)
  self.assertEqual(r['total']['sum'],45.0)
if __name__=='__main__':unittest.main()
