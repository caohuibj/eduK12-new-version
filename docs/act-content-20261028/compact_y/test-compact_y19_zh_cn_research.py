# -*- coding: utf-8 -*-
"""CompACT-Y golden 计分测试；期望值与 source.json goldenCases 一致。"""
import importlib.util, os, unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_SPEC = importlib.util.spec_from_file_location("scoring_under_test", os.path.join(_HERE, "scoring-compact_y19_zh_cn_research.py"))
scoring = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(scoring)


class ScoringTests(unittest.TestCase):
    def test_all_minimum(self):
        answers = {'CY_01': 0, 'CY_02': 0, 'CY_03': 0, 'CY_04': 0, 'CY_05': 0, 'CY_06': 0, 'CY_07': 0, 'CY_08': 0, 'CY_09': 0, 'CY_10': 0, 'CY_11': 0, 'CY_12': 0, 'CY_13': 0, 'CY_14': 0, 'CY_15': 0, 'CY_16': 0, 'CY_17': 0, 'CY_18': 0, 'CY_19': 0}
        expected = {'total': 66, 'valued_action': 0, 'openness_to_experience': 36, 'behavioural_awareness': 30}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_all_maximum(self):
        answers = {'CY_01': 6, 'CY_02': 6, 'CY_03': 6, 'CY_04': 6, 'CY_05': 6, 'CY_06': 6, 'CY_07': 6, 'CY_08': 6, 'CY_09': 6, 'CY_10': 6, 'CY_11': 6, 'CY_12': 6, 'CY_13': 6, 'CY_14': 6, 'CY_15': 6, 'CY_16': 6, 'CY_17': 6, 'CY_18': 6, 'CY_19': 6}
        expected = {'total': 48, 'valued_action': 48, 'openness_to_experience': 0, 'behavioural_awareness': 0}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_all_midpoint(self):
        answers = {'CY_01': 3, 'CY_02': 3, 'CY_03': 3, 'CY_04': 3, 'CY_05': 3, 'CY_06': 3, 'CY_07': 3, 'CY_08': 3, 'CY_09': 3, 'CY_10': 3, 'CY_11': 3, 'CY_12': 3, 'CY_13': 3, 'CY_14': 3, 'CY_15': 3, 'CY_16': 3, 'CY_17': 3, 'CY_18': 3, 'CY_19': 3}
        expected = {'total': 57, 'valued_action': 24, 'openness_to_experience': 18, 'behavioural_awareness': 15}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_mixed_pattern(self):
        answers = {'CY_01': 0, 'CY_02': 3, 'CY_03': 6, 'CY_04': 0, 'CY_05': 3, 'CY_06': 6, 'CY_07': 0, 'CY_08': 3, 'CY_09': 6, 'CY_10': 0, 'CY_11': 3, 'CY_12': 6, 'CY_13': 0, 'CY_14': 3, 'CY_15': 6, 'CY_16': 0, 'CY_17': 3, 'CY_18': 6, 'CY_19': 0}
        expected = {'total': 24, 'valued_action': 6, 'openness_to_experience': 18, 'behavioural_awareness': 0}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_missing_first_item(self):
        answers = {'CY_02': 3, 'CY_03': 3, 'CY_04': 3, 'CY_05': 3, 'CY_06': 3, 'CY_07': 3, 'CY_08': 3, 'CY_09': 3, 'CY_10': 3, 'CY_11': 3, 'CY_12': 3, 'CY_13': 3, 'CY_14': 3, 'CY_15': 3, 'CY_16': 3, 'CY_17': 3, 'CY_18': 3, 'CY_19': 3}
        expected = {'total': None, 'valued_action': None, 'openness_to_experience': 18, 'behavioural_awareness': 15}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_all_missing(self):
        answers = {}
        expected = {'total': None, 'valued_action': None, 'openness_to_experience': None, 'behavioural_awareness': None}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

if __name__ == "__main__":
    unittest.main()
