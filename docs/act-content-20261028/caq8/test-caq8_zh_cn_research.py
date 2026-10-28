# -*- coding: utf-8 -*-
"""CAQ-8 golden 计分测试；期望值与 source.json goldenCases 一致。"""
import importlib.util, os, unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_SPEC = importlib.util.spec_from_file_location("scoring_under_test", os.path.join(_HERE, "scoring-caq8_zh_cn_research.py"))
scoring = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(scoring)


class ScoringTests(unittest.TestCase):
    def test_all_minimum(self):
        answers = {'CAQ8_01': 0, 'CAQ8_02': 0, 'CAQ8_03': 0, 'CAQ8_04': 0, 'CAQ8_05': 0, 'CAQ8_06': 0, 'CAQ8_07': 0, 'CAQ8_08': 0}
        expected = {'committed_action_total': 24, 'values_persistence': 0, 'negative_committed_action_raw': 24}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_all_maximum(self):
        answers = {'CAQ8_01': 6, 'CAQ8_02': 6, 'CAQ8_03': 6, 'CAQ8_04': 6, 'CAQ8_05': 6, 'CAQ8_06': 6, 'CAQ8_07': 6, 'CAQ8_08': 6}
        expected = {'committed_action_total': 24, 'values_persistence': 24, 'negative_committed_action_raw': 0}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_all_midpoint(self):
        answers = {'CAQ8_01': 3, 'CAQ8_02': 3, 'CAQ8_03': 3, 'CAQ8_04': 3, 'CAQ8_05': 3, 'CAQ8_06': 3, 'CAQ8_07': 3, 'CAQ8_08': 3}
        expected = {'committed_action_total': 24, 'values_persistence': 12, 'negative_committed_action_raw': 12}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_mixed_pattern(self):
        answers = {'CAQ8_01': 0, 'CAQ8_02': 3, 'CAQ8_03': 6, 'CAQ8_04': 0, 'CAQ8_05': 3, 'CAQ8_06': 6, 'CAQ8_07': 0, 'CAQ8_08': 3}
        expected = {'committed_action_total': 21, 'values_persistence': 9, 'negative_committed_action_raw': 12}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_missing_first_item(self):
        answers = {'CAQ8_02': 3, 'CAQ8_03': 3, 'CAQ8_04': 3, 'CAQ8_05': 3, 'CAQ8_06': 3, 'CAQ8_07': 3, 'CAQ8_08': 3}
        expected = {'committed_action_total': None, 'values_persistence': None, 'negative_committed_action_raw': 12}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_all_missing(self):
        answers = {}
        expected = {'committed_action_total': None, 'values_persistence': None, 'negative_committed_action_raw': None}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

if __name__ == "__main__":
    unittest.main()
