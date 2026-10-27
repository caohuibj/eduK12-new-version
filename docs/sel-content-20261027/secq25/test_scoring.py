import unittest
from scoring import DIMENSIONS, score

IDS = [item for group in DIMENSIONS.values() for item in group]


class ScoringTests(unittest.TestCase):
    def test_extremes(self):
        self.assertEqual(set(score({i: 1 for i in IDS}).values()), {1.0})
        self.assertEqual(set(score({i: 6 for i in IDS}).values()), {6.0})

    def test_sa5_and_mixed_values(self):
        data = {i: 4 for i in IDS}
        data['SA5'] = 1
        self.assertEqual(score(data)['self_awareness'], 3.4)
        self.assertEqual(score(data)['social_awareness'], 4.0)

    def test_missing_is_not_zero_or_imputed(self):
        data = {i: 4 for i in IDS}
        del data['SM1']
        data['RM2'] = None
        result = score(data)
        self.assertIsNone(result['self_management'])
        self.assertIsNone(result['relationship_management'])
        self.assertEqual(result['self_awareness'], 4.0)
        self.assertTrue(all(value is None for value in score({}).values()))

    def test_invalid_values_rejected(self):
        for val in [0, 7, 1.5, '2', True, float('nan')]:
            with self.subTest(val=val), self.assertRaises(ValueError):
                score({'SA1': val})
        with self.assertRaises(ValueError):
            score({'UNKNOWN': 2})


if __name__ == '__main__':
    unittest.main()
