"""Tiny control contracts only; never invokes application checks or services."""
import importlib.util
import unittest
import json
import os
from pathlib import Path

path = Path(__file__).with_name('measurement-browser-ci.py')
spec = importlib.util.spec_from_file_location('measurement_ci', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ArtifactContract(unittest.TestCase):
    def setUp(self):
        self.plan = {'head': 'a' * 40, 'runId': '42', 'productInventorySha256': 'inventory'}
        self.receipt = {**self.plan, 'status': 'success', 'component': 'backend', 'componentTree': 'tree',
                        'lockfileSha256': 'lock', 'archiveSha256': 'archive', 'attempt': '1',
                        'buildFlags': {key: os.environ.get(key) for key in ['VITE_COGNITIVE_MODULE_ENABLED', 'TZ']}}

    def verify(self, receipt):
        module.validate_receipt(receipt, 'backend', self.plan, 'archive', 'tree', 'lock')

    def test_exact_prior_attempt_in_same_run_is_reusable(self):
        self.verify(self.receipt)

    def test_wrong_sha_run_tree_lock_content_or_failure_rejected(self):
        for key in ['head', 'runId', 'productInventorySha256', 'component', 'componentTree',
                    'lockfileSha256', 'archiveSha256', 'status']:
            with self.subTest(key=key), self.assertRaises(AssertionError):
                self.verify({**self.receipt, key: 'wrong'})

    def test_current_frozen_inventory_and_flags(self):
        binding = json.loads(path.with_name('measurement-browser-bindings.json').read_text())
        self.assertEqual(module.inventory('HEAD', binding['addedTools']), binding['productInventorySha256'])
        flags = {key: os.environ.get(key) for key in ['VITE_COGNITIVE_MODULE_ENABLED', 'TZ']}
        self.verify({**self.receipt, 'buildFlags': flags})
        with self.assertRaises(AssertionError):
            self.verify({**self.receipt, 'buildFlags': {**flags, 'TZ': 'wrong'}})

    def test_workflow_is_exact_branch_only_without_old_gate_changes(self):
        workflow = path.parents[1] / 'workflows/ci-measurement-browser.yml'
        text = workflow.read_text()
        self.assertIn('branches: [ci/measurement-browser-20261020]', text)
        self.assertNotIn('workflow_dispatch:', text)
        self.assertNotIn('pull_request:', text)
        self.assertNotIn('continue-on-error:', text)
        self.assertNotIn('npm test', text)
        self.assertIn("row['result'] == 'success'", text)


if __name__ == '__main__':
    unittest.main()
