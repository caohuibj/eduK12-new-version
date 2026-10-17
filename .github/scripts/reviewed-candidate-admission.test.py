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


if __name__ == '__main__':
    unittest.main()
