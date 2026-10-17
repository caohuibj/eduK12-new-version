"""Pure fail-closed receipt contracts. No API, images, application or services run."""
import copy
import datetime
import hashlib
import importlib.util
from pathlib import Path
import stat
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('survey_candidate_reuse', Path(__file__).with_name('survey-candidate-reuse.py'))
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
NOW = datetime.datetime(2026, 10, 17, 11, 0, tzinfo=datetime.timezone.utc)
AT = '2026-10-17T10:47:04Z'


def source_fixture():
    run = {'id': r.SOURCE_RUN, 'repository': {'full_name': r.REPOSITORY}, 'head_repository': {'full_name': r.REPOSITORY}, 'event': 'pull_request', 'path': '.github/workflows/ci.yml', 'head_sha': r.SOURCE_HEAD, 'status': 'completed', 'conclusion': 'failure', 'created_at': AT, 'pull_requests': [{'number': r.PR_NUMBER, 'head': {'sha': r.SOURCE_HEAD}}]}
    job = {'id': r.SOURCE_JOB, 'run_id': r.SOURCE_RUN, 'name': 'survey-candidate / candidate', 'head_sha': r.SOURCE_HEAD, 'status': 'completed', 'conclusion': 'failure', 'completed_at': AT}
    artifact = {'id': 12098149475, 'name': 'survey-candidate-' + r.SOURCE_MERGE, 'workflow_run': {'id': r.SOURCE_RUN, 'head_sha': r.SOURCE_HEAD}, 'expired': False, 'created_at': AT, 'size_in_bytes': 1044554171, 'digest': 'sha256:a4fc034c58fb819d0caab0e49d733c02b6d0332119381902a23a706888a34226'}
    return run, job, artifact


class ReceiptTests(unittest.TestCase):
    def test_official_origin_does_not_qualify_failed_candidate(self):
        run, job, artifact = source_fixture()
        proof = r.validate_official_source(run, job, artifact, NOW)
        self.assertFalse(proof['wholeCandidateQualified'])
        self.assertEqual(proof['sourceHead'], r.SOURCE_HEAD)
        self.assertNotEqual(proof['sourceHead'], proof['mergeHead'])
        with self.assertRaises(r.ReuseRejected): r.require_candidate_success(job)

    def test_wrong_source_run_head_event_repository_or_pr_rejected(self):
        for mutate in [lambda d: d.update(id=1), lambda d: d.update(head_sha=r.SOURCE_MERGE), lambda d: d.update(event='push'), lambda d: d.update(repository={'full_name': 'other/repo'}), lambda d: d.update(head_repository={'full_name': 'fork/repo'}), lambda d: d.update(pull_requests=[]), lambda d: d.update(created_at='2026-10-15T00:00:00Z')]:
            run, job, artifact = source_fixture(); mutate(run)
            with self.assertRaises(r.ReuseRejected): r.validate_official_source(run, job, artifact, NOW)

    def test_artifact_identity_digest_expiry_and_job_skip_rejected(self):
        for mutate in [lambda d: d.update(name='other'), lambda d: d.update(digest='missing'), lambda d: d.update(expired=True), lambda d: d.update(workflow_run={'id': 1, 'head_sha': r.SOURCE_HEAD}), lambda d: d.update(size_in_bytes=0)]:
            run, job, artifact = source_fixture(); mutate(artifact)
            with self.assertRaises(r.ReuseRejected): r.validate_official_source(run, job, artifact, NOW)
        run, job, artifact = source_fixture(); job['conclusion'] = 'skipped'
        with self.assertRaises(r.ReuseRejected): r.validate_official_source(run, job, artifact, NOW)

    def test_only_unique_successful_phase_can_be_retained(self):
        phase = {'name': 'backend-compile', 'status': 'success', 'seconds': 12.5}
        self.assertEqual(r.require_success_phase({'phases': [phase]}, phase['name']), phase)
        for state in ['failure', 'skipped', 'running', None]:
            bad = dict(phase, status=state)
            with self.assertRaises(r.ReuseRejected): r.require_success_phase({'phases': [bad]}, phase['name'])
        for ledger in [[], [phase, phase], [dict(phase, seconds=-1)], [dict(phase, errorType='Error')]]:
            with self.assertRaises(r.ReuseRejected): r.require_success_phase({'phases': ledger}, phase['name'])

    def test_complete_test_report_rejects_fail_skip_missing_selection(self):
        selected = ['src/example.test.ts']
        report = {'success': True, 'numTotalTests': 1, 'numPassedTests': 1, 'testResults': [{'name': '/app/src/example.test.ts', 'status': 'passed', 'assertionResults': [{'status': 'passed'}]}]}
        self.assertTrue(r.validate_test_report(report, selected))
        for state in ['failed', 'pending', 'skipped']:
            bad = copy.deepcopy(report); bad['testResults'][0]['assertionResults'][0]['status'] = state
            with self.assertRaises(r.ReuseRejected): r.validate_test_report(bad, selected)
        with self.assertRaises(r.ReuseRejected): r.validate_test_report(report, ['src/missing.test.ts'])
        with self.assertRaises(r.ReuseRejected): r.validate_test_report(dict(report, numPendingTests=1), selected)

    def test_reviewed_transition_rejects_extra_product_change_and_unsafe_mode(self):
        verifier = 'a' * 40
        before = {'server-version/frontend/src/unchanged.ts': ('100644', 'blob', 'b' * 40)}
        after = dict(before)
        for path, values in r.REVIEWED_TRANSITIONS.items():
            if values['before'] is not None: before[path] = ('100644', 'blob', values['before'])
            after[path] = ('100644', 'blob', values['after'])
        after[r.SELF_PATH] = ('100644', 'blob', verifier)
        proof = r.validate_tree_transition(before, after, verifier)
        self.assertGreaterEqual(proof['unchangedGitObjects'], 1)
        for path, entry in [('server-version/frontend/src/unchanged.ts', ('100644', 'blob', 'c' * 40)), (r.SELF_PATH, ('120000', 'blob', verifier)), ('unexpected.ts', ('100644', 'blob', 'd' * 40))]:
            bad = dict(after); bad[path] = entry
            with self.assertRaises(r.ReuseRejected): r.validate_tree_transition(before, bad, verifier)

    def test_partial_resume_requires_exact_success_prefix_and_unexecuted_tail(self):
        _, job, _ = source_fixture()
        job['steps'] = [{'name': r.COMPILE_STEP, 'status': 'completed', 'conclusion': 'failure'}, *[{'name': name, 'status': 'completed', 'conclusion': 'skipped'} for name in r.DOWNSTREAM_STEPS], {'name': r.CLEANUP_STEP, 'status': 'completed', 'conclusion': 'success'}]
        proof = {'phases': [*[{'name': name, 'status': 'success', 'seconds': 1} for name in r.REUSED_PHASES], {'name': r.FAILED_PHASE, 'status': 'failure', 'errorType': 'CalledProcessError', 'seconds': 1}], 'privateBrowserMaterialRemoved': True, 'isolatedResourcesRemoved': True, 'cleanupErrors': [], 'builders': {'backend': 'sha256:' + 'a' * 64, 'frontend': 'sha256:' + 'b' * 64}, 'images': {'backend': 'sha256:' + 'c' * 64}, 'executionInputs': {'node': 'v24.21.0', 'runnerOS': 'Linux'}}
        self.assertEqual(r.validate_partial_candidate(job, proof), list(r.REUSED_PHASES))
        for mutation in ['failed_prefix', 'extra_phase', 'missing_phase', 'cleanup', 'extra_runtime', 'wrong_environment']:
            bad = copy.deepcopy(proof)
            if mutation == 'failed_prefix': bad['phases'][0]['status'] = 'failure'
            elif mutation == 'extra_phase': bad['phases'].append({'name': 'made-up-pass', 'status': 'success', 'seconds': 1})
            elif mutation == 'missing_phase': bad['phases'].pop(1)
            elif mutation == 'cleanup': bad['privateBrowserMaterialRemoved'] = False
            elif mutation == 'extra_runtime': bad['images']['frontend'] = 'sha256:' + 'd' * 64
            else: bad['executionInputs']['node'] = 'v24.19.0'
            with self.assertRaises(r.ReuseRejected): r.validate_partial_candidate(job, bad)
        for state in ['success', 'failure', None]:
            bad = copy.deepcopy(job); bad['steps'][1]['conclusion'] = state
            with self.assertRaises(r.ReuseRejected): r.validate_partial_candidate(bad, proof)
        bad = copy.deepcopy(job); bad['conclusion'] = 'success'
        with self.assertRaises(r.ReuseRejected): r.validate_partial_candidate(bad, proof)

    def test_scan_requires_exact_image_identity_and_no_high_critical(self):
        image = 'sha256:' + 'a' * 64
        scan = {'ArtifactType': 'container_image', 'ArtifactName': 'qualified:original', 'Metadata': {'ImageID': image}, 'Results': []}
        self.assertTrue(r.validate_runtime_scan(scan, image, 'qualified:original'))
        for bad in [dict(scan, ArtifactName='other:tag'), dict(scan, Metadata={'ImageID': 'sha256:' + 'b' * 64}), dict(scan, Results=[{'Vulnerabilities': [{'Severity': 'HIGH'}]}])]:
            with self.assertRaises(r.ReuseRejected): r.validate_runtime_scan(bad, image, 'qualified:original')

    def test_official_archive_digest_is_checked_from_bytes(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'fixture'; path.write_bytes(b'synthetic archive bytes')
            good = 'sha256:' + hashlib.sha256(path.read_bytes()).hexdigest()
            self.assertEqual(r.verify_official_digest(path, good), good)
            with self.assertRaises(r.ReuseRejected): r.verify_official_digest(path, 'sha256:' + '0' * 64)

    def test_zip_traversal_duplicate_symlink_and_chained_receipts_rejected(self):
        valid = [zipfile.ZipInfo('survey-candidate-plan.json'), zipfile.ZipInfo('survey-candidate-evidence/checks.json')]
        self.assertTrue(r.safe_zip_entries(valid))
        symlink = zipfile.ZipInfo('survey-candidate-evidence/link'); symlink.external_attr = (stat.S_IFLNK | 0o777) << 16
        for item in [zipfile.ZipInfo('../outside'), zipfile.ZipInfo('/absolute'), valid[0], symlink, zipfile.ZipInfo('survey-candidate-evidence/qualified-original-plan.json')]:
            with self.assertRaises(r.ReuseRejected): r.safe_zip_entries(valid + [item])


if __name__ == '__main__':
    unittest.main(verbosity=2)
