"""Receipt-admission controls only; no application or runtime execution."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).parent
spec = importlib.util.spec_from_file_location('reuse', ROOT / 'exact-candidate-runtime-reuse.py')
M = importlib.util.module_from_spec(spec)
spec.loader.exec_module(M)


class ReuseContracts(unittest.TestCase):
    def setUp(self):
        p = M.PIN
        self.run = dict(id=int(p['runId']), run_attempt=p['attempt'], head_sha=p['sourceHead'], head_branch='work/measurement-version-final-20261020', event='pull_request', path='.github/workflows/ci.yml', repository={'full_name': p['repository']}, head_repository={'full_name': p['repository']})
        self.job = dict(id=p['jobId'], run_id=int(p['runId']), run_attempt=p['attempt'], head_sha=p['sourceHead'], name=p['jobName'], status='completed', conclusion='failure')
        self.artifact = dict(id=p['artifactId'], name=p['artifactName'], expired=False, size_in_bytes=p['zipBytes'], digest='sha256:' + p['zipSha256'], workflow_run={'id': int(p['runId']), 'head_sha': p['sourceHead']})
        identity = {k: p[k] for k in ('head', 'sourceHead', 'tree', 'inputsSha256')}
        identity.update(consumerRunId=p['runId'], consumerAttempt=str(p['attempt']))
        self.result = dict(identity, status='failure', phases=[dict(identity, name=n, status='success') for n in M.PHASES] + [dict(name='schema-upgrade-restore', status='failure')])
        self.inputs = (ROOT / 'exact-candidate-runtime-inputs.json').read_bytes()
        self.source = (ROOT / 'exact-candidate-runtime.py').read_text()

    def check(self):
        raw = json.dumps(self.result).encode()
        with patch.dict(M.PIN, resultSha256=hashlib.sha256(raw).hexdigest()):
            return M.validate_records(self.run, self.job, self.artifact, raw, self.inputs, self.source)

    def test_only_three_exact_successes_preserve_original_failure_identity(self):
        selected = self.check()
        self.assertEqual(tuple(selected), M.PHASES)
        self.assertEqual(selected['changed-lint']['head'], M.PIN['head'])
        self.assertEqual(self.result['status'], 'failure')

    def test_failed_or_missing_selected_case_refused(self):
        self.result['phases'][0]['status'] = 'failure'
        with self.assertRaises(ValueError): self.check()

    def test_duplicate_phase_refused(self):
        self.result['phases'].append(copy.deepcopy(self.result['phases'][0]))
        with self.assertRaises(ValueError): self.check()

    def test_wrong_original_identity_refused(self):
        self.job['conclusion'] = 'success'
        with self.assertRaises(ValueError): self.check()

    def test_expired_or_changed_artifact_refused(self):
        self.artifact['expired'] = True
        with self.assertRaises(ValueError): self.check()

    def test_changed_inputs_and_implementation_refused(self):
        self.inputs += b' '
        with self.assertRaises(ValueError): self.check()
        self.inputs = (ROOT / 'exact-candidate-runtime-inputs.json').read_bytes()
        self.source = self.source.replace('def audit(self):', 'def audit(self):\n        pass')
        with self.assertRaises(ValueError): self.check()

    def test_image_retention_requires_successful_scans_not_whole_job_success(self):
        workflow = (ROOT.parent / 'workflows/ci-exact-candidate.yml').read_text()
        self.assertIn("if: always() && steps.retained-images.outputs.eligible == 'true'", workflow)
        self.assertIn("['runtime-packaging','runtime-scans']", workflow)
        self.assertIn('assert.equal(scan.imageId,image.runtimeImageId)', workflow)
        self.assertIn('assert.equal(hash.digest(\'hex\'),image.runtimeArchiveSha256)', workflow)


if __name__ == '__main__':
    unittest.main()
