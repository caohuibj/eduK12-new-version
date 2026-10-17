"""New transport/admission refusal fixtures; no Docker, network or application tests."""
import copy
import datetime
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch
import zipfile

spec = importlib.util.spec_from_file_location('admission', Path(__file__).with_name('reviewed-candidate-admission.py'))
a = importlib.util.module_from_spec(spec)
spec.loader.exec_module(a)
M = a.M
S = M['source']


def source():
    run = {'id': S['run'], 'head_sha': S['head'], 'head_branch': S['branch'], 'event': S['event'],
           'path': S['workflow'], 'run_attempt': S['attempt'], 'status': 'completed', 'conclusion': 'success',
           'repository': {'full_name': M['repository']}, 'head_repository': {'full_name': M['repository']}}
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    jobs = [{**j, 'run_id': S['run'], 'head_sha': S['head'], 'status': 'completed', 'conclusion': 'success', 'completed_at': now} for j in S['jobs']]
    return run, jobs


def artifact():
    expected = S['artifacts'][0]
    return {'id': expected['id'], 'name': expected['name'], 'size_in_bytes': expected['size'],
            'digest': expected['digest'], 'created_at': expected['createdAt'], 'expired': False,
            'workflow_run': {'id': S['run'], 'head_sha': S['head']}}, expected


def reports():
    tools = {'fixture': 'a' * 40}
    result = {'scope.json': {'head': S['head'], 'base': M['base'], 'components': M['components'], 'tools': tools,
                            'changes': [{'file': f, **v} for f, v in M['files'].items()]}}
    for component in ['backend', 'frontend']:
        builder = {'head': S['head'], 'runId': str(S['run']), 'componentTree': M['components'][component], 'stage': 'builder',
                   'status': 'success', 'phases': [{'name': 'compile-once', 'status': 'success'}], 'tools': tools,
                   'images': {'builder': M['images'][component + '-builder']}}
        runtime = {**builder, 'stage': 'runtime', 'images': {'runtime': M['images'][component + '-runtime']},
                   'builderImage': builder['images']['builder'],
                   'builderReceiptSha256': a.sha((json.dumps(builder, indent=2) + '\n').encode())}
        result[component + '-builder.json'], result[component + '-runtime.json'] = builder, runtime
        for kind in ['audit', 'scan', 'probe']:
            stage = 'builder' if kind == 'audit' else 'runtime'
            result[component + '-' + kind + '-verification.json'] = {'head': S['head'], 'runId': str(S['run']), 'status': 'success',
                'phases': [{'name': kind, 'status': 'success'}], 'images': {stage: M['images'][component + '-' + stage]}}
        result[component + '-scan.json'] = {'Results': [{'Vulnerabilities': []}]}
    result['runtime-http.json'] = {'sourceSha': S['head'], 'imageId': M['images']['backend-runtime'], 'status': 'success',
        'checks': [{'pass': True} for _ in range(65)], 'requests': [{} for _ in range(18)], 'maxObservedHttpConcurrency': 1,
        'corpus': [{'expectedSha256': str(i), 'outputSha256': str(i)} for i in range(3)]}
    result['backend-probe-verification.json']['isolatedResourcesRemoved'] = True
    result['frontend-probe-verification.json'].update(builderStaticFileCount=393, runtimeStaticFileCount=394, baseOwnedExtraFiles={'50x.html': 'a' * 64})
    return result


class AdmissionRefusals(unittest.TestCase):
    def test_exact_source_succeeds(self):
        a.validate_run(*source())

    def test_wrong_run_event_workflow_head_attempt_refused(self):
        for field in ['id', 'head_sha', 'head_branch', 'event', 'path', 'run_attempt', 'status', 'conclusion']:
            with self.subTest(field=field):
                run, jobs = source(); run[field] = 'wrong'
                with self.assertRaises(ValueError): a.validate_run(run, jobs)

    def test_fork_source_and_incomplete_job_set_refused(self):
        run, jobs = source(); run['head_repository']['full_name'] = 'other/repo'
        with self.assertRaises(ValueError): a.validate_run(run, jobs)
        for mutation in [lambda j: j[:-1], lambda j: j + [j[0]], lambda j: [{**j[0], 'id': 1}, *j[1:]]]:
            with self.assertRaises(ValueError): a.validate_run(source()[0], mutation(source()[1]))

    def test_failed_skipped_cancelled_missing_job_never_green(self):
        for value in ['failure', 'skipped', 'cancelled', None]:
            run, jobs = source(); jobs[0]['conclusion'] = value
            with self.assertRaises(ValueError): a.validate_run(run, jobs)

    def test_job_expiry_not_renewed(self):
        with patch.object(a.transport, 'recent', return_value=False):
            with self.assertRaises(ValueError): a.validate_run(*source())

    def test_exact_artifact_metadata_succeeds(self):
        with patch.object(a.transport, 'recent', return_value=True): a.validate_artifact(*artifact())

    def test_artifact_digest_size_identity_expiry_refused(self):
        for field in ['id', 'name', 'size_in_bytes', 'digest', 'created_at']:
            value, expected = artifact(); value[field] = 'wrong'
            with self.assertRaises(ValueError): a.validate_artifact(value, expected)
        value, expected = artifact(); value['expired'] = True
        with self.assertRaises(ValueError): a.validate_artifact(value, expected)
        with patch.object(a.transport, 'recent', return_value=False):
            with self.assertRaises(ValueError): a.validate_artifact(*artifact())

    def test_artifact_wrong_source_refused(self):
        for field in ['id', 'head_sha']:
            value, expected = artifact(); value['workflow_run'][field] = 'wrong'
            with self.assertRaises(ValueError): a.validate_artifact(value, expected)

    def test_only_declared_regular_zip_members(self):
        a.validate_members([zipfile.ZipInfo('report.json')], ['report.json'])
        for name in ['../report.json', '/report.json', 'dir/report.json', 'dir\\report.json']:
            with self.assertRaises(ValueError): a.validate_members([zipfile.ZipInfo(name)], [name])
        member = zipfile.ZipInfo('report.json'); member.external_attr = 0o120777 << 16
        with self.assertRaises(ValueError): a.validate_members([member], ['report.json'])
        with self.assertRaises(ValueError): a.validate_members([zipfile.ZipInfo('report.json')] * 2, ['report.json'])

    def test_exact_complete_reports_succeed(self):
        a.validate_reports(reports())

    def test_failed_assertion_cleanup_or_oracle_refused(self):
        for change in [lambda r: r['runtime-http.json']['checks'][0].update(pass_=False),
                       lambda r: r['backend-probe-verification.json'].update(isolatedResourcesRemoved=False),
                       lambda r: r['runtime-http.json']['corpus'][0].update(outputSha256='wrong')]:
            r = reports(); change(r)
            if 'pass_' in r['runtime-http.json']['checks'][0]: r['runtime-http.json']['checks'][0]['pass'] = False
            with self.assertRaises(ValueError): a.validate_reports(r)

    def test_wrong_image_receipt_tools_or_missing_reports_refused(self):
        for field in ['builderImage', 'builderReceiptSha256', 'tools']:
            r = reports(); r['frontend-runtime.json'][field] = 'wrong'
            with self.assertRaises(ValueError): a.validate_reports(r)
        r = reports(); del r['frontend-probe-verification.json']
        with self.assertRaises(KeyError): a.validate_reports(r)

    def test_nonempty_threshold_scan_and_changed_static_scope_refused(self):
        r = reports(); r['backend-scan.json']['Results'][0]['Vulnerabilities'] = [{'Severity': 'HIGH'}]
        with self.assertRaises(ValueError): a.validate_reports(r)
        r = reports(); r['frontend-probe-verification.json']['runtimeStaticFileCount'] += 1
        with self.assertRaises(ValueError): a.validate_reports(r)


class ChangedFrontendAndRaceRefusals(unittest.TestCase):
    def fixture_job(self):
        r = M['raceReceipt']
        return {'id': r['job']['id'], 'name': r['job']['name'], 'run_id': r['run'],
                'head_sha': r['head'], 'status': 'completed', 'conclusion': 'success',
                'completed_at': r['job']['completedAt']}

    def test_exact_independent_race_job_is_accepted(self):
        with patch.object(a.transport, 'recent', return_value=True): a.validate_race_job(self.fixture_job(), M['raceReceipt'])

    def test_race_job_wrong_origin_or_failed_status_is_refused(self):
        for field in ['id','name','run_id','head_sha','status','conclusion','completed_at']:
            value = self.fixture_job(); value[field] = 'wrong'
            with self.subTest(field=field), patch.object(a.transport, 'recent', return_value=True), self.assertRaises(ValueError):
                a.validate_race_job(value, M['raceReceipt'])

    def test_race_completion_time_is_not_renewed(self):
        with patch.object(a.transport, 'recent', return_value=False), self.assertRaises(ValueError):
            a.validate_race_job(self.fixture_job(), M['raceReceipt'])

    def test_retained_runtime_setup_matches_the_original_official_job(self):
        self.assertEqual(a.bound_function_hashes(Path(a.__file__).read_text()), M['raceReceipt']['functionHashes'])

    def test_new_dispatcher_cannot_replace_the_original_bound_probe(self):
        original = 'def original_probe(action, reports, record):\n    return 42\n'
        dispatcher = 'def probe(action, reports, record):\n    return 0\n'
        self.assertEqual(a.bound_function_hashes(original), a.bound_function_hashes(original + dispatcher))
        self.assertNotEqual(a.bound_function_hashes(original), a.bound_function_hashes(original.replace('42','41')))

class PartialFrontendAssemblyRefusals(unittest.TestCase):
    def fixture(self):
        receipt = M['frontendAssemblyReceipt']
        actual = {'id': receipt['run'], 'head_sha': receipt['head'], 'head_branch': receipt['branch'],
                  'event': receipt['event'], 'path': receipt['workflow'], 'run_attempt': receipt['attempt'],
                  'status': 'completed', 'conclusion': 'failure', 'repository': {'full_name': M['repository']},
                  'head_repository': {'full_name': M['repository']}}
        job = {'id': receipt['job']['id'], 'name': receipt['job']['name'], 'run_id': receipt['run'],
               'run_attempt': receipt['attempt'], 'head_sha': receipt['head'], 'status': 'completed',
               'conclusion': 'failure', 'completed_at': receipt['job']['completedAt']}
        runtime = {'schema': 1, 'status': 'success', 'stage': 'runtime-assembly', 'head': receipt['head'],
                   'checkoutSha': receipt['mergeHead'], 'run': str(receipt['run']), 'attempt': str(receipt['attempt']),
                   'componentTree': M['frontendPatch']['afterTree'], 'imageId': receipt['imageId'],
                   'archive': {'sha256': 'b' * 64}, 'entryChanged': True}
        statuses = [('admit-original-official-evidence', 'success'), ('changed-frontend-frontend', 'failure'),
                    ('fetch-base-node', 'success'), ('fetch-base-nginx', 'success'), ('changed-frontend-build-once', 'success'),
                    ('package-exact-new-builder', 'success'), ('changed-scale-scoped-lint', 'success'),
                    ('changed-frontend-app-types', 'failure')]
        verification = {'status': 'failure', 'currentHead': receipt['head'], 'sourceSha': M['source']['head'],
                        'phases': [{'name': name, 'status': status} for name, status in statuses],
                        'runtimeAssembly': {'imageId': runtime['imageId'], 'archiveSha256': runtime['archive']['sha256']}}
        return actual, job, runtime, verification, receipt

    def test_exact_failed_producer_can_supply_only_its_successful_assembly(self):
        actual, job, runtime, verification, receipt = self.fixture()
        with patch.object(a.transport, 'recent', return_value=True):
            a.validate_assembly_origin(actual, job, receipt)
        a.validate_assembly_reports(runtime, verification, receipt)
        self.assertEqual(verification['status'], 'failure')
        self.assertEqual(verification['phases'][-1]['status'], 'failure')

    def test_other_run_job_attempt_head_or_conclusion_is_refused(self):
        for target, fields in [('run', ['id', 'head_sha', 'head_branch', 'event', 'path', 'run_attempt', 'status', 'conclusion']),
                               ('job', ['id', 'name', 'run_id', 'run_attempt', 'head_sha', 'status', 'conclusion', 'completed_at'])]:
            for field in fields:
                actual, job, _, _, receipt = self.fixture()
                (actual if target == 'run' else job)[field] = 'wrong'
                with self.subTest(target=target, field=field), patch.object(a.transport, 'recent', return_value=True), self.assertRaises(ValueError):
                    a.validate_assembly_origin(actual, job, receipt)

    def test_fork_or_expired_assembly_is_refused(self):
        actual, job, _, _, receipt = self.fixture()
        for key in ['repository', 'head_repository']:
            changed = copy.deepcopy(actual); changed[key]['full_name'] = 'other/repository'
            with patch.object(a.transport, 'recent', return_value=True), self.assertRaises(ValueError):
                a.validate_assembly_origin(changed, job, receipt)
        with patch.object(a.transport, 'recent', return_value=False), self.assertRaises(ValueError):
            a.validate_assembly_origin(actual, job, receipt)

    def test_failed_missing_duplicate_or_newly_claimed_phase_is_refused(self):
        _, _, runtime, verification, receipt = self.fixture()
        for index in range(len(verification['phases'])):
            changed = copy.deepcopy(verification)
            changed['phases'][index]['status'] = 'failure' if changed['phases'][index]['status'] == 'success' else 'success'
            with self.subTest(index=index), self.assertRaises(ValueError):
                a.validate_assembly_reports(runtime, changed, receipt)
        for phases in [verification['phases'][:-1], verification['phases'] + [verification['phases'][0]],
                       verification['phases'] + [{'name': 'new-runtime-high-critical-scan', 'status': 'success'}]]:
            with self.assertRaises(ValueError):
                a.validate_assembly_reports(runtime, {**verification, 'phases': phases}, receipt)

    def test_changed_source_image_or_receipt_cannot_be_relabelled_current(self):
        _, _, runtime, verification, receipt = self.fixture()
        for field in ['schema', 'status', 'stage', 'head', 'checkoutSha', 'run', 'attempt', 'componentTree', 'imageId', 'entryChanged']:
            changed = copy.deepcopy(runtime); changed[field] = 'wrong'
            with self.subTest(field=field), self.assertRaises(ValueError):
                a.validate_assembly_reports(changed, verification, receipt)
        for field in ['status', 'currentHead', 'sourceSha', 'runtimeAssembly']:
            with self.subTest(field=field), self.assertRaises(ValueError):
                a.validate_assembly_reports(runtime, {**verification, field: 'wrong'}, receipt)
        changed = copy.deepcopy(runtime); changed['archive']['sha256'] = 'c' * 64
        with self.assertRaises(ValueError): a.validate_assembly_reports(changed, verification, receipt)

class QualificationReceiptRefusals(unittest.TestCase):
    def origin(self, action):
        receipt = M['qualificationReceipt']
        actual = {'id': receipt['run'], 'head_sha': receipt['head'], 'head_branch': receipt['branch'],
                  'event': receipt['event'], 'path': receipt['workflow'], 'run_attempt': receipt['attempt'],
                  'status': 'completed', 'conclusion': 'failure', 'repository': {'full_name': M['repository']},
                  'head_repository': {'full_name': M['repository']}}
        expected = receipt['jobs'][action]
        job = {'id': expected['id'], 'name': expected['name'], 'run_id': receipt['run'], 'run_attempt': receipt['attempt'],
               'head_sha': receipt['head'], 'status': 'completed', 'conclusion': 'failure' if action == 'browser' else 'success',
               'completed_at': expected['completedAt']}
        return actual, job, receipt

    def reports(self, action):
        receipt = M['qualificationReceipt']; image = M['frontendAssemblyReceipt']['imageId']
        phases = ['admit-original-official-evidence', 'qualify-missing-' + action]
        value = {'status': 'success', 'currentHead': receipt['head'], 'sourceSha': M['frontendAssemblyReceipt']['head'], 'imageId': image}
        result = {action + '-verification.json': value}
        if action == 'frontend':
            phases += ['install-locked-host-frontend-tooling', 'missing-frontend-app-types', 'missing-scale-and-changed-training-contracts', 'missing-runtime-high-critical-scan']
            result['selected-component-tests.json'] = {'success': True, 'numTotalTests': 41, 'numPassedTests': 41, 'numFailedTests': 0,
                'numPendingTests': 0, 'numTodoTests': 0, 'testResults': [{'name': name, 'status': 'passed',
                    'assertionResults': [{'status': 'passed'} for _ in range(count)]} for name, count in [('ScaleEdit.readonly.test.tsx', 21), ('TrainingTaskDeepLinks.test.tsx', 20)]]}
            result['frontend-scan.json'] = {'ArtifactID': image, 'ArtifactName': image, 'Metadata': {'ImageID': image},
                'ArtifactType': 'container_image', 'Trivy': {'Version': '0.70.0'}, 'Results': [{'Vulnerabilities': []}]}
        else:
            engine = action.removeprefix('interaction-'); phases += ['affected-assignment-states-' + engine]
            value.update(browser=engine, scope='assignment-list-states', artifactSourceHead=M['frontendAssemblyReceipt']['head'],
                isolatedResourcesRemoved=True, testScriptBlob=receipt['inputs']['server-version/e2e/visual-interaction-states-browser-e2e.cjs'])
            result[action + '/interaction-states/qa.json'] = {'scope': 'assignment-list-states', 'results': [{'width': width, 'passed': True,
                'assignmentStates': [{'state': state, 'passed': True} for state in ['loading', 'populated', 'empty', 'filtered-empty', 'error']]}
                for width in [360, 390, 768, 1440]]}
        value['phases'] = [{'name': name, 'status': 'success'} for name in phases]
        return result

    def test_exact_job_statuses_preserve_partial_browser_failure(self):
        for action in ['frontend', 'browser', 'interaction-chromium', 'interaction-firefox', 'interaction-webkit']:
            actual, job, receipt = self.origin(action)
            with patch.object(a.transport, 'recent', return_value=True): a.validate_qualification_origin(actual, job, action, receipt)
            for key in ['id', 'name', 'run_id', 'run_attempt', 'head_sha', 'status', 'conclusion', 'completed_at']:
                with self.subTest(action=action, key=key), patch.object(a.transport, 'recent', return_value=True), self.assertRaises(ValueError):
                    a.validate_qualification_origin(actual, {**job, key: 'wrong'}, action, receipt)
            with patch.object(a.transport, 'recent', return_value=False), self.assertRaises(ValueError):
                a.validate_qualification_origin(actual, job, action, receipt)
        with self.assertRaises(ValueError): a.validate_qualification_reports('browser', {}, M['qualificationReceipt'])

    def test_only_exact_successful_phase_sets_and_complete_assertions_qualify(self):
        for action in ['frontend', 'interaction-chromium', 'interaction-firefox', 'interaction-webkit']:
            reports = self.reports(action)
            a.validate_qualification_reports(action, reports, M['qualificationReceipt'])
            for key in ['status', 'currentHead', 'sourceSha', 'imageId']:
                changed = copy.deepcopy(reports); changed[action + '-verification.json'][key] = 'wrong'
                with self.subTest(action=action, key=key), self.assertRaises(ValueError):
                    a.validate_qualification_reports(action, changed, M['qualificationReceipt'])
            changed = copy.deepcopy(reports); changed[action + '-verification.json']['phases'][0]['status'] = 'skipped'
            with self.assertRaises(ValueError): a.validate_qualification_reports(action, changed, M['qualificationReceipt'])
        changed = self.reports('frontend'); changed['selected-component-tests.json']['numPassedTests'] = 40
        with self.assertRaises(ValueError): a.validate_qualification_reports('frontend', changed, M['qualificationReceipt'])
        changed = self.reports('frontend'); changed['frontend-scan.json']['Results'][0]['Vulnerabilities'] = [{'Severity': 'HIGH'}]
        with self.assertRaises(ValueError): a.validate_qualification_reports('frontend', changed, M['qualificationReceipt'])
        changed = self.reports('interaction-chromium'); changed['interaction-chromium/interaction-states/qa.json']['results'][0]['assignmentStates'].pop()
        with self.assertRaises(ValueError): a.validate_qualification_reports('interaction-chromium', changed, M['qualificationReceipt'])
        changed = self.reports('interaction-chromium'); changed['interaction-chromium-verification.json']['isolatedResourcesRemoved'] = False
        with self.assertRaises(ValueError): a.validate_qualification_reports('interaction-chromium', changed, M['qualificationReceipt'])


if __name__ == '__main__':
    unittest.main()
