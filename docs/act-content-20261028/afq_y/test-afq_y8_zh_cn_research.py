# -*- coding: utf-8 -*-
"""AFQ-Y8 golden 计分测试；期望值与 source.json goldenCases 一致。"""
import importlib.util, os, unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_SPEC = importlib.util.spec_from_file_location("scoring_under_test", os.path.join(_HERE, "scoring-afq_y8_zh_cn_research.py"))
scoring = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(scoring)


class ScoringTests(unittest.TestCase):
    def test_all_minimum(self):
        answers = {'AFQY8_01': 0, 'AFQY8_02': 0, 'AFQY8_03': 0, 'AFQY8_04': 0, 'AFQY8_05': 0, 'AFQY8_06': 0, 'AFQY8_07': 0, 'AFQY8_08': 0}
        expected = {'total': 0}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_all_maximum(self):
        answers = {'AFQY8_01': 4, 'AFQY8_02': 4, 'AFQY8_03': 4, 'AFQY8_04': 4, 'AFQY8_05': 4, 'AFQY8_06': 4, 'AFQY8_07': 4, 'AFQY8_08': 4}
        expected = {'total': 32}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_all_midpoint(self):
        answers = {'AFQY8_01': 2, 'AFQY8_02': 2, 'AFQY8_03': 2, 'AFQY8_04': 2, 'AFQY8_05': 2, 'AFQY8_06': 2, 'AFQY8_07': 2, 'AFQY8_08': 2}
        expected = {'total': 16}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_mixed_pattern(self):
        answers = {'AFQY8_01': 0, 'AFQY8_02': 2, 'AFQY8_03': 4, 'AFQY8_04': 0, 'AFQY8_05': 2, 'AFQY8_06': 4, 'AFQY8_07': 0, 'AFQY8_08': 2}
        expected = {'total': 14}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_missing_first_item(self):
        answers = {'AFQY8_02': 2, 'AFQY8_03': 2, 'AFQY8_04': 2, 'AFQY8_05': 2, 'AFQY8_06': 2, 'AFQY8_07': 2, 'AFQY8_08': 2}
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
