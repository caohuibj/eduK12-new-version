import unittest
from scoring import DATA,score
class Tests(unittest.TestCase):
 def test_keys(self):
  ids=[i for d in DATA['dimensions'] for i in d['items']]
  self.assertEqual(sorted(ids),[i for i in range(1,25) if i!=12]); self.assertEqual(DATA['reverse'],[4,5,9,11,16,18])
 def test_extremes_and_reversals(self):
  lo={i:4 if i in DATA['reverse'] else 1 for i in range(1,25)}; hi={i:1 if i in DATA['reverse'] else 4 for i in range(1,25)}
  self.assertEqual(score(lo),{'emotion_regulation':8,'lability_negativity':15})
  self.assertEqual(score(hi),{'emotion_regulation':32,'lability_negativity':60})
 def test_missing_and_item_12(self):
  a={i:2 for i in range(1,25)}; baseline=score(a); del a[12]; self.assertEqual(score(a),baseline)
  del a[1]; self.assertIsNone(score(a)['emotion_regulation']);self.assertEqual(score(a)['lability_negativity'],baseline['lability_negativity'])
  self.assertTrue(all(v is None for v in score({}).values()))
 def test_invalid(self):
  for v in [0,5,1.5,'2',True]:
   with self.subTest(v=v),self.assertRaises(ValueError):score({1:v})
if __name__=='__main__':unittest.main()
