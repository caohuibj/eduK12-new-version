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


def e_wave_fixture():
    origin = r.ORIGIN_E
    job = {'id': origin['job'], 'run_id': origin['run'], 'head_sha': origin['head'], 'status': 'completed', 'conclusion': 'failure', 'steps': [*[{'name': name, 'status': 'completed', 'conclusion': 'success'} for name in r.E_SUCCESS_STEPS], {'name': r.DOWNSTREAM_STEPS[-1], 'status': 'completed', 'conclusion': 'failure'}, *[{'name': 'Run actions/upload-artifact@v4', 'status': 'completed', 'conclusion': 'success'} for _ in range(2)]]}
    checks = {'head': origin['merge'], 'sourceHead': origin['head'], 'tree': origin['tree'], 'phases': [*[{'name': name, 'status': 'success', 'seconds': 1} for name in r.E_SUCCESS_PHASES], {'name': r.B_FAILED_PHASE, 'status': 'failure', 'errorType': 'CalledProcessError', 'seconds': 1}], 'privateBrowserMaterialRemoved': True, 'isolatedResourcesRemoved': True, 'cleanupErrors': [], 'images': dict(r.E_IMAGES), 'builders': {'frontend': r.E_BUILDER}, 'executionInputs': {'node': 'v24.21.0', 'docker': '28.0.4', 'runnerOS': 'Linux', 'workflow': r.E_REVIEWED_BEFORE['.github/workflows/ci-survey-candidate.yml'], 'executor': r.E_REVIEWED_BEFORE['.github/scripts/survey-candidate.py'], 'environmentSha256': '18ca82be087ab5064162ed40039425db87ee860775f9aba0f20be18d3e770cff'}, 'frontendBuildRecipe': {'dependencyProducer': 'sha256:2deb951d082a71060a9e91d367c7878654189d17503bf2ce27e3236ee7d7fb30', 'copiedSourceBlobs': {path.removeprefix('server-version/frontend/'): r.REPAIR_TRANSITIONS[path]['after'] for path in r.REPAIR_PRODUCT_PATHS[:2]}, 'dependencyLockUnchanged': True}}
    tests = {'success': True, 'numTotalTests': 30, 'numPassedTests': 30, 'testResults': [{'name': '/app/' + name, 'status': 'passed', 'assertionResults': [{'status': 'passed'} for _ in range(count)]} for name, count in zip(r.REPAIR_TESTS, (7, 3, 20))]}
    phase = 'researcher four-type composition and publication'
    browser = {'status': 'failed', 'sourceCommit': origin['merge'], 'images': dict(r.E_IMAGES), 'harnessSha256': '21b0156745886c779595efd4764e6c509290defa6b6f87124f6f21e598af570d', 'browserErrors': [], 'phase': phase, 'failure': {'phase': phase, 'name': 'AssertionError', 'message': 'researcher has no document horizontal overflow at 390'}, 'accessibility': [{'state': state, 'violations': []} for state in ('admin-invitation-grants', 'researcher-published-wave')]}
    return job, checks, tests, browser


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
        reviewed = {path: {'before': str(index + 1) * 40, 'after': str(index + 3) * 40} for index, path in enumerate((*r.REPAIR_PRODUCT_PATHS, r.REPAIR_BROWSER_HARNESS_PATH))}
        before = {path: ('100644', 'blob', values['before']) for path, values in reviewed.items()}
        before[r.SELF_PATH] = ('100644', 'blob', r.B_VERIFIER_BLOB)
        before['server-version/backend/unchanged.ts'] = ('100644', 'blob', 'e' * 40)
        after = dict(before)
        for path, values in reviewed.items(): after[path] = ('100644', 'blob', values['after'])
        after[r.SELF_PATH] = ('100644', 'blob', 'f' * 40)
        self.assertEqual(r.validate_repair_transition(before, after, 'f' * 40, reviewed)['unchangedGitObjects'], 1)
        bad = dict(after); bad['server-version/backend/unchanged.ts'] = ('100644', 'blob', 'd' * 40)
        with self.assertRaises(r.ReuseRejected): r.validate_repair_transition(before, bad, 'f' * 40, reviewed)
        missing = dict(reviewed); missing.pop(r.REPAIR_BROWSER_HARNESS_PATH)
        with self.assertRaises(r.ReuseRejected): r.validate_repair_transition(before, after, 'f' * 40, missing)
        self.assertEqual(r.ADDITIONAL_REPAIR_TESTS, ('src/survey/ResearchCatalog.test.tsx',))
        self.assertFalse(set(r.REPAIR_TESTS) & set(r.ADDITIONAL_REPAIR_TESTS))
        self.assertNotIn(r.REPAIR_BROWSER_HARNESS_PATH, r.REPAIR_PRODUCT_PATHS)

    def test_repair_scope_tap_requires_exact_named_contracts_and_complete_counts(self):
        names = list(r.SCOPE_REPAIR_TESTS)
        output = 'TAP version 13\n' + '\n'.join('ok ' + str(n + 1) + ' - ' + name for n, name in enumerate(names)) + '\n1..3\n# tests 3\n# suites 0\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 70.894038\n'
        self.assertTrue(r.validate_scope_repair_tap(output, names))
        self.assertEqual(r.parse_scope_repair_tap(output, names), {'namedTests': names, 'emptyFileWrappers': [], 'tapTests': 3})
        for bad in [output.replace('# pass 3', '# pass 2'), output.replace('# tests 3', '# tests 4'), output.replace('# suites 0', '# suites 1'), output.replace('1..3', '1..4'), output.replace('TAP version 13\n', ''), output.replace('ok 2 - ' + names[1], 'ok 2 - ' + names[0]), output.replace('ok 2 - ', 'ok 3 - '), output.replace('ok 1 - ', 'not ok 1 - '), output.replace('ok 1 - ' + names[0], 'ok 1 - ' + names[0] + ' # SKIP'), output.replace('ok 1 - ' + names[0], 'ok 1 - ' + names[0] + ' # TODO'), output.replace('# skipped 0', '# skipped 1'), output.replace('# cancelled 0', '# cancelled 1'), output.replace('# todo 0', '# todo 1'), output.replace('# fail 0', '# fail 1'), output.replace('# todo 0\n', ''), output.replace('# fail 0', '# fail 0\n# fail 0'), output.replace('1..3', 'ok 4 - unexpected case\n1..4'), output.replace('ok 1 - ', '    ok 1 - ')]:
            with self.subTest(tap=bad):
                with self.assertRaises(r.ReuseRejected): r.validate_scope_repair_tap(bad, names)

    def test_node24_empty_file_wrapper_is_verified_but_never_counted_as_a_contract(self):
        names = [r.SCOPE_REPAIR_TESTS[2], *r.SCOPE_REPAIR_TESTS[:2]]
        records = [r.EMPTY_SCOPE_FILE, *names]
        output = 'TAP version 13\n1..0\n' + ''.join('# Subtest: ' + name + '\nok ' + str(n + 1) + ' - ' + name + "\n  ---\n  duration_ms: 0.472917\n  type: 'test'\n  ...\n" for n, name in enumerate(records)) + '1..4\n# tests 4\n# suites 0\n# pass 4\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 70.894038\n'
        parsed = r.parse_scope_repair_tap(output, r.SCOPE_REPAIR_TESTS)
        self.assertEqual(parsed, {'namedTests': names, 'emptyFileWrappers': [r.EMPTY_SCOPE_FILE], 'tapTests': 4})
        stamped = '\n'.join('2026-10-17T11:27:11.0960101Z ' + line for line in output.splitlines()) + '\n2026-10-17T11:27:11.1375787Z ReuseRejected: SCOPE_REPAIR_EXECUTED_NAMES\n'
        self.assertEqual(r.extract_scope_repair_tap(stamped), output)
        for bad in [output.replace('1..0\n', ''), output.replace('1..0\n', '1..0\n1..0\n'), output.replace(r.EMPTY_SCOPE_FILE, '.github/scripts/arbitrary.test.mjs'), output.replace('ok 1 - ' + r.EMPTY_SCOPE_FILE, 'ok 1 - ' + r.EMPTY_SCOPE_FILE + ' # SKIP'), output.replace('# tests 4', '# tests 3'), output.replace('# pass 4', '# pass 3'), output.replace("type: 'test'", "type: 'suite'"), output.replace('  ...\n', '', 1), output.replace('# Subtest: ' + names[0], '# Subtest: ' + names[1], 1), output.replace('1..4', 'ok 5 - ' + r.EMPTY_SCOPE_FILE + '\n1..5'), output.replace('# Subtest: ' + names[0], '# Subtest: ' + names[0] + '\n# Subtest: ' + names[1], 1)]:
            with self.subTest(tap=bad):
                with self.assertRaises(r.ReuseRejected): r.validate_scope_repair_tap(bad, r.SCOPE_REPAIR_TESTS)
        for bad in [stamped + stamped, stamped.replace('# duration_ms 70.894038', '# incomplete')]:
            with self.assertRaises(r.ReuseRejected): r.extract_scope_repair_tap(bad)

    def test_flat_wave_report_requires_exact_reviewed_e_transition(self):
        test = '.github/scripts/survey-candidate-reuse.test.py'
        before = {path: ('100644', 'blob', digest) for path, digest in r.E_REVIEWED_BEFORE.items()}
        before.update({r.SELF_PATH: ('100644', 'blob', r.E_VERIFIER_BLOB), 'server-version/frontend/src/survey/SurveyWaveStudio.tsx': ('100644', 'blob', 'c' * 40)})
        after = {**before, r.SELF_PATH: ('100644', 'blob', 'f' * 40)}
        for path in r.E_REVIEWED_BEFORE:
            after[path] = ('100644', 'blob', r.REPAIR_TRANSITIONS[path]['after'])
        self.assertEqual(r.validate_e_transition(before, after, 'f' * 40)['unchangedObjects'], 1)
        for path, entry in [('server-version/frontend/src/survey/SurveyWaveStudio.tsx', ('100644', 'blob', 'd' * 40)), (r.SELF_PATH, ('120000', 'blob', 'f' * 40)), (test, ('100644', 'blob', 'e' * 40)), ('unreviewed.ts', ('100644', 'blob', 'a' * 40)), ('server-version/e2e/other-browser.cjs', ('100644', 'blob', 'b' * 40))]:
            bad = dict(after); bad[path] = entry
            with self.assertRaises(r.ReuseRejected): r.validate_e_transition(before, bad, 'f' * 40)
        for path in (*r.E_REVIEWED_BEFORE, r.SELF_PATH):
            bad = dict(before); bad[path] = ('100644', 'blob', '0' * 40)
            with self.assertRaises(r.ReuseRejected): r.validate_e_transition(bad, after, 'f' * 40)

    def test_flat_wave_report_retains_only_ten_and_lint_with_original_failure(self):
        job, checks, tests, browser = e_wave_fixture()
        result = r.validate_e_wave_reports(job, checks, tests, browser)
        self.assertEqual(result['retainedAssertions'], 10)
        self.assertEqual(result['retainedSuites'], list(r.REPAIR_TESTS[:2]))
        self.assertEqual(result['sourceRun'], r.ORIGIN_E['run'])
        self.assertFalse(result['wholeCandidateQualified'])
        self.assertFalse(result['imagesReused'])
        self.assertEqual(r.FRONTEND_TESTS_TO_RUN, ('src/survey/SurveyWorkspace.requests.test.tsx', 'src/survey/ResearchCatalog.test.tsx'))
        for change in ('head', 'phase', 'extra', 'cleanup', 'environment', 'image', 'recipe', 'skip', 'count', 'suite', 'failure', 'axe', 'browser_source', 'job', 'step', 'duplicate'):
            j, c, t, b = copy.deepcopy((job, checks, tests, browser))
            if change == 'head': c['sourceHead'] = '0' * 40
            elif change == 'phase': c['phases'][3]['status'] = 'skipped'
            elif change == 'extra': c['phases'].append({'name': 'other', 'status': 'success', 'seconds': 1})
            elif change == 'cleanup': c['cleanupErrors'] = ['unremoved']
            elif change == 'environment': c['executionInputs']['node'] = 'v24.19.0'
            elif change == 'image': c['images']['frontend'] = 'sha256:' + '0' * 64
            elif change == 'recipe': c['frontendBuildRecipe']['copiedSourceBlobs'] = {}
            elif change == 'skip': t['testResults'][0]['assertionResults'][0]['status'] = 'skipped'
            elif change == 'count': t['numTotalTests'] = 29
            elif change == 'suite': t['testResults'][0]['name'] = '/app/src/other.test.tsx'
            elif change == 'failure': b['failure']['message'] = 'different failure'
            elif change == 'axe': b['accessibility'][0]['violations'] = [{'id': 'svg-img-alt'}]
            elif change == 'browser_source': b['sourceCommit'] = r.ORIGIN_B['merge']
            elif change == 'job': j['conclusion'] = 'success'
            elif change == 'step': j['steps'][0]['conclusion'] = 'skipped'
            else: j['steps'].append(dict(j['steps'][0]))
            with self.subTest(change=change):
                with self.assertRaises(r.ReuseRejected): r.validate_e_wave_reports(j, c, t, b)

    def test_flat_e_official_artifact_and_small_zip_admission(self):
        run, job, artifact = source_fixture(); origin = r.ORIGIN_E
        run.update(id=origin['run'], head_sha=origin['head'])
        job.update(id=origin['job'], run_id=origin['run'], head_sha=origin['head'])
        artifact.update(id=origin['artifact'], digest=origin['digest'], size_in_bytes=origin['size'], name='survey-candidate-reports-' + origin['merge'], workflow_run={'id': origin['run'], 'head_sha': origin['head']})
        self.assertFalse(r.validate_official_source(run, job, artifact, NOW, origin)['wholeCandidateQualified'])
        for field, value in [('name', 'survey-candidate-' + origin['merge']), ('digest', r.ORIGIN_B['digest']), ('size_in_bytes', r.ORIGIN_B['size'])]:
            bad = dict(artifact); bad[field] = value
            with self.assertRaises(r.ReuseRejected): r.validate_official_source(run, job, bad, NOW, origin)
        valid = [zipfile.ZipInfo('survey-candidate-plan.json'), *[zipfile.ZipInfo(name) for name in r.E_REPORT_SHA256]]
        self.assertTrue(r.safe_zip_entries(valid, origin))
        for entries in [valid[:-1], valid + [zipfile.ZipInfo('survey-candidate-evidence/frontend-image.tar.zst')], valid + [valid[1]], valid + [zipfile.ZipInfo('../outside')]]:
            with self.assertRaises(r.ReuseRejected): r.safe_zip_entries(entries, origin)

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
