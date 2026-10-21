"""Pure rejection contracts. No network, application, database or browser execution."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('admission', Path(__file__).with_name('scale-authoring-admission.py'))
a = importlib.util.module_from_spec(spec); spec.loader.exec_module(a)


class AdmissionTests(unittest.TestCase):
    def test_official_selected_jobs_require_exact_source_run_and_success(self):
        def read(path):
            if path.startswith('runs/'):
                return {'head_sha': a.SOURCE, 'run_attempt': 1, 'status': 'completed', 'conclusion': 'success', 'path': '.github/workflows/ci-scale-authoring-browser-diagnostic.yml', 'event': 'push', 'head_branch': 'ci/scale-authoring-browser-diagnostic-20261021'}
            jid = int(path.split('/')[1]); names = {119138000303: 'scope', 119138159777: 'browser', 119138159971: 'sast', 119139431753: 'ready'}
            run, head = (a.RUN, a.SOURCE) if jid in names else ((39565491980, '9b289945f5c782b98027ff7228c344c362247e17') if jid == 119106743347 else (39568118300, '312cfdc95e53b243b2de0bea9beb5ca3a3132a81'))
            return {'name': names.get(jid, 'prior'), 'run_id': run, 'head_sha': head, 'conclusion': 'success'}
        a.verify_final_jobs(read)
        for status in ['failure', 'cancelled', 'skipped', None]:
            for path in ['runs/' + str(a.RUN), 'jobs/119138159777', 'jobs/119139431753', 'jobs/119115404858']:
                with self.assertRaises(AssertionError): a.verify_final_jobs(lambda p: {**read(p), 'conclusion': status} if p == path else read(p))
        for key, value in [('head_sha', '0' * 40), ('run_attempt', 2), ('path', '.github/workflows/other.yml')]:
            with self.assertRaises(AssertionError): a.verify_final_jobs(lambda p: {**read(p), key: value} if p.startswith('runs/') else read(p))

    def test_complete_candidate_scope_rejects_unknown_product_and_merge_tree(self):
        head = '1' * 40; tree = '2' * 40
        plan = {'candidate': 'scale-authoring', 'base': a.BASE, 'postMerge': False, 'sourceHead': head, 'head': head, 'tree': tree}
        def git(*args):
            if args[0] == 'rev-parse': return tree if args[1].endswith('^{tree}') else head
            if '--name-only' in args: return '\n'.join(sorted(a.CONTROL_PATHS))
            return '\n'.join(':100644 100644 ' + '3' * 40 + ' ' + '4' * 40 + ' M\t' + name for name in sorted(a.CONTROL_PATHS))
        env = {'CI_EVENT': 'pull_request', 'CI_HEAD_REF': 'work/scale-authoring-feedback-20261021', 'CI_SOURCE_HEAD': head}
        with patch.dict(os.environ, env), patch.object(a.reuse, 'git', git), patch.object(a.subprocess, 'check_output', return_value=json.dumps(plan)):
            a.check_scope(plan)
            with patch.object(a.reuse, 'git', lambda *x: git(*x) + '\nserver-version/frontend/src/pages/ScaleEdit.tsx' if '--name-only' in x else git(*x)), self.assertRaises(AssertionError): a.check_scope(plan)
            with patch.object(a.reuse, 'git', lambda *x: '5' * 40 if x[0] == 'rev-parse' and x[1] == head + '^{tree}' else git(*x)), self.assertRaises(AssertionError): a.check_scope(plan)
            with patch.dict(os.environ, {'CI_HEAD_REF': 'other'}), self.assertRaises(AssertionError): a.check_scope(plan)
            with self.assertRaises(AssertionError): a.check_scope({**plan, 'base': '6' * 40})
            with patch.object(a.subprocess, 'check_output', return_value='{}'), self.assertRaises(AssertionError): a.check_scope(plan)

    def test_browser_missing_or_modified_original_report_is_never_admitted(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); (root / 'browser').mkdir(); (root / 'browser/result.json').write_text('{"status":"PASS"}')
            with self.assertRaises(AssertionError): a.verify_browser(root, root)


if __name__ == '__main__': unittest.main()
