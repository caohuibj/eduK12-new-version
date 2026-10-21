import ast
import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).parent
spec = importlib.util.spec_from_file_location('reuse', ROOT / 'training-mac-runtime-reuse.py')
M = importlib.util.module_from_spec(spec); spec.loader.exec_module(M)


class Contract(unittest.TestCase):
    def test_exact_current_security_module(self):
        source = (ROOT / 'training-mac-runtime.py').read_bytes()
        self.assertEqual(M.hashlib.sha256(source).hexdigest(), M.REVIEWED_SECURITY_RUNTIME_SHA256)
        self.assertNotEqual(M.hashlib.sha256(source + b'\nUNREVIEWED = True\n').hexdigest(), M.REVIEWED_SECURITY_RUNTIME_SHA256)

    def test_security_inputs_require_exact_bytes_not_generic_lock_exemption(self):
        raw = (ROOT / 'training-mac-inputs.json').read_bytes()
        self.assertEqual(M.hashlib.sha256(raw).hexdigest(), M.REVIEWED_SECURITY_INPUTS_SHA256)
        value = json.loads(raw)
        self.assertNotEqual(M.input_hash(raw), M.INPUTS_SHA256)
        value['macRuntime']['dependencyPatch']['toVersion'] = '1.16.2'
        self.assertNotEqual(M.hashlib.sha256(json.dumps(value).encode()).hexdigest(), M.REVIEWED_SECURITY_INPUTS_SHA256)

    def test_new_archive_requires_complete_dist_equality(self):
        from types import SimpleNamespace
        old = M.ARTIFACTS['frontend']['archiveSha256']; new = 'a' * 64
        equality = dict(equal=True, originalArchiveSha256=old, currentArchiveSha256=new,
            originalInventorySha256='b'*64, currentInventorySha256='b'*64,
            originalFileCount=415, currentFileCount=415, filesCompared=415)
        def reached_api(path): raise RuntimeError('verified-input-reached-api')
        q = SimpleNamespace(ready=lambda name: None, api=reached_api,
            state={'components':{'frontend':{'compiledArchiveSha256':new,'distEquality':equality}}})
        with self.assertRaisesRegex(RuntimeError, 'verified-input-reached-api'): M.admit_prior_browser_success(q)
        for key, bad in [('equal',False),('originalArchiveSha256',new),('currentArchiveSha256',old),
                         ('currentInventorySha256','c'*64),('currentFileCount',414)]:
            saved=equality[key]; equality[key]=bad
            with self.assertRaisesRegex(ValueError,'Browser compiled input changed'): M.admit_prior_browser_success(q)
            equality[key]=saved

    def test_round8_refuses_wrong_producer_before_download(self):
        from types import SimpleNamespace
        from unittest.mock import patch
        pin=M.ROUND8_PIN
        run={'id':int(pin['runId']),'run_attempt':1,'head_sha':'wrong','head_branch':'work/training-mac-ui-final-20261020',
             'repository':{'full_name':'caohuibj/eduK12-new-version'},'head_repository':{'full_name':'caohuibj/eduK12-new-version'}}
        q=SimpleNamespace(api=lambda path: run)
        with patch.object(M,'REVIEWED_SECURITY_RUNTIME_SHA256',M.hashlib.sha256((ROOT/'training-mac-runtime.py').read_bytes()).hexdigest()), patch.object(M,'REVIEWED_SECURITY_INPUTS_SHA256',M.hashlib.sha256((ROOT/'training-mac-inputs.json').read_bytes()).hexdigest()):
            with self.assertRaisesRegex(ValueError,'Wrong round8 producer'):M.admit_round8_successes(q)

    def test_round9_refuses_wrong_producer_before_download(self):
        from types import SimpleNamespace
        from unittest.mock import patch
        pin=M.ROUND9_PIN
        run={'id':int(pin['runId']),'run_attempt':1,'head_sha':'wrong','head_branch':'work/training-mac-ui-final-20261020',
             'repository':{'full_name':'caohuibj/eduK12-new-version'},'head_repository':{'full_name':'caohuibj/eduK12-new-version'}}
        q=SimpleNamespace(api=lambda path: run)
        with patch.object(M,'REVIEWED_SECURITY_RUNTIME_SHA256',M.hashlib.sha256((ROOT/'training-mac-runtime.py').read_bytes()).hexdigest()), patch.object(M,'REVIEWED_SECURITY_INPUTS_SHA256',M.hashlib.sha256((ROOT/'training-mac-inputs.json').read_bytes()).hexdigest()):
            with self.assertRaisesRegex(ValueError,'Wrong round9 producer'):M.admit_round9_successes(q)

    def test_round8_case_inference_preserves_failed_case(self):
        self.assertEqual(len(set(M.ROUND8_PASSED_CASES)),3)
        self.assertNotIn(M.ROUND8_FAILED_CASE,M.ROUND8_PASSED_CASES)
        self.assertEqual(M.ROUND8_PIN['runId'],'39526376171')
        source=(ROOT/'training-mac-runtime-reuse.py').read_text()
        self.assertIn("phases['scoped-pg-http']['status'] == 'failure'",source)
        self.assertIn('original per-case reporter was not retained',source)

    def test_artifact_refuses_expiry_and_cross_run(self):
        p = M.ARTIFACTS['backend']
        a = dict(id=p['artifactId'], name=p['artifactName'], expired=False, size_in_bytes=p['zipBytes'], digest='sha256:' + p['zipSha256'], workflow_run={'id':int(M.PIN['runId']), 'head_sha':M.PIN['sourceHead']})
        M.validate_artifact(a, p)
        a['expired'] = True
        with self.assertRaises(ValueError): M.validate_artifact(a, p)
        a['expired'] = False; a['workflow_run']['head_sha'] = 'wrong'
        with self.assertRaises(ValueError): M.validate_artifact(a, p)

    def test_download_supplies_required_official_repository(self):
        source = (ROOT / 'training-mac-runtime-reuse.py').read_text()
        self.assertIn("q.download({**pin, 'repository': 'caohuibj/eduK12-new-version'}, target)", source)

    def test_browser_case_is_unarmed_or_wrong_source_fail_closed(self):
        with self.assertRaisesRegex(ValueError, 'Unreviewed browser'):
            M.validate_browser_case({}, {}, {}, b'{}', b'unreviewed')
        self.assertEqual(M.BROWSER_PIN['runId'], '39512542094')
        self.assertEqual(M.BROWSER_PIN['jobId'], 118936926887)
        self.assertNotIn('compiled-browser', M.PHASES)

    def test_exact_four_selected_checks(self):
        self.assertEqual(M.PHASES, ('backend-compile', 'frontend-compile', 'frontend-app-types', 'changed-lint'))
        self.assertNotIn('compiled-browser', M.PHASES)
        self.assertNotIn('scoped-pg-http', M.PHASES)


if __name__ == '__main__': unittest.main()
