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
    run = {'id': r.SOURCE_RUN, 'repository': {'full_name': r.REPOSITORY}, 'head_repository': {'full_name': r.REPOSITORY}, 'event': 'pull_request', 'path': '.github/workflows/ci.yml', 'head_sha': r.SOURCE_HEAD, 'status': 'completed', 'conclusion': 'failure', 'created_at': AT, 'pull_requests': [{'number': r.PR_NUMBER, 'head': {'sha': r.SOURCE_HEAD, 'ref': 'fix/survey-storage-export-roundtrip-20261017', 'repo': {'id': 1338215995}}, 'base': {'ref': 'main', 'sha': '21c1778a545c1988bef65900789c701208b647e5', 'repo': {'id': 1338215995}}}]}
    job = {'id': r.SOURCE_JOB, 'run_id': r.SOURCE_RUN, 'name': 'survey-candidate / candidate', 'head_sha': r.SOURCE_HEAD, 'status': 'completed', 'conclusion': 'failure', 'completed_at': AT}
    artifact = {'id': 12098149475, 'name': 'survey-candidate-' + r.SOURCE_MERGE, 'workflow_run': {'id': r.SOURCE_RUN, 'head_sha': r.SOURCE_HEAD}, 'expired': False, 'created_at': AT, 'size_in_bytes': 1044554171, 'digest': 'sha256:a4fc034c58fb819d0caab0e49d733c02b6d0332119381902a23a706888a34226'}
    return run, job, artifact


def repair_job_fixture():
    origin = r.ORIGIN_B
    job = {'id': origin['job'], 'run_id': origin['run'], 'head_sha': origin['head'], 'status': 'completed', 'conclusion': 'failure', 'steps': [*[{'name': name, 'status': 'completed', 'conclusion': 'success'} for name in r.B_REQUIRED_SUCCESS_STEPS], {'name': r.DOWNSTREAM_STEPS[-1], 'status': 'completed', 'conclusion': 'failure'}, *[{'name': 'Run actions/upload-artifact@v4', 'status': 'completed', 'conclusion': 'success'} for _ in range(2)]]}
    proof = {'head': origin['merge'], 'sourceHead': origin['head'], 'tree': origin['tree'], 'phases': [*[{'name': name, 'status': 'success', 'seconds': 1} for name in r.B_SUCCESS_PHASES], {'name': r.B_FAILED_PHASE, 'status': 'failure', 'errorType': 'CalledProcessError', 'seconds': 1}], 'privateBrowserMaterialRemoved': True, 'isolatedResourcesRemoved': True, 'cleanupErrors': [], 'builders': {'backend': 'sha256:' + 'a' * 64, 'frontend': 'sha256:' + 'b' * 64}, 'images': {'backend': 'sha256:' + 'c' * 64, 'frontend': 'sha256:' + 'd' * 64}, 'executionInputs': {'node': 'v24.21.0', 'docker': '28.0.4', 'runnerOS': 'Linux', 'workflow': r.REVIEWED_TRANSITIONS['.github/workflows/ci-survey-candidate.yml']['after'], 'executor': r.REVIEWED_TRANSITIONS['.github/scripts/survey-candidate.py']['after'], 'environmentSha256': 'bc50178d55dd2f5cdb9564a5ba742ab6cb786f5e4e42ccfbc10d5d95aaf4fa31'}}
    return job, proof


def repair_reports_fixture():
    _, checks = repair_job_fixture()
    plan = {'backendTests': ['src/backend-' + str(n) + '.test.ts' for n in range(16)], 'frontendTests': [*r.REPAIR_TESTS, *['src/stable-' + str(n) + '.test.ts' for n in range(13)]]}
    def tests(names, counts):
        return {'success': True, 'numTotalTests': sum(counts), 'numPassedTests': sum(counts), 'numFailedTests': 0, 'numPendingTests': 0, 'testResults': [{'name': '/app/' + name, 'status': 'passed', 'assertionResults': [{'status': 'passed'} for _ in range(count)]} for name, count in zip(names, counts)]}
    def probe(count): return {'status': 'pass', 'checks': [{'name': 'synthetic check ' + str(n), 'pass': True} for n in range(count)]}
    reports = {'backend-tests.json': tests(plan['backendTests'], [117, *([1] * 15)]), 'frontend-tests.json': tests(plan['frontendTests'], [7, 3, 20, 124, *([1] * 12)])}
    for component in ('backend', 'frontend'):
        reports[component + '-scan.json'] = {'ArtifactType': 'container_image', 'ArtifactName': 'eduk12-survey-candidate-' + component + ':' + r.ORIGIN_B['merge'], 'Metadata': {'ImageID': checks['images'][component]}, 'Results': []}
    for name, count in [('runtime-result.json', 39), ('runtime-restore.json', 11)]:
        reports[name] = {**probe(count), 'binding': {'sourceSha': r.ORIGIN_B['merge'], 'imageId': checks['builders']['backend'], 'probeSha256': 'runtime-hash', 'node': '24.21.0', 'postgres': '160015', 'redis': '7.4.11', 'distSha256': 'e' * 64}, 'serverStopped': True, 'runtimeRole': {'restrictedRuntimeRole': True}}
    for name, count, phase in [('recovery-bootstrap.json', 4, 'bootstrap'), ('recovery-result.json', 31, 'verify')]:
        reports[name] = {**probe(count), 'phase': phase, 'sourceSha': r.ORIGIN_B['merge'], 'buildImageId': checks['builders']['backend'], 'scriptSha256': 'recovery-hash', 'runtimeRoles': {'synthetic': {'ok': True, 'restrictedRuntimeRole': True, 'migrationCount': 165}}, 'distSha256': 'e' * 64, 'compiledRestoreChecks': reports['runtime-restore.json']['checks']}
    phase = 'researcher four-type composition and publication'
    reports['browser/result.json'] = {'status': 'failed', 'sourceCommit': r.ORIGIN_B['merge'], 'images': checks['images'], 'harnessSha256': 'browser-hash', 'browserErrors': [], 'phase': phase, 'failure': {'name': 'AssertionError', 'phase': phase, 'message': 'researcher-published-wave has no WCAG A/AA violations, including serious/critical'}, 'accessibility': [{'state': 'admin-invitation-grants', 'violations': []}, {'state': 'researcher-published-wave', 'violations': [{'id': 'svg-img-alt', 'impact': 'serious', 'nodeCount': 1}]}]}
    return reports, plan, checks


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

    def test_live_linked_pr_head_is_not_historical_run_head(self):
        run, job, artifact = source_fixture()
        run['pull_requests'][0]['head']['sha'] = 'd' * 40
        self.assertEqual(r.validate_official_source(run, job, artifact, NOW)['sourceHead'], r.SOURCE_HEAD)
        for key, value in [('ref', 'other-branch'), ('repo', {'id': 1}), ('sha', 'invalid')]:
            bad = copy.deepcopy(run); bad['pull_requests'][0]['head'][key] = value
            with self.assertRaises(r.ReuseRejected): r.validate_official_source(bad, job, artifact, NOW)
        bad = copy.deepcopy(run); bad['pull_requests'][0]['base']['sha'] = 'b' * 40
        with self.assertRaises(r.ReuseRejected): r.validate_official_source(bad, job, artifact, NOW)

    def test_scope_transition_retains_only_exact_unchanged_inputs(self):
        before = {r.SELF_PATH: ('100644', 'blob', 'beec7418fe7d0d42a0c9bf07cd4cb3efcc601f2f'), '.github/scripts/survey-candidate-reuse.test.py': ('100644', 'blob', 'a1f0f1bd3e51ecfaf47d769d4e81c730f8699fe1'), '.github/workflows/ci.yml': ('100644', 'blob', 'fb85b9d59cac47cf9cfd886bc7e9c3f26c04916e'), 'unchanged': ('100644', 'blob', 'a' * 40)}
        after = dict(before)
        for path in ('.github/scripts/survey-candidate-reuse.test.py', '.github/workflows/ci.yml'): after[path] = ('100644', 'blob', r.REVIEWED_TRANSITIONS[path]['after'])
        after[r.SELF_PATH] = ('100644', 'blob', 'b' * 40)
        self.assertEqual(r.validate_scope_transition(before, after, 'b' * 40)['unchangedObjects'], 1)
        for path, value in [('unchanged', ('100644', 'blob', 'c' * 40)), (r.SELF_PATH, ('120000', 'blob', 'b' * 40))]:
            bad = dict(after); bad[path] = value
            with self.assertRaises(r.ReuseRejected): r.validate_scope_transition(before, bad, 'b' * 40)

    def test_scope_tap_requires_all_selected_names_and_zero_failures(self):
        names = ['synthetic case ' + str(n) for n in range(17)]
        output = '\n'.join('ok ' + str(n+1) + ' - ' + name for n, name in enumerate(names)) + '\n# pass 17\n# fail 0\n# cancelled 0\n# todo 0\n'
        self.assertTrue(r.validate_scope_tap(output, names))
        for bad in [output.replace('synthetic case 0', 'wrong case'), output.replace('# fail 0', '# fail 1'), output.replace(' - synthetic case 1\n', ' - synthetic case 1 # SKIP\n')]:
            with self.assertRaises(r.ReuseRejected): r.validate_scope_tap(bad, names)

    def test_browser_repair_requires_only_the_exact_browser_failure(self):
        job, proof = repair_job_fixture()
        self.assertEqual(r.validate_browser_failure_candidate(job, proof), list(r.B_SUCCESS_PHASES))
        for change in ('source', 'phase', 'cleanup', 'environment'):
            bad = copy.deepcopy(proof)
            if change == 'source': bad['sourceHead'] = '0' * 40
            elif change == 'phase': bad['phases'][0]['status'] = 'failure'
            elif change == 'cleanup': bad['cleanupErrors'] = [{'resource': 'synthetic'}]
            else: bad['executionInputs']['node'] = 'v24.19.0'
            with self.assertRaises(r.ReuseRejected): r.validate_browser_failure_candidate(job, bad)
        bad = copy.deepcopy(job); bad['steps'][0]['conclusion'] = 'skipped'
        with self.assertRaises(r.ReuseRejected): r.validate_browser_failure_candidate(bad, proof)
        bad = copy.deepcopy(job); bad['steps'].append(dict(bad['steps'][0]))
        with self.assertRaises(r.ReuseRejected): r.validate_browser_failure_candidate(bad, proof)

    def test_browser_repair_never_retains_wrong_scan_partial_tests_or_other_failure(self):
        reports, plan, checks = repair_reports_fixture()
        args = (plan, checks, 'runtime-hash', 'recovery-hash', 'browser-hash')
        summary = r.validate_repair_reports(reports, *args)
        self.assertEqual((summary['backendAssertions'], summary['frontendRetainedAssertions'], summary['frontendInvalidatedAssertions']), (132, 136, 30))
        self.assertFalse(summary['browserQualified'])
        for change in ('skip', 'scan', 'runtime', 'restore', 'browser'):
            bad = copy.deepcopy(reports)
            if change == 'skip': bad['frontend-tests.json']['testResults'][3]['assertionResults'][0]['status'] = 'skipped'
            elif change == 'scan': bad['backend-scan.json']['Metadata']['ImageID'] = 'sha256:' + '0' * 64
            elif change == 'runtime': bad['runtime-result.json']['serverStopped'] = False
            elif change == 'restore': bad['recovery-result.json']['checks'][0]['pass'] = False
            else: bad['browser/result.json']['accessibility'][1]['violations'][0]['id'] = 'different-rule'
            with self.assertRaises(r.ReuseRejected): r.validate_repair_reports(bad, *args)

    def test_browser_repair_transition_rejects_backend_or_unreviewed_product_change(self):
        reviewed = {path: {'before': str(index + 1) * 40, 'after': str(index + 3) * 40} for index, path in enumerate(r.REPAIR_PRODUCT_PATHS)}
        before = {path: ('100644', 'blob', values['before']) for path, values in reviewed.items()}
        before[r.SELF_PATH] = ('100644', 'blob', r.B_VERIFIER_BLOB)
        before['server-version/backend/unchanged.ts'] = ('100644', 'blob', 'e' * 40)
        after = dict(before)
        for path, values in reviewed.items(): after[path] = ('100644', 'blob', values['after'])
        after[r.SELF_PATH] = ('100644', 'blob', 'f' * 40)
        self.assertEqual(r.validate_repair_transition(before, after, 'f' * 40, reviewed)['unchangedGitObjects'], 1)
        bad = dict(after); bad['server-version/backend/unchanged.ts'] = ('100644', 'blob', 'd' * 40)
        with self.assertRaises(r.ReuseRejected): r.validate_repair_transition(before, bad, 'f' * 40, reviewed)

    def test_repair_scope_tap_requires_exact_three_current_consumers(self):
        names = list(r.SCOPE_REPAIR_TESTS)
        output = '\n'.join('ok ' + str(n + 1) + ' - ' + name for n, name in enumerate(names)) + '\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n'
        self.assertTrue(r.validate_scope_repair_tap(output, names))
        for bad in [output.replace('# pass 3', '# pass 2'), output.replace('ok 1 - ' + names[0], 'ok 1 - ' + names[0] + ' # SKIP'), output.replace('# skipped 0', '# skipped 1')]:
            with self.assertRaises(r.ReuseRejected): r.validate_scope_repair_tap(bad, names)

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
