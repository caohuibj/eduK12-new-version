import unittest
from scoring import DIMENSIONS, score

class ScoringTest(unittest.TestCase):
    def test_extremes(self):
        for value in (1, 4):
            s = score({i: value for i in range(1, 21)})
            self.assertEqual(s['total']['sum'], 20 * value)
            self.assertEqual(s['total']['mean'], value)
            for d in s['dimensions'].values():
                self.assertEqual((d['sum'], d['mean']), (4 * value, value))
    def test_item_membership_and_no_reverse(self):
        for name, ids in DIMENSIONS.items():
            for item in ids:
                responses = {i: 1 for i in range(1, 21)}
                responses[item] = 4
                result = score(responses)
                self.assertEqual(result['dimensions'][name]['sum'], 7)
                self.assertTrue(all(v['sum'] == 4 for k, v in result['dimensions'].items() if k != name))
                self.assertEqual(result['total']['sum'], 23)
    def test_missing_is_not_zero(self):
        responses = {i: 3 for i in range(1, 21)}
        responses[5] = None
        r = score(responses)
        self.assertEqual(r['dimensions']['self_awareness']['missing'], [5])
        self.assertIsNone(r['dimensions']['self_awareness']['sum'])
        self.assertIsNone(r['total']['mean'])
        self.assertEqual(r['dimensions']['social_awareness']['sum'], 12)
        self.assertIsNone(score({})['total']['sum'])
    def test_invalid(self):
        for bad in (0, 5, 1.5, '3', True):
            with self.assertRaises(ValueError): score({1: bad})
        for key in (0, 21, '1', True):
            with self.assertRaises(ValueError): score({key: 1})
    def test_report_example(self):
        groups = [[4,3,3,3],[4,4,3,3],[2,3,3,2],[3,3,3,3],[3,3,3,2]]
        a = {i: v for ids, values in zip(DIMENSIONS.values(), groups) for i, v in zip(ids, values)}
        r = score(a)
        self.assertEqual([v['sum'] for v in r['dimensions'].values()], [13,14,10,12,11])
        self.assertEqual((r['total']['sum'], r['total']['mean']), (60, 3.0))

if __name__ == '__main__': unittest.main()
