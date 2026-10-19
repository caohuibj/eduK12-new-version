"""Offline refusal contracts only; never executes application checks or Docker."""
import copy
import importlib.util
import os
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('candidate', Path(__file__).with_name('survey-mac-ui-candidate.py'))
candidate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(candidate)


class QualificationRefusals(unittest.TestCase):
    def setUp(self):
        self.selection = {'frontendTests': ['src/survey/SurveyAnalyticsWorkspace.recovery.test.tsx'], 'requiredRecoveryCases': ['numeric/date/non-JSON', 'explicit recovery']}
        self.report = {'success': True, 'numTotalTests': 2, 'numFailedTests': 0, 'numPendingTests': 0,
                       'testResults': [{'name': '/app/src/survey/SurveyAnalyticsWorkspace.recovery.test.tsx', 'status': 'passed',
                                        'assertionResults': [{'title': t, 'status': 'passed'} for t in self.selection['requiredRecoveryCases']]}]}
        self.plan = {k: k for k in ['head', 'sourceHead', 'tree', 'frontendTree', 'inputs']}
        self.build = dict(self.plan, status='success', runId=os.environ.get('GITHUB_RUN_ID', 'unit-only'), attempt=int(os.environ.get('GITHUB_RUN_ATTEMPT', '1')),
                          images={k: {'id': 'sha256:' + 'a' * 64, 'sha256': 'b' * 64} for k in ['builder', 'runtime']})

    def test_complete_report_and_build(self):
        candidate.validate_report(self.report, self.selection)
        candidate.validate_build(self.build, self.plan)

    def test_empty_failure_pending_todo(self):
        for key, value in [('success', False), ('numTotalTests', 0), ('numFailedTests', 1), ('numPendingTests', 1), ('numTodoTests', 1), ('testResults', [])]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                report = copy.deepcopy(self.report)
                report[key] = value
                candidate.validate_report(report, self.selection)

    def test_missing_case_module_duplicate_and_skip(self):
        for change in ['case', 'module', 'duplicate', 'skipped', 'failed', 'todo']:
            report = copy.deepcopy(self.report)
            if change == 'case': report['testResults'][0]['assertionResults'].pop()
            elif change == 'module': report['testResults'][0]['name'] = '/app/unknown.test.tsx'
            elif change == 'duplicate': report['testResults'] *= 2
            else: report['testResults'][0]['assertionResults'][0]['status'] = change
            with self.subTest(change=change), self.assertRaises(ValueError):
                candidate.validate_report(report, self.selection)

    def test_build_wrong_source_checkout_tree_input_or_failure(self):
        for key in [*self.plan, 'status', 'images']:
            build = copy.deepcopy(self.build)
            build[key] = {} if key == 'images' else 'wrong'
            with self.subTest(key=key), self.assertRaises(ValueError):
                candidate.validate_build(build, self.plan)


if __name__ == '__main__':
    unittest.main()
