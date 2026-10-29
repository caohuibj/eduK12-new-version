import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('native_runtime', Path(__file__).with_name('school-teacher-native-runtime.py'))
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


class ContextContract(unittest.TestCase):
    def test_only_exact_same_run_attempt_component_and_archive_can_feed_runtime(self):
        with tempfile.TemporaryDirectory() as temp:
            archive = Path(temp) / 'context.tar.gz'
            archive.write_bytes(b'synthetic-not-extracted')
            plan = {'head': 'a' * 40, 'components': {'backend': 'b' * 40}}
            env = {'GITHUB_SHA': plan['head'], 'GITHUB_RUN_ID': '123', 'GITHUB_RUN_ATTEMPT': '1'}
            lock = hashlib.sha256((native.ROOT / 'server-version/backend/package-lock.json').read_bytes()).hexdigest()
            receipt = {'schemaVersion': 1, 'kind': 'backend', 'head': plan['head'], 'tree': 'b' * 40, 'runId': '123', 'attempt': '1', 'archiveSha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'manifest': {'sha': plan['head'], 'runId': '123', 'kind': 'backend', 'lockDigest': lock}}
            native.verify_context(receipt, 'backend', plan, env, archive)
            for key in ('kind', 'head', 'tree', 'runId', 'attempt', 'archiveSha256'):
                changed = dict(receipt, **{key: 'wrong'})
                with self.subTest(key=key), self.assertRaises(ValueError):
                    native.verify_context(changed, 'backend', plan, env, archive)
            changed = json.loads(json.dumps(receipt)); changed['manifest']['lockDigest'] = 'f' * 64
            with self.assertRaises(ValueError):
                native.verify_context(changed, 'backend', plan, env, archive)

    def test_existing_runtime_recipes_consume_compiled_bytes_without_rebuilding(self):
        node, nginx = 'node@sha256:' + 'a' * 64, 'nginx@sha256:' + 'b' * 64
        for component in ('frontend', 'backend'):
            original = (native.ROOT / 'server-version' / component / 'Dockerfile').read_text()
            recipe = native.runtime.runtime_recipe(component, original, node, nginx)
            self.assertNotIn('npm run build', recipe)
            self.assertNotIn('npm ci', recipe)
            self.assertIn('COPY', recipe)
            with self.assertRaises(ValueError):
                native.runtime.runtime_recipe(component, original, 'node:latest', nginx)


if __name__ == '__main__':
    unittest.main()
