# -*- coding: utf-8 -*-
"""CAMM golden 计分测试；期望值与 source.json goldenCases 一致。"""
import importlib.util, os, unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_SPEC = importlib.util.spec_from_file_location("scoring_under_test", os.path.join(_HERE, "scoring-camm10_zh_cn_research.py"))
scoring = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(scoring)


class ScoringTests(unittest.TestCase):
    def test_all_minimum(self):
        answers = {'CAMM_01': 0, 'CAMM_02': 0, 'CAMM_03': 0, 'CAMM_04': 0, 'CAMM_05': 0, 'CAMM_06': 0, 'CAMM_07': 0, 'CAMM_08': 0, 'CAMM_09': 0, 'CAMM_10': 0}
        expected = {'total': 40}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_all_maximum(self):
        answers = {'CAMM_01': 4, 'CAMM_02': 4, 'CAMM_03': 4, 'CAMM_04': 4, 'CAMM_05': 4, 'CAMM_06': 4, 'CAMM_07': 4, 'CAMM_08': 4, 'CAMM_09': 4, 'CAMM_10': 4}
        expected = {'total': 0}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_all_midpoint(self):
        answers = {'CAMM_01': 2, 'CAMM_02': 2, 'CAMM_03': 2, 'CAMM_04': 2, 'CAMM_05': 2, 'CAMM_06': 2, 'CAMM_07': 2, 'CAMM_08': 2, 'CAMM_09': 2, 'CAMM_10': 2}
        expected = {'total': 20}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_mixed_pattern(self):
        answers = {'CAMM_01': 0, 'CAMM_02': 2, 'CAMM_03': 4, 'CAMM_04': 0, 'CAMM_05': 2, 'CAMM_06': 4, 'CAMM_07': 0, 'CAMM_08': 2, 'CAMM_09': 4, 'CAMM_10': 0}
        expected = {'total': 22}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_missing_first_item(self):
        answers = {'CAMM_02': 2, 'CAMM_03': 2, 'CAMM_04': 2, 'CAMM_05': 2, 'CAMM_06': 2, 'CAMM_07': 2, 'CAMM_08': 2, 'CAMM_09': 2, 'CAMM_10': 2}
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
