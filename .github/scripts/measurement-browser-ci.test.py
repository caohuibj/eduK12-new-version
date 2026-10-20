"""Tiny control contracts only; never invokes application checks or services."""
import importlib.util
import unittest
import json
import os
from unittest.mock import patch
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


class FixedBuildAdmission(unittest.TestCase):
    def test_original_success_and_exact_ids_required(self):
        binding = json.loads(path.with_name('measurement-browser-bindings.json').read_text())
        source = binding['fixedBuildSource']; pin = source['components']['backend']
        run = {'id': int(source['runId']), 'run_attempt': 1, 'head_sha': source['head'], 'head_branch': source['branch'],
               'event': 'push', 'path': source['workflowPath'], 'status': 'completed', 'conclusion': 'failure'}
        job = {'run_id': int(source['runId']), 'run_attempt': 1, 'head_sha': source['head'], 'conclusion': 'success',
               'name': 'production compile once / backend'}
        artifact = {'id': pin['artifactId'], 'expired': False,
                    'name': f"measurement-{source['runId']}-{source['head']}-backend-build",
                    'size_in_bytes': pin['zipBytes'], 'digest': 'sha256:' + pin['zipSha256'],
                    'workflow_run': {'id': int(source['runId']), 'head_sha': source['head']}}
        with patch.object(module, 'scope', return_value={}), patch.object(module, 'fixed_inputs', return_value=(source, pin)), patch.object(module, 'write'):
            with patch.object(module, 'api', side_effect=[run, job, artifact]):
                module.admit('backend')  # A failed run never becomes success; only its genuine successful build is usable.
            for changed in [{**job, 'conclusion': 'failure'}, {**job, 'run_attempt': 2}, {**job, 'head_sha': 'wrong'}]:
                with patch.object(module, 'api', side_effect=[run, changed, artifact]), self.assertRaises(AssertionError):
                    module.admit('backend')
            for changed in [{**artifact, 'expired': True}, {**artifact, 'digest': 'wrong'}, {**artifact, 'id': 0}]:
                with patch.object(module, 'api', side_effect=[run, job, changed]), self.assertRaises(AssertionError):
                    module.admit('backend')

    def test_changed_production_or_unreviewed_fixture_rejected(self):
        binding = json.loads(path.with_name('measurement-browser-bindings.json').read_text())
        source = binding['fixedBuildSource']; pin = source['components']['backend']
        with patch.object(module, 'git', return_value='unreviewed'), self.assertRaises(AssertionError):
            module.fixed_inputs('backend')
        with patch.object(module, 'git', return_value=source['fixtureRepair']['after']), patch.object(module, 'production_inputs', return_value='changed'), self.assertRaises(AssertionError):
            module.fixed_inputs('backend')

    def test_workflow_has_no_rebuild_fallback(self):
        text = (path.parents[1] / 'workflows/ci-measurement-browser.yml').read_text()
        self.assertNotIn('  build:', text)
        self.assertNotIn('npm ci', text)
        self.assertNotIn('ci.py build', text)
        self.assertIn('needs: [scope, reuse, admin, browser]', text)
        source, pin = module.fixed_inputs('frontend')
        self.assertEqual(source['runId'], '39399331312')
        self.assertEqual(module.git('rev-parse', 'HEAD:server-version/frontend'), pin['componentTree'])


class FixedAdminAdmission(unittest.TestCase):
    def test_exact_success_and_complete_admin_checks(self):
        binding = json.loads(path.with_name('measurement-browser-bindings.json').read_text())
        pin = binding['fixedAdminSource']
        result = {'head': pin['head'], 'status': 'PASS', 'selectedPhase': 'admin', 'pageErrors': [], 'blockedExternalRequests': [],
                  'checks': [{'name': name, 'status': 'PASS'} for name in pin['requiredChecks']]}
        module.validate_admin_result(result, pin)
        for changed in [{**result, 'status': 'FAIL'}, {**result, 'head': 'wrong'}, {**result, 'selectedPhase': 'journeys'},
                        {**result, 'checks': result['checks'][:-1]}, {**result, 'checks': [result['checks'][0]] * 10}, {**result, 'pageErrors': ['error']}]:
            with self.assertRaises(AssertionError): module.validate_admin_result(changed, pin)
        with self.assertRaises(AssertionError):
            module.validate_admin_result({**result, 'checks': [{**row, 'status': 'SKIPPED'} for row in result['checks']]}, pin)

    def test_changed_admin_fixture_success_path_rejected(self):
        original_read = Path.read_text
        def altered(file, *args, **kwargs):
            text = original_read(file, *args, **kwargs)
            if file.name == 'measurement-browser-fixture.ts':
                return text.replace("const phase = process.argv[2] || 'seed'", "const phase = 'grant'")
            return text
        with patch.object(Path, 'read_text', altered), self.assertRaises(AssertionError):
            module.admin_inputs()

    def test_admin_inputs_unchanged_and_only_journeys_executes(self):
        module.admin_inputs()
        with patch.object(module, 'fixed_inputs'), patch.object(module, 'git', return_value='changed'), self.assertRaises(AssertionError):
            module.admin_inputs()
        workflow = (path.parents[1] / 'workflows/ci-measurement-browser.yml').read_text()
        self.assertIn('phase: [journeys]', workflow)
        self.assertNotIn('phase: [admin, journeys]', workflow)
        self.assertIn('ci.py admit-admin', workflow)
        self.assertIn('needs: [scope, reuse, admin, browser]', workflow)


if __name__ == '__main__':
    unittest.main()
