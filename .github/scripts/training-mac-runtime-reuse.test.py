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
