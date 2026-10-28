import unittest
from scoring import D20, D13, score20, score13

class TestEmQueParent(unittest.TestCase):
    def test_endpoints_20(self):
        for n in (0, 2):
            r = score20({i: n for i in range(1, 21)})
            for name, ids in D20.items():
                self.assertAlmostEqual(r[name]['mean'], n)
    def test_membership_20(self):
        a = {i: (2 if i in D20['emotional_contagion'] else 0) for i in range(1, 21)}
        r = score20(a)
        self.assertAlmostEqual(r['emotional_contagion']['mean'], 2)
        self.assertAlmostEqual(r['attention_to_others_feelings']['mean'], 0)
        self.assertAlmostEqual(r['prosocial_actions']['mean'], 0)
    def test_short_subset(self):
        a = {i: 2 for i in range(1, 21)}
        r13 = score13(a)
        self.assertAlmostEqual(r13['emotional_contagion']['mean'], 2)
        self.assertAlmostEqual(r13['attention_to_others_feelings']['mean'], 2)
        self.assertAlmostEqual(r13['prosocial_actions']['mean'], 2)
    def test_missing(self):
        a = {i: 1 for i in range(1, 21)}
        a[9] = None
        r = score20(a)
        self.assertIsNone(r['attention_to_others_feelings']['mean'])
        self.assertEqual(r['attention_to_others_feelings']['missing'], [9])
        self.assertAlmostEqual(r['emotional_contagion']['mean'], 1)
        a13 = {i: 1 for i in range(1, 21)}
        a13[6] = None
        self.assertIsNone(score13(a13)['attention_to_others_feelings']['mean'])
    def test_invalid(self):
        for v in (-1, 3, 1.5, '1', True):
            with self.assertRaises(ValueError): score20({1: v})
        for k in (0, 21, '1'):
            with self.assertRaises(ValueError): score20({k: 1})
    def test_sample(self):
        a = {1: 1, 2: 0, 3: 1, 4: 1, 5: 2, 6: 1, 7: 0, 8: 1, 9: 2, 10: 1,
             11: 0, 12: 1, 13: 1, 14: 2, 15: 1, 16: 1, 17: 2, 18: 1, 19: 0, 20: 2}
        r = score20(a)
        self.assertAlmostEqual(r['emotional_contagion']['mean'], 5 / 7)
        self.assertAlmostEqual(r['attention_to_others_feelings']['mean'], 9 / 7)
        self.assertAlmostEqual(r['prosocial_actions']['mean'], 7 / 6)

if __name__ == '__main__':
    unittest.main()
