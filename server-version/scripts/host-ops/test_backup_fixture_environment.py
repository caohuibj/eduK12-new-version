"""Local verification must run the same assertions without impersonating CI."""
import importlib.util
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).parent))
spec = importlib.util.spec_from_file_location('fixture', Path(__file__).with_name('ci-backup-smoke.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)


class FixtureEnvironment(unittest.TestCase):
    def test_hosted_guard_is_preserved(self):
        env = {'CI': 'true', 'GITHUB_ACTIONS': 'true', 'NODE_ENV': 'test'}
        fixture.require_fixture_environment(False, env, 0, Path('/synthetic'))
        for invalid, uid in [(env, 501), ({**env, 'NODE_ENV': 'production'}, 0), ({}, 0)]:
            with self.assertRaisesRegex(RuntimeError, 'ISOLATED_HOSTED_CI_ONLY'):
                fixture.require_fixture_environment(False, invalid, uid, Path('/synthetic'))

    def test_local_requires_dedicated_socket_without_ci_or_context_override(self):
        home = Path('/synthetic')
        env = {'NODE_ENV': 'test', 'DOCKER_HOST': 'unix:///synthetic/.colima/r5-validation/docker.sock'}
        fixture.require_fixture_environment(True, env, 501, home)
        for change in [{'CI': 'true'}, {'GITHUB_ACTIONS': 'true'}, {'NODE_ENV': 'production'},
                       {'DOCKER_CONTEXT': 'remote'}, {'DOCKER_HOST': 'tcp://production:2375'},
                       {'DOCKER_HOST': 'unix:///var/run/docker.sock'}, {'DOCKER_HOST': ''}]:
            with self.assertRaisesRegex(RuntimeError, 'ISOLATED_LOCAL_DOCKER_ONLY'):
                fixture.require_fixture_environment(True, {**env, **change}, 501, home)


if __name__ == '__main__':
    unittest.main()
