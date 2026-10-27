import unittest
from scoring import DIMENSIONS, REVERSE, score

class TestERICA(unittest.TestCase):
    def test_all_scored_endpoints(self):
        for n in (1, 5):
            raw={i:(6-n if i in REVERSE else n) for i in range(1,17)}
            r=score(raw)
            self.assertEqual(r['total']['sum'],16*n)
            for name,ids in DIMENSIONS.items():
                self.assertEqual(r['dimensions'][name]['sum'],len(ids)*n)
                self.assertEqual(r['dimensions'][name]['mean'],n)
    def test_every_item_direction_and_membership(self):
        baseline={i:(5 if i in REVERSE else 1) for i in range(1,17)}
        for name,ids in DIMENSIONS.items():
            for item in ids:
                a=baseline.copy(); a[item]=1 if item in REVERSE else 5
                r=score(a)
                self.assertEqual(r['total']['sum'],20)
                for other,other_ids in DIMENSIONS.items():
                    self.assertEqual(r['dimensions'][other]['sum'],len(other_ids)+(4 if other==name else 0))
    def test_missing(self):
        a={i:3 for i in range(1,17)}; a[8]=None; r=score(a)
        self.assertIsNone(r['total']['sum']); self.assertIsNone(r['dimensions']['situational_responsiveness']['sum'])
        self.assertEqual(r['dimensions']['situational_responsiveness']['missing'],[8])
        self.assertEqual(r['dimensions']['emotional_control']['sum'],21)
        self.assertIsNone(score({})['total']['sum'])
    def test_invalid(self):
        for v in [0,6,1.5,'3',True]:
            with self.assertRaises(ValueError): score({1:v})
        for k in [0,17,'1',True]:
            with self.assertRaises(ValueError): score({k:1})
    def test_example(self):
        a=dict(enumerate([3,4,4,3,2,4,2,1,3,2,2,3,3,2,4,3],1)); r=score(a)
        self.assertEqual([r['dimensions'][k]['sum'] for k in DIMENSIONS],[25,17,17])
        self.assertEqual(r['total']['sum'],59)

if __name__=='__main__': unittest.main()
