import unittest
from scoring import DIMENSIONS, score

class TestTSEC(unittest.TestCase):
    def test_endpoints(self):
        for n in (1, 7):
            r = score({i: n for i in range(1, 23)})
            for name, ids in DIMENSIONS.items():
                self.assertAlmostEqual(r[name]['mean'], n)
    def test_membership(self):
        a = {i: (6 if i <= 6 else (4 if i <= 14 else 5)) for i in range(1, 23)}
        r = score(a)
        self.assertAlmostEqual(r['self_emotional_mastery']['mean'], 6)
        self.assertAlmostEqual(r['professional_relationship_building']['mean'], 4)
        self.assertAlmostEqual(r['professional_affairs_responsibility']['mean'], 5)
    def test_missing(self):
        a = {i: 4 for i in range(1, 23)}
        a[10] = None
        r = score(a)
        self.assertIsNone(r['professional_relationship_building']['mean'])
        self.assertEqual(r['professional_relationship_building']['missing'], [10])
        self.assertAlmostEqual(r['self_emotional_mastery']['mean'], 4)
        self.assertAlmostEqual(r['professional_affairs_responsibility']['mean'], 4)
        self.assertIsNone(score({})['self_emotional_mastery']['mean'])
    def test_invalid(self):
        for v in (0, 8, 1.5, '4', True):
            with self.assertRaises(ValueError): score({1: v})
        for k in (0, 23, '1', True):
            with self.assertRaises(ValueError): score({k: 1})
    def test_sample(self):
        a = dict(enumerate([4, 5, 4, 5, 4, 5], 1))
        a.update(dict(enumerate([4, 4, 5, 5, 5, 5, 6, 6], 7)))
        a.update(dict(enumerate([5, 6, 5, 6, 6, 5, 7, 7], 15)))
        r = score(a)
        self.assertAlmostEqual(r['self_emotional_mastery']['mean'], 4.5)
        self.assertAlmostEqual(r['professional_relationship_building']['mean'], 5)
        self.assertAlmostEqual(r['professional_affairs_responsibility']['mean'], 47 / 8)

if __name__ == '__main__':
    unittest.main()
