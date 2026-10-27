import unittest
from scoring import DATA, score

class TestEAQ(unittest.TestCase):
    def test_key_has_all_30_once(self):
        ids = [i for d in DATA['dimensions'] for i in d['items']]
        self.assertEqual(sorted(ids), list(range(1, 31)))
        self.assertEqual(len(DATA['reverse']), 20)
    def test_reverse_key_extremes(self):
        high = {i: 1 if i in DATA['reverse'] else 3 for i in range(1, 31)}
        low = {i: 3 if i in DATA['reverse'] else 1 for i in range(1, 31)}
        self.assertEqual(set(score(high).values()), {3})
        self.assertEqual(set(score(low).values()), {1})
        self.assertEqual(set(score({i: 2 for i in range(1, 31)}).values()), {2})
    def test_body_direction_and_missing(self):
        a = {i: 2 for i in range(1, 31)}
        a.update({4: 1, 10: 1, 16: 3, 21: 1, 26: 1})
        self.assertEqual(score(a)['bodily_unawareness'], 3)
        del a[16]
        result = score(a)
        self.assertIsNone(result['bodily_unawareness'])
        self.assertEqual(result['verbal_sharing'], 2)
        self.assertTrue(all(v is None for v in score({}).values()))
    def test_invalid(self):
        for val in [0, 4, 1.1, True, '2']:
            with self.subTest(val=val), self.assertRaises(ValueError): score({1: val})
        with self.assertRaises(ValueError): score({31: 1})

if __name__ == '__main__': unittest.main()
