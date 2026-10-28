# -*- coding: utf-8 -*-
"""AAQ-II golden 计分测试；期望值与 source.json goldenCases 一致。"""
import importlib.util, os, unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_SPEC = importlib.util.spec_from_file_location("scoring_under_test", os.path.join(_HERE, "scoring-aaq_ii7_zh_cn_research.py"))
scoring = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(scoring)


class ScoringTests(unittest.TestCase):
    def test_all_minimum(self):
        answers = {'AAQ2_01': 1, 'AAQ2_02': 1, 'AAQ2_03': 1, 'AAQ2_04': 1, 'AAQ2_05': 1, 'AAQ2_06': 1, 'AAQ2_07': 1}
        expected = {'total': 7}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_all_maximum(self):
        answers = {'AAQ2_01': 7, 'AAQ2_02': 7, 'AAQ2_03': 7, 'AAQ2_04': 7, 'AAQ2_05': 7, 'AAQ2_06': 7, 'AAQ2_07': 7}
        expected = {'total': 49}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_all_midpoint(self):
        answers = {'AAQ2_01': 4, 'AAQ2_02': 4, 'AAQ2_03': 4, 'AAQ2_04': 4, 'AAQ2_05': 4, 'AAQ2_06': 4, 'AAQ2_07': 4}
        expected = {'total': 28}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_mixed_pattern(self):
        answers = {'AAQ2_01': 1, 'AAQ2_02': 4, 'AAQ2_03': 7, 'AAQ2_04': 1, 'AAQ2_05': 4, 'AAQ2_06': 7, 'AAQ2_07': 1}
        expected = {'total': 25}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_missing_first_item(self):
        answers = {'AAQ2_02': 4, 'AAQ2_03': 4, 'AAQ2_04': 4, 'AAQ2_05': 4, 'AAQ2_06': 4, 'AAQ2_07': 4}
        expected = {'total': None}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_all_missing(self):
        answers = {}
        expected = {'total': None}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

if __name__ == "__main__":
    unittest.main()
