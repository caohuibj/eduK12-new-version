# -*- coding: utf-8 -*-
"""AFQ-Y golden 计分测试；期望值与 source.json goldenCases 一致。"""
import importlib.util, os, unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_SPEC = importlib.util.spec_from_file_location("scoring_under_test", os.path.join(_HERE, "scoring-afq_y17_zh_cn_research.py"))
scoring = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(scoring)


class ScoringTests(unittest.TestCase):
    def test_all_minimum(self):
        answers = {'AFQY_01': 0, 'AFQY_02': 0, 'AFQY_03': 0, 'AFQY_04': 0, 'AFQY_05': 0, 'AFQY_06': 0, 'AFQY_07': 0, 'AFQY_08': 0, 'AFQY_09': 0, 'AFQY_10': 0, 'AFQY_11': 0, 'AFQY_12': 0, 'AFQY_13': 0, 'AFQY_14': 0, 'AFQY_15': 0, 'AFQY_16': 0, 'AFQY_17': 0}
        expected = {'total': 0}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_all_maximum(self):
        answers = {'AFQY_01': 4, 'AFQY_02': 4, 'AFQY_03': 4, 'AFQY_04': 4, 'AFQY_05': 4, 'AFQY_06': 4, 'AFQY_07': 4, 'AFQY_08': 4, 'AFQY_09': 4, 'AFQY_10': 4, 'AFQY_11': 4, 'AFQY_12': 4, 'AFQY_13': 4, 'AFQY_14': 4, 'AFQY_15': 4, 'AFQY_16': 4, 'AFQY_17': 4}
        expected = {'total': 68}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_all_midpoint(self):
        answers = {'AFQY_01': 2, 'AFQY_02': 2, 'AFQY_03': 2, 'AFQY_04': 2, 'AFQY_05': 2, 'AFQY_06': 2, 'AFQY_07': 2, 'AFQY_08': 2, 'AFQY_09': 2, 'AFQY_10': 2, 'AFQY_11': 2, 'AFQY_12': 2, 'AFQY_13': 2, 'AFQY_14': 2, 'AFQY_15': 2, 'AFQY_16': 2, 'AFQY_17': 2}
        expected = {'total': 34}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_mixed_pattern(self):
        answers = {'AFQY_01': 0, 'AFQY_02': 2, 'AFQY_03': 4, 'AFQY_04': 0, 'AFQY_05': 2, 'AFQY_06': 4, 'AFQY_07': 0, 'AFQY_08': 2, 'AFQY_09': 4, 'AFQY_10': 0, 'AFQY_11': 2, 'AFQY_12': 4, 'AFQY_13': 0, 'AFQY_14': 2, 'AFQY_15': 4, 'AFQY_16': 0, 'AFQY_17': 2}
        expected = {'total': 32}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_missing_first_item(self):
        answers = {'AFQY_02': 2, 'AFQY_03': 2, 'AFQY_04': 2, 'AFQY_05': 2, 'AFQY_06': 2, 'AFQY_07': 2, 'AFQY_08': 2, 'AFQY_09': 2, 'AFQY_10': 2, 'AFQY_11': 2, 'AFQY_12': 2, 'AFQY_13': 2, 'AFQY_14': 2, 'AFQY_15': 2, 'AFQY_16': 2, 'AFQY_17': 2}
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
