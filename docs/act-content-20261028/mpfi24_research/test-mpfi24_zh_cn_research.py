# -*- coding: utf-8 -*-
"""MPFI-24 golden 计分测试；期望值与 source.json goldenCases 一致。"""
import importlib.util, os, unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_SPEC = importlib.util.spec_from_file_location("scoring_under_test", os.path.join(_HERE, "scoring-mpfi24_zh_cn_research.py"))
scoring = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(scoring)


class ScoringTests(unittest.TestCase):
    def test_all_minimum(self):
        answers = {'MPFI24_01': 1, 'MPFI24_02': 1, 'MPFI24_03': 1, 'MPFI24_04': 1, 'MPFI24_05': 1, 'MPFI24_06': 1, 'MPFI24_07': 1, 'MPFI24_08': 1, 'MPFI24_09': 1, 'MPFI24_10': 1, 'MPFI24_11': 1, 'MPFI24_12': 1, 'MPFI24_13': 1, 'MPFI24_14': 1, 'MPFI24_15': 1, 'MPFI24_16': 1, 'MPFI24_17': 1, 'MPFI24_18': 1, 'MPFI24_19': 1, 'MPFI24_20': 1, 'MPFI24_21': 1, 'MPFI24_22': 1, 'MPFI24_23': 1, 'MPFI24_24': 1}
        expected = {'acceptance': 1.0, 'present_moment': 1.0, 'self_as_context': 1.0, 'defusion': 1.0, 'values': 1.0, 'committed_action': 1.0, 'experiential_avoidance': 1.0, 'lack_of_contact_present_moment': 1.0, 'self_as_content': 1.0, 'fusion': 1.0, 'lack_of_contact_values': 1.0, 'inaction': 1.0, 'flexibility_composite': 1.0, 'inflexibility_composite': 1.0}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_all_maximum(self):
        answers = {'MPFI24_01': 6, 'MPFI24_02': 6, 'MPFI24_03': 6, 'MPFI24_04': 6, 'MPFI24_05': 6, 'MPFI24_06': 6, 'MPFI24_07': 6, 'MPFI24_08': 6, 'MPFI24_09': 6, 'MPFI24_10': 6, 'MPFI24_11': 6, 'MPFI24_12': 6, 'MPFI24_13': 6, 'MPFI24_14': 6, 'MPFI24_15': 6, 'MPFI24_16': 6, 'MPFI24_17': 6, 'MPFI24_18': 6, 'MPFI24_19': 6, 'MPFI24_20': 6, 'MPFI24_21': 6, 'MPFI24_22': 6, 'MPFI24_23': 6, 'MPFI24_24': 6}
        expected = {'acceptance': 6.0, 'present_moment': 6.0, 'self_as_context': 6.0, 'defusion': 6.0, 'values': 6.0, 'committed_action': 6.0, 'experiential_avoidance': 6.0, 'lack_of_contact_present_moment': 6.0, 'self_as_content': 6.0, 'fusion': 6.0, 'lack_of_contact_values': 6.0, 'inaction': 6.0, 'flexibility_composite': 6.0, 'inflexibility_composite': 6.0}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_all_midpoint(self):
        answers = {'MPFI24_01': 4, 'MPFI24_02': 4, 'MPFI24_03': 4, 'MPFI24_04': 4, 'MPFI24_05': 4, 'MPFI24_06': 4, 'MPFI24_07': 4, 'MPFI24_08': 4, 'MPFI24_09': 4, 'MPFI24_10': 4, 'MPFI24_11': 4, 'MPFI24_12': 4, 'MPFI24_13': 4, 'MPFI24_14': 4, 'MPFI24_15': 4, 'MPFI24_16': 4, 'MPFI24_17': 4, 'MPFI24_18': 4, 'MPFI24_19': 4, 'MPFI24_20': 4, 'MPFI24_21': 4, 'MPFI24_22': 4, 'MPFI24_23': 4, 'MPFI24_24': 4}
        expected = {'acceptance': 4.0, 'present_moment': 4.0, 'self_as_context': 4.0, 'defusion': 4.0, 'values': 4.0, 'committed_action': 4.0, 'experiential_avoidance': 4.0, 'lack_of_contact_present_moment': 4.0, 'self_as_content': 4.0, 'fusion': 4.0, 'lack_of_contact_values': 4.0, 'inaction': 4.0, 'flexibility_composite': 4.0, 'inflexibility_composite': 4.0}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_mixed_pattern(self):
        answers = {'MPFI24_01': 1, 'MPFI24_02': 4, 'MPFI24_03': 6, 'MPFI24_04': 1, 'MPFI24_05': 4, 'MPFI24_06': 6, 'MPFI24_07': 1, 'MPFI24_08': 4, 'MPFI24_09': 6, 'MPFI24_10': 1, 'MPFI24_11': 4, 'MPFI24_12': 6, 'MPFI24_13': 1, 'MPFI24_14': 4, 'MPFI24_15': 6, 'MPFI24_16': 1, 'MPFI24_17': 4, 'MPFI24_18': 6, 'MPFI24_19': 1, 'MPFI24_20': 4, 'MPFI24_21': 6, 'MPFI24_22': 1, 'MPFI24_23': 4, 'MPFI24_24': 6}
        expected = {'acceptance': 2.5, 'present_moment': 3.5, 'self_as_context': 5.0, 'defusion': 2.5, 'values': 3.5, 'committed_action': 5.0, 'experiential_avoidance': 2.5, 'lack_of_contact_present_moment': 3.5, 'self_as_content': 5.0, 'fusion': 2.5, 'lack_of_contact_values': 3.5, 'inaction': 5.0, 'flexibility_composite': 3.6666666666666665, 'inflexibility_composite': 3.6666666666666665}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_missing_first_item(self):
        answers = {'MPFI24_02': 4, 'MPFI24_03': 4, 'MPFI24_04': 4, 'MPFI24_05': 4, 'MPFI24_06': 4, 'MPFI24_07': 4, 'MPFI24_08': 4, 'MPFI24_09': 4, 'MPFI24_10': 4, 'MPFI24_11': 4, 'MPFI24_12': 4, 'MPFI24_13': 4, 'MPFI24_14': 4, 'MPFI24_15': 4, 'MPFI24_16': 4, 'MPFI24_17': 4, 'MPFI24_18': 4, 'MPFI24_19': 4, 'MPFI24_20': 4, 'MPFI24_21': 4, 'MPFI24_22': 4, 'MPFI24_23': 4, 'MPFI24_24': 4}
        expected = {'acceptance': None, 'present_moment': 4.0, 'self_as_context': 4.0, 'defusion': 4.0, 'values': 4.0, 'committed_action': 4.0, 'experiential_avoidance': 4.0, 'lack_of_contact_present_moment': 4.0, 'self_as_content': 4.0, 'fusion': 4.0, 'lack_of_contact_values': 4.0, 'inaction': 4.0, 'flexibility_composite': None, 'inflexibility_composite': 4.0}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

    def test_all_missing(self):
        answers = {}
        expected = {'acceptance': None, 'present_moment': None, 'self_as_context': None, 'defusion': None, 'values': None, 'committed_action': None, 'experiential_avoidance': None, 'lack_of_contact_present_moment': None, 'self_as_content': None, 'fusion': None, 'lack_of_contact_values': None, 'inaction': None, 'flexibility_composite': None, 'inflexibility_composite': None}
        got = scoring.compute(answers)
        for key, want in expected.items():
            self.assertEqual(got[key], want, key)

if __name__ == "__main__":
    unittest.main()
