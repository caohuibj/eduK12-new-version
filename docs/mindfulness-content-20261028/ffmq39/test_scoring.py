import unittest
from scoring import DIMENSIONS,REVERSE,score
N=39
class TestFFMQ39(unittest.TestCase):
 def test_partition(self):
  allids=[i for ids in DIMENSIONS.values() for i in ids];self.assertEqual(len(set(allids)),39);self.assertEqual(set(allids),set(range(1,40)));self.assertEqual(len(REVERSE),19)
 def test_all_raw_one(self):
  a={i:1 for i in range(1,40)};r=score(a);d=r['dimensions']
  self.assertEqual(d['observe'],{'answered':8,'required':8,'missing':[],'sum':8,'mean':1.0})
  self.assertEqual(d['describe'],{'answered':8,'required':8,'missing':[],'sum':20,'mean':2.5})
  self.assertEqual(d['act_aware'],{'answered':8,'required':8,'missing':[],'sum':40,'mean':5.0})
  self.assertEqual(d['nonjudge'],{'answered':8,'required':8,'missing':[],'sum':40,'mean':5.0})
  self.assertEqual(d['nonreact'],{'answered':7,'required':7,'missing':[],'sum':7,'mean':1.0})
 def test_all_raw_five(self):
  a={i:5 for i in range(1,40)};r=score(a);d=r['dimensions']
  self.assertEqual(d['observe']['sum'],40);self.assertEqual(d['describe']['sum'],28);self.assertEqual(d['act_aware']['sum'],8);self.assertEqual(d['nonjudge']['sum'],8);self.assertEqual(d['nonreact']['sum'],35)
  for k,ids in DIMENSIONS.items():self.assertEqual(d[k]['mean'],d[k]['sum']/len(ids))
 def test_mixed_middle_with_reverse(self):
  a={i:((i-1)%5)+1 for i in range(1,40)};r=score(a);d=r['dimensions']
  self.assertEqual(d['observe']['sum'],16);self.assertEqual(d['describe']['sum'],23);self.assertEqual(d['act_aware']['sum'],21);self.assertEqual(d['nonjudge']['sum'],15);self.assertEqual(d['nonreact']['sum'],24)
  self.assertEqual(d['observe']['mean'],2.0);self.assertEqual(d['describe']['mean'],2.875);self.assertEqual(d['act_aware']['mean'],2.625);self.assertEqual(d['nonjudge']['mean'],1.875);self.assertEqual(d['nonreact']['mean'],24/7)
 def test_midpoint_all_three(self):
  a={i:3 for i in range(1,40)};r=score(a);d=r['dimensions']
  for k in ('observe','describe','act_aware','nonjudge'):self.assertEqual(d[k]['sum'],24)
  self.assertEqual(d['nonreact']['sum'],21)
 def test_missing_one_dimension(self):
  a={i:3 for i in range(1,40)};a[20]=None;r=score(a);d=r['dimensions']
  self.assertIsNone(d['observe']['sum']);self.assertIsNone(d['observe']['mean']);self.assertEqual(d['observe']['missing'],[20]);self.assertEqual(d['observe']['answered'],7)
  self.assertEqual(d['describe']['sum'],24);self.assertEqual(d['act_aware']['sum'],24);self.assertEqual(d['nonjudge']['sum'],24);self.assertEqual(d['nonreact']['sum'],21)
 def test_all_missing(self):
  for a in ({}, {i:None for i in range(1,40)}):
   r=score(a);d=r['dimensions']
   for k in DIMENSIONS:self.assertIsNone(d[k]['sum']);self.assertIsNone(d[k]['mean']);self.assertEqual(d[k]['missing'],list(DIMENSIONS[k]))
 def test_mixed_missing(self):
  a={i:3 for i in range(1,40)};a[12]=None;a[29]=None;r=score(a);d=r['dimensions']
  self.assertIsNone(d['describe']['sum']);self.assertEqual(d['describe']['missing'],[12])
  self.assertIsNone(d['nonreact']['sum']);self.assertEqual(d['nonreact']['missing'],[29])
  self.assertEqual(d['observe']['sum'],24);self.assertEqual(d['act_aware']['sum'],24);self.assertEqual(d['nonjudge']['sum'],24)
 def test_missing_reverse_item(self):
  a={i:4 for i in range(1,40)};a[3]=None;r=score(a);d=r['dimensions']
  self.assertIsNone(d['nonjudge']['sum']);self.assertEqual(d['observe']['sum'],8*4);self.assertEqual(d['act_aware']['sum'],8*(6-4));self.assertEqual(d['nonreact']['sum'],7*4)
 def test_invalid(self):
  for v in (0,6,2.5,True,'3'):
   with self.assertRaises(ValueError):score({1:v})
  for k in (0,40,'1',True):
   with self.assertRaises(ValueError):score({k:1})
  with self.assertRaises(ValueError):score('all threes')
if __name__=='__main__':unittest.main()
