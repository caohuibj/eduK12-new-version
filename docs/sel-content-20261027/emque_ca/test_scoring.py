import unittest
from scoring import DIMENSIONS, score

class TestEmQueCA(unittest.TestCase):
    def test_endpoints(self):
        for n in (1, 3):
            r = score({i: n for i in range(1, 15)})
            for name, ids in DIMENSIONS.items():
                self.assertAlmostEqual(r[name]['mean'], n)
    def test_membership(self):
        a = {i: (3 if i <= 6 else 1) for i in range(1, 15)}
        r = score(a)
        self.assertAlmostEqual(r['affective_empathy']['mean'], 3)
        self.assertAlmostEqual(r['cognitive_empathy']['mean'], 1)
        self.assertAlmostEqual(r['intention_to_comfort']['mean'], 1)
    def test_missing(self):
        a = {i: 2 for i in range(1, 15)}
        a[8] = None
        r = score(a)
        self.assertIsNone(r['cognitive_empathy']['mean'])
        self.assertEqual(r['cognitive_empathy']['missing'], [8])
        self.assertAlmostEqual(r['affective_empathy']['mean'], 2)
        self.assertIsNone(score({})['affective_empathy']['mean'])
    def test_invalid(self):
        for v in (0, 4, 1.5, '2', True):
            with self.assertRaises(ValueError): score({1: v})
        for k in (0, 15, '1', True):
            with self.assertRaises(ValueError): score({k: 1})
    def test_sample(self):
        a = dict(zip(range(1, 15), [2, 3, 2, 3, 2, 3, 1, 2, 3, 3, 2, 3, 2, 3]))
        r = score(a)
        self.assertAlmostEqual(r['affective_empathy']['mean'], 2.5)
        self.assertAlmostEqual(r['cognitive_empathy']['mean'], 2)
        self.assertAlmostEqual(r['intention_to_comfort']['mean'], 2.6)

if __name__ == '__main__':
    unittest.main()
