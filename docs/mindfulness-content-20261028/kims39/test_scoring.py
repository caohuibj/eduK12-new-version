import unittest
from scoring import DIMENSIONS,REVERSE,score
class TestKIMS(unittest.TestCase):
 def test_partition(self):
  allids=[i for ids in DIMENSIONS.values() for i in ids]
  self.assertEqual(len(allids),39);self.assertEqual(len(set(allids)),39);self.assertEqual(set(allids),set(range(1,40)))
  self.assertEqual([len(v) for v in DIMENSIONS.values()],[12,8,10,9])
  self.assertEqual(sorted(REVERSE),[3,4,8,11,12,14,16,18,20,22,23,24,27,28,31,32,35,36])
 def test_all_one(self):
  r=score({i:1 for i in range(1,40)})
  for k,(s,m,n) in {'observe':(12,1.0,12),'describe':(20,2.5,8),'act_aware':(34,3.4,10),'nonjudge':(45,5.0,9)}.items():
   d=r['dimensions'][k];self.assertEqual((d['sum'],d['mean'],d['answered'],d['required'],d['missing']),(s,m,n,n,[]))
 def test_all_five(self):
  r=score({i:5 for i in range(1,40)})
  for k,(s,m) in {'observe':(60,5.0),'describe':(28,3.5),'act_aware':(26,2.6),'nonjudge':(9,1.0)}.items():
   self.assertEqual((r['dimensions'][k]['sum'],r['dimensions'][k]['mean']),(s,m))
 def test_all_three_reverse_midpoint(self):
  r=score({i:3 for i in range(1,40)})
  for k,(s,m) in {'observe':(36,3.0),'describe':(24,3.0),'act_aware':(30,3.0),'nonjudge':(27,3.0)}.items():
   self.assertEqual((r['dimensions'][k]['sum'],r['dimensions'][k]['mean']),(s,m))
 def test_middle_with_reverse(self):
  r=score({i:((i-1)%5)+1 for i in range(1,40)})
  for k,(s,m) in {'observe':(39,3.25),'describe':(22,2.75),'act_aware':(35,3.5),'nonjudge':(29,29/9)}.items():
   self.assertEqual((r['dimensions'][k]['sum'],r['dimensions'][k]['mean']),(s,m))
 def test_each_dimension_missing_one(self):
  for k,ids in DIMENSIONS.items():
   a={i:3 for i in range(1,40)};gone=ids[0];del a[gone];r=score(a)
   self.assertIsNone(r['dimensions'][k]['sum']);self.assertIsNone(r['dimensions'][k]['mean'])
   self.assertEqual(r['dimensions'][k]['missing'],[gone]);self.assertEqual(r['dimensions'][k]['answered'],len(ids)-1)
   for k2 in DIMENSIONS:
    if k2!=k:self.assertEqual(r['dimensions'][k2]['sum'],{'observe':36,'describe':24,'act_aware':30,'nonjudge':27}[k2])
 def test_all_missing(self):
  r=score({})
  for k,ids in DIMENSIONS.items():
   d=r['dimensions'][k];self.assertIsNone(d['sum']);self.assertIsNone(d['mean'])
   self.assertEqual((d['answered'],d['required'],d['missing']),(0,len(ids),list(ids)))
 def test_mixed_missing(self):
  a={i:4 for i in range(1,40)}
  for i in (14,3,4):a[i]=None
  r=score(a);d=r['dimensions']
  self.assertEqual((d['observe']['sum'],d['observe']['mean'],d['observe']['answered']),(48,4.0,12))
  self.assertEqual((d['describe']['sum'],d['describe']['answered'],d['describe']['missing']),(None,7,[14]))
  self.assertEqual((d['act_aware']['sum'],d['act_aware']['answered'],d['act_aware']['missing']),(None,9,[3]))
  self.assertEqual((d['nonjudge']['sum'],d['nonjudge']['answered'],d['nonjudge']['missing']),(None,8,[4]))
 def test_invalid_inputs(self):
  for v in (0,6,2.5,True,'3'):
   with self.assertRaises(ValueError):score({1:v})
  for k in (0,40,'1',True):
   with self.assertRaises(ValueError):score({k:1})
  with self.assertRaises(ValueError):score('nope')
if __name__=='__main__':unittest.main()
