import unittest
from scoring import DIMENSIONS,REVERSE,score
class TestCAMM(unittest.TestCase):
 def test_partition_and_reverse_key(self):
  allids=[i for ids in DIMENSIONS.values() for i in ids];self.assertEqual(len(set(allids)),10);self.assertEqual(set(allids),set(range(1,11)))
  self.assertEqual(set(REVERSE),set(range(1,11)))
 def test_all_raw_zero_is_total_max(self):
  r=score({i:0 for i in range(1,11)})
  self.assertEqual(r['dimensions']['mindful_awareness']['sum'],40)
  self.assertEqual(r['dimensions']['mindful_awareness']['mean'],4.0)
  self.assertEqual(r['dimensions']['mindful_awareness']['answered'],10)
  self.assertEqual(r['dimensions']['mindful_awareness']['missing'],[])
 def test_all_raw_four_is_total_min(self):
  r=score({i:4 for i in range(1,11)})
  self.assertEqual(r['dimensions']['mindful_awareness']['sum'],0)
  self.assertEqual(r['dimensions']['mindful_awareness']['mean'],0.0)
 def test_all_midpoint_stays_twenty(self):
  r=score({i:2 for i in range(1,11)})
  self.assertEqual(r['dimensions']['mindful_awareness']['sum'],20)
  self.assertEqual(r['dimensions']['mindful_awareness']['mean'],2.0)
 def test_mixed_exact(self):
  a={1:0,2:0,3:4,4:4,5:0,6:0,7:4,8:4,9:0,10:0};r=score(a)
  self.assertEqual(r['dimensions']['mindful_awareness']['sum'],24)
  self.assertEqual(r['dimensions']['mindful_awareness']['mean'],2.4)
  self.assertEqual(r['dimensions']['mindful_awareness']['answered'],10)
 def test_each_value_reverse_is_four_minus_response(self):
  for i in range(1,11):
   for v in range(0,5):
    a={j:2 for j in range(1,11)};a[i]=v;r=score(a)
    self.assertEqual(r['dimensions']['mindful_awareness']['sum'],22-v)
    self.assertTrue(0<=r['dimensions']['mindful_awareness']['sum']<=40)
 def test_missing_one_is_null(self):
  a={i:2 for i in range(1,11)};a[7]=None;r=score(a)
  self.assertIsNone(r['dimensions']['mindful_awareness']['sum'])
  self.assertIsNone(r['dimensions']['mindful_awareness']['mean'])
  self.assertEqual(r['dimensions']['mindful_awareness']['answered'],9)
  self.assertEqual(r['dimensions']['mindful_awareness']['missing'],[7])
 def test_all_missing_is_null(self):
  r=score({})
  d=r['dimensions']['mindful_awareness']
  self.assertIsNone(d['sum']);self.assertIsNone(d['mean']);self.assertEqual(d['answered'],0);self.assertEqual(d['missing'],list(range(1,11)))
 def test_missing_none_values(self):
  a={i:1 for i in range(1,11)};a[10]=None;r=score(a)
  self.assertIsNone(r['dimensions']['mindful_awareness']['sum']);self.assertEqual(r['dimensions']['mindful_awareness']['answered'],9)
 def test_invalid_values(self):
  for v in (5,-1,2.5,True,'3'):
   with self.assertRaises(ValueError):score({1:v})
 def test_invalid_keys(self):
  for k in (0,11,'1',True,1.0):
   with self.assertRaises(ValueError):score({k:1})
 def test_not_a_dict(self):
  with self.assertRaises(ValueError):score([0]*10)
  with self.assertRaises(ValueError):score(None)
if __name__=='__main__':unittest.main()
