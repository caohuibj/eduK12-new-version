import unittest
from scoring import DATA, score
class Tests(unittest.TestCase):
 def test_extremes(self):
  for version,d in DATA.items():
   n=len(d['items'])
   for a in (0,2,4): self.assertEqual(set(score(version,{i:a for i in range(1,n+1)}).values()), {a})
 def test_missing_not_zero(self):
  for version,d in DATA.items():
   a={i:2 for i in range(1,len(d['items'])+1)}; del a[d['dimensions'][0]['items'][0]]
   self.assertIsNone(score(version,a)['prosocial']); self.assertEqual(score(version,a)['regulation'],2)
   self.assertIsNone(score(version,a)['total']); self.assertTrue(all(v is None for v in score(version,{}).values()))
 def test_zero_is_valid_and_invalid_rejected(self):
  self.assertEqual(score('parent',{i:0 for i in range(1,13)})['total'],0)
  for a in [-1,5,True,'0',1.5]:
   with self.subTest(a=a), self.assertRaises(ValueError): score('parent',{1:a})
 def test_teacher_academic_and_parent_membership(self):
  self.assertEqual(DATA['teacher']['dimensions'][2]['items'],[1,4,5,10,15,17,21])
  self.assertEqual(DATA['parent']['dimensions'][0]['items'],[4,7,9,10,11,12])
  self.assertEqual(DATA['parent']['dimensions'][1]['items'],[1,2,3,5,6,8])
if __name__=='__main__': unittest.main()
