"""Pure control contracts only; no network, build, database or browser execution."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('reuse', Path(__file__).with_name('scale-authoring-reuse.py'))
reuse = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reuse)


class ReuseContracts(unittest.TestCase):
    def test_official_identity_fails_on_wrong_run_head_attempt_job_or_pg(self):
        source = {
            'runs/' + str(reuse.RUN): {'id': reuse.RUN, 'head_sha': reuse.SOURCE, 'run_attempt': 1},
            'jobs/119090160085': {'run_id': reuse.RUN, 'head_sha': reuse.SOURCE, 'name': 'build (backend)', 'conclusion': 'success'},
            'jobs/119090160090': {'run_id': reuse.RUN, 'head_sha': reuse.SOURCE, 'name': 'build (frontend)', 'conclusion': 'success'},
            'jobs/119091427956': {'run_id': reuse.RUN, 'head_sha': reuse.SOURCE, 'steps': [
                {'name': 'new exact PostgreSQL persistence and image permission case', 'conclusion': 'success'},
                {'name': 'stop this run processes and clear private credentials', 'conclusion': 'success'}]},
        }
        reuse.verify_jobs(source.__getitem__)
        for path, key, value in [('runs/' + str(reuse.RUN), 'id', 1), ('runs/' + str(reuse.RUN), 'head_sha', 'wrong'), ('runs/' + str(reuse.RUN), 'run_attempt', 2), ('jobs/119090160085', 'conclusion', 'skipped'), ('jobs/119090160085', 'run_id', 1), ('jobs/119091427956', 'steps', [])]:
            bad = copy.deepcopy(source); bad[path][key] = value
            with self.assertRaises(AssertionError): reuse.verify_jobs(bad.__getitem__)

    def test_artifact_identity_and_exact_bytes_fail_closed(self):
        aid, name, size, digest = reuse.ARTIFACTS['backend']
        meta = {'id': aid, 'name': name, 'size_in_bytes': size, 'digest': 'sha256:' + digest, 'expired': False, 'workflow_run': {'id': reuse.RUN, 'head_sha': reuse.SOURCE}}
        reuse.artifact_identity(meta, 'backend')
        for key, value in [('id', 1), ('name', 'other'), ('size_in_bytes', 1), ('digest', 'wrong'), ('expired', True), ('workflow_run', {'id': 1, 'head_sha': reuse.SOURCE})]:
            with self.assertRaises(AssertionError): reuse.artifact_identity({**meta, key: value}, 'backend')
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / 'fake.zip'; file.write_bytes(b'not the original artifact')
            with self.assertRaises(AssertionError): reuse.checked_zip(file, 'backend', Path(folder) / 'out')
            self.assertFalse((Path(folder) / 'out').exists())

    def test_closure_rejects_backend_fixture_config_helper_or_selection_drift(self):
        workflow = "header\nenv:\n  TZ: UTC\njobs:\n  build:\n    runs-on: ubuntu-24.04\n    steps:\n      - uses: actions/setup-node@v4\n        with:\n          node-version: '24.21.0'\n" + '  browser:\n    runs-on: ubuntu-24.04\n    env:\n      NODE_ENV: test\n    services:\n      pg: fixed\n    steps:\n      - name: exact affected contracts, types, lint and dependency audit\n        env:\n          NODE_ENV: test\n        run: bash checks\n' + "      - uses: actions/setup-node@v4\n        with:\n          node-version: '24.21.0'\n  sast:\n"
        selected = {'tests': {'backend': ['a.test.ts']}}
        old_checks = 'before\n  node node_modules/typescript/bin/tsc -p tsconfig.cognitive.json --noEmit\nafter'
        def fake_git(*args):
            if args[0] == 'diff': return '\n'.join(reuse.FRONTEND_REPAIR_PATHS)
            if args[0] == 'rev-parse': return 'same-tree'
            name = args[1].split(':', 1)[1]
            if name.endswith('bindings.json'): return json.dumps(selected)
            if name.endswith('checks.sh'): return old_checks
            return workflow
        with tempfile.TemporaryDirectory() as folder:
            previous = Path.cwd(); os.chdir(folder)
            try:
                Path('.github/scripts').mkdir(parents=True); Path('.github/workflows').mkdir()
                Path('.github/scripts/scale-authoring-bindings.json').write_text(json.dumps(selected))
                Path('.github/scripts/scale-authoring-checks.sh').write_text('before\nafter\n')
                wp = Path('.github/workflows/ci-scale-authoring.yml'); wp.write_text(workflow)
                with patch.object(reuse, 'git', fake_git): reuse.check_closure()
                with patch.object(reuse, 'git', lambda *args: 'unexpected-frontend-input' if args[0]=='diff' else fake_git(*args)), self.assertRaises(ValueError): reuse.check_closure()
                for target in reuse.CLOSURE:
                    def drift(*args):
                        return 'changed' if args == ('rev-parse', 'HEAD:' + target) else fake_git(*args)
                    with patch.object(reuse, 'git', drift), self.assertRaises(ValueError): reuse.check_closure()
                for path, text in [('.github/scripts/scale-authoring-bindings.json', json.dumps({'tests': {'backend': []}})), ('.github/scripts/scale-authoring-checks.sh', 'changed-backend-check'), (str(wp), workflow.replace('pg: fixed', 'pg: changed')), (str(wp), workflow.replace('TZ: UTC','TZ: different'))]:
                    file = Path(path); original = file.read_text(); file.write_text(text)
                    with patch.object(reuse, 'git', fake_git), self.assertRaises(ValueError): reuse.check_closure()
                    file.write_text(original)
            finally: os.chdir(previous)

    def test_original_frontend_report_cannot_hide_failed_skipped_or_missing_inputs(self):
        report = {'success': True, 'numPassedTests': 123, 'numFailedTests': 0, 'numFailedTestSuites': 0, 'numPendingTests': 0, 'testResults': [{'name': '/runner/server-version/frontend/unchanged.test.ts', 'assertionResults': [{'status': 'passed'}]}]}
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); file = root / 'frontend-tests.json'; file.write_text(json.dumps(report))
            reuse.verify_frontend_report(root, ['unchanged.test.ts'])
            for bad in [{**report, 'numPendingTests': 1}, {**report, 'numPassedTests': 0}, {**report, 'testResults': []}, {**report, 'success': False}]:
                file.write_text(json.dumps(bad))
                with self.assertRaises(AssertionError): reuse.verify_frontend_report(root, ['unchanged.test.ts'])
            file.write_text(json.dumps(report))
            with self.assertRaises(AssertionError): reuse.verify_frontend_report(root, ['different.test.ts'])

    def test_old_reports_require_real_selected_passes_audit_scan_pg_and_cleanup(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); reports = root / 'reports'; browser = root / 'browser'; reports.mkdir(); browser.mkdir()
            data = {
                reports / 'backend-tests.json': {'success': True, 'numPassedTests': 174, 'numFailedTests': 0, 'numFailedTestSuites': 0, 'numPendingTests': 0, 'testResults': [{'name': '/runner/server-version/backend/a.test.ts', 'assertionResults': [{'status': 'passed'}]}]},
                reports / 'backend-audit.json': {'metadata': {'vulnerabilities': {'high': 0, 'critical': 0}}},
                reports / 'backend-runtime-scan.json': {'Results': [{'Vulnerabilities': []}]},
                reports / 'backend-runtime-output.json': {'head': reuse.SOURCE, 'sameCompilerOutput': True, 'files': {'index.js': 'hash'}},
                browser / 'postgres.json': {'success': True, 'numPassedTests': 1, 'numFailedTests': 0, 'numFailedTestSuites': 0, 'testResults': [{'assertionResults': [{'title': reuse.TITLE, 'status': 'passed'}]}]},
                browser / 'cleanup.json': {'exitStatus': 0, 'privateMaterialRemoved': True},
            }
            for file, value in data.items(): file.write_text(json.dumps(value))
            reuse.verify_reports(reports, browser, ['a.test.ts'])
            for file, mutate in [
                (reports / 'backend-tests.json', lambda x: x.update(numPendingTests=1)),
                (reports / 'backend-tests.json', lambda x: x['testResults'][0]['assertionResults'][0].update(status='failed')),
                (reports / 'backend-audit.json', lambda x: x['metadata']['vulnerabilities'].update(high=1)),
                (reports / 'backend-runtime-scan.json', lambda x: x['Results'][0].update(Vulnerabilities=[{'Severity': 'HIGH'}])),
                (browser / 'postgres.json', lambda x: x['testResults'][0]['assertionResults'].append({'title': reuse.TITLE, 'status': 'passed'})),
                (browser / 'postgres.json', lambda x: x.update(numPassedTests=0)),
                (browser / 'cleanup.json', lambda x: x.update(privateMaterialRemoved=False)),
            ]:
                bad = copy.deepcopy(data[file]); mutate(bad); file.write_text(json.dumps(bad))
                with self.assertRaises(AssertionError): reuse.verify_reports(reports, browser, ['a.test.ts'])
                file.write_text(json.dumps(data[file]))
            with self.assertRaises(AssertionError): reuse.verify_reports(reports, browser, ['missing.test.ts'])


if __name__ == '__main__':
    unittest.main()
