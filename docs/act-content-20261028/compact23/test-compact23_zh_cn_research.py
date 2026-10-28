# -*- coding: utf-8 -*-
"""CompACT golden 计分测试；期望值与 source.json goldenCases 一致。"""
import importlib.util, os, unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_SPEC = importlib.util.spec_from_file_location("scoring_under_test", os.path.join(_HERE, "scoring-compact23_zh_cn_research.py"))
scoring = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(scoring)


class ScoringTests(unittest.TestCase):
    def test_all_minimum(self):
        answers = {'COMPACT_01': 0, 'COMPACT_02': 0, 'COMPACT_03': 0, 'COMPACT_04': 0, 'COMPACT_05': 0, 'COMPACT_06': 0, 'COMPACT_07': 0, 'COMPACT_08': 0, 'COMPACT_09': 0, 'COMPACT_10': 0, 'COMPACT_11': 0, 'COMPACT_12': 0, 'COMPACT_13': 0, 'COMPACT_14': 0, 'COMPACT_15': 0, 'COMPACT_16': 0, 'COMPACT_17': 0, 'COMPACT_18': 0, 'COMPACT_19': 0, 'COMPACT_20': 0, 'COMPACT_21': 0, 'COMPACT_22': 0, 'COMPACT_23': 0}
        expected = {'total': 72, 'openness_to_experience': 42, 'behavioural_awareness': 30, 'valued_action': 0}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_all_maximum(self):
        answers = {'COMPACT_01': 6, 'COMPACT_02': 6, 'COMPACT_03': 6, 'COMPACT_04': 6, 'COMPACT_05': 6, 'COMPACT_06': 6, 'COMPACT_07': 6, 'COMPACT_08': 6, 'COMPACT_09': 6, 'COMPACT_10': 6, 'COMPACT_11': 6, 'COMPACT_12': 6, 'COMPACT_13': 6, 'COMPACT_14': 6, 'COMPACT_15': 6, 'COMPACT_16': 6, 'COMPACT_17': 6, 'COMPACT_18': 6, 'COMPACT_19': 6, 'COMPACT_20': 6, 'COMPACT_21': 6, 'COMPACT_22': 6, 'COMPACT_23': 6}
        expected = {'total': 66, 'openness_to_experience': 18, 'behavioural_awareness': 0, 'valued_action': 48}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_all_midpoint(self):
        answers = {'COMPACT_01': 3, 'COMPACT_02': 3, 'COMPACT_03': 3, 'COMPACT_04': 3, 'COMPACT_05': 3, 'COMPACT_06': 3, 'COMPACT_07': 3, 'COMPACT_08': 3, 'COMPACT_09': 3, 'COMPACT_10': 3, 'COMPACT_11': 3, 'COMPACT_12': 3, 'COMPACT_13': 3, 'COMPACT_14': 3, 'COMPACT_15': 3, 'COMPACT_16': 3, 'COMPACT_17': 3, 'COMPACT_18': 3, 'COMPACT_19': 3, 'COMPACT_20': 3, 'COMPACT_21': 3, 'COMPACT_22': 3, 'COMPACT_23': 3}
        expected = {'total': 69, 'openness_to_experience': 30, 'behavioural_awareness': 15, 'valued_action': 24}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_mixed_pattern(self):
        answers = {'COMPACT_01': 0, 'COMPACT_02': 3, 'COMPACT_03': 6, 'COMPACT_04': 0, 'COMPACT_05': 3, 'COMPACT_06': 6, 'COMPACT_07': 0, 'COMPACT_08': 3, 'COMPACT_09': 6, 'COMPACT_10': 0, 'COMPACT_11': 3, 'COMPACT_12': 6, 'COMPACT_13': 0, 'COMPACT_14': 3, 'COMPACT_15': 6, 'COMPACT_16': 0, 'COMPACT_17': 3, 'COMPACT_18': 6, 'COMPACT_19': 0, 'COMPACT_20': 3, 'COMPACT_21': 6, 'COMPACT_22': 0, 'COMPACT_23': 3}
        expected = {'total': 48, 'openness_to_experience': 18, 'behavioural_awareness': 12, 'valued_action': 18}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_missing_first_item(self):
        answers = {'COMPACT_02': 3, 'COMPACT_03': 3, 'COMPACT_04': 3, 'COMPACT_05': 3, 'COMPACT_06': 3, 'COMPACT_07': 3, 'COMPACT_08': 3, 'COMPACT_09': 3, 'COMPACT_10': 3, 'COMPACT_11': 3, 'COMPACT_12': 3, 'COMPACT_13': 3, 'COMPACT_14': 3, 'COMPACT_15': 3, 'COMPACT_16': 3, 'COMPACT_17': 3, 'COMPACT_18': 3, 'COMPACT_19': 3, 'COMPACT_20': 3, 'COMPACT_21': 3, 'COMPACT_22': 3, 'COMPACT_23': 3}
        expected = {'total': None, 'openness_to_experience': 30, 'behavioural_awareness': 15, 'valued_action': None}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_all_missing(self):
        answers = {}
        expected = {'total': None, 'openness_to_experience': None, 'behavioural_awareness': None, 'valued_action': None}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

if __name__ == "__main__":
    unittest.main()
