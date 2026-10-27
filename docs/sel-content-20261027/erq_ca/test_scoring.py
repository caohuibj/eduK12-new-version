import unittest
from scoring import DIMENSIONS, score

class TestScoring(unittest.TestCase):
    def test_bounds(self):
        for n in (1, 5):
            r=score({i:n for i in range(1,11)})
            self.assertEqual(r['cognitive_reappraisal']['sum'],6*n)
            self.assertEqual(r['expressive_suppression']['sum'],4*n)
            self.assertEqual(r['cognitive_reappraisal']['mean'],n)
    def test_every_item_direct_and_membership(self):
        for name, ids in DIMENSIONS.items():
            for i in ids:
                a={j:1 for j in range(1,11)}; a[i]=5; r=score(a)
                self.assertEqual(r[name]['sum'],len(ids)+4)
                for other in DIMENSIONS:
                    if other != name: self.assertEqual(r[other]['sum'],len(DIMENSIONS[other]))
    def test_missing(self):
        a={i:3 for i in range(1,11)}; a[2]=None; r=score(a)
        self.assertIsNone(r['expressive_suppression']['sum'])
        self.assertEqual(r['expressive_suppression']['missing'],[2])
        self.assertEqual(r['cognitive_reappraisal']['sum'],18)
        self.assertIsNone(score({})['cognitive_reappraisal']['mean'])
    def test_invalid(self):
        for v in [0,6,1.5,'3',True]:
            with self.assertRaises(ValueError): score({1:v})
        for k in [0,11,'1',True]:
            with self.assertRaises(ValueError): score({k:1})
    def test_report(self):
        a={1:4,3:3,5:4,7:4,8:3,10:3,2:2,4:3,6:2,9:3}; r=score(a)
        self.assertEqual((r['cognitive_reappraisal']['sum'],r['cognitive_reappraisal']['mean']),(21,3.5))
        self.assertEqual((r['expressive_suppression']['sum'],r['expressive_suppression']['mean']),(10,2.5))

if __name__=='__main__': unittest.main()
