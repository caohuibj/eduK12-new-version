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
    def test_exact_current_consumed_module(self):
        source = (ROOT / 'training-mac-runtime.py').read_text()
        self.assertEqual(M.consumed_hash(source), M.CONSUMED_SHA256)
        self.assertNotEqual(M.consumed_hash(source + '\nUNREVIEWED = True\n'), M.CONSUMED_SHA256)
        self.assertNotEqual(M.consumed_hash(source.replace('def prepare(self):', 'def changed_prepare(self):')), M.CONSUMED_SHA256)

    def test_only_browser_input_can_change(self):
        value = json.loads((ROOT / 'training-mac-inputs.json').read_text())
        self.assertEqual(M.input_hash(json.dumps(value)), M.INPUTS_SHA256)
        value['macRuntime']['browserScriptBlob'] = 'different-browser'
        self.assertEqual(M.input_hash(json.dumps(value)), M.INPUTS_SHA256)
        value['macRuntime']['changedLintFiles'].append('unreviewed.ts')
        self.assertNotEqual(M.input_hash(json.dumps(value)), M.INPUTS_SHA256)

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

    def test_exact_four_selected_checks(self):
        self.assertEqual(M.PHASES, ('backend-compile', 'frontend-compile', 'frontend-app-types', 'changed-lint'))
        self.assertNotIn('compiled-browser', M.PHASES)
        self.assertNotIn('scoped-pg-http', M.PHASES)


if __name__ == '__main__': unittest.main()
