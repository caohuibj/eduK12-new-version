"""Lightweight static/input guard tests; import never starts services."""
import ast
import importlib.util
from pathlib import Path
import sys
import unittest
sys.dont_write_bytecode = True
BASE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('c20_efficiency_launcher_tested', BASE / 'c20-efficiency-http.py')
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class EfficiencyLauncherContract(unittest.TestCase):
    def test_baseline_only_and_consumer_first(self):
        launcher.validate_phase('before', launcher.PINNED_HEAD)
        self.assertEqual(launcher.selected_scenarios('all'), ['consumers', 'chains'])
        self.assertEqual(launcher.selected_scenarios('consumers'), ['consumers'])
        launcher.validate_phase('before', '1' * 40)
        for phase, head in [('after', launcher.PINNED_HEAD), ('before', 'short')]:
            with self.assertRaises(AssertionError):
                launcher.validate_phase(phase, head)

    def test_structural_readiness_policy(self):
        self.assertTrue(launcher.old.postgres_readiness_status(0, {'ready': True}))
        self.assertFalse(launcher.old.postgres_readiness_status(75, {'code': '57P03'}))
        for code in ['28P01', 'ECONNREFUSED', '42501', 'NO_SQLSTATE']:
            with self.assertRaises(RuntimeError):
                launcher.old.postgres_readiness_status(1, {'code': code})
        with self.assertRaises(RuntimeError):
            launcher.old.postgres_readiness_status(75, {'code': '57P03', 'extra': 'not the required contract'})

    def test_no_functional_phase_replay_or_restore_launch(self):
        source = (BASE / 'c20-efficiency-http.py').read_text()
        ast.parse(source)
        self.assertNotIn('args.continuation', source)
        self.assertNotIn('db.restore(', source)
        self.assertNotIn('db.apply_role(', source)
        self.assertNotIn('c20-materials-main.mjs', source)
        self.assertIn("fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)", source)
        self.assertIn("name.startswith('producer-')", source)
        self.assertIn("time.sleep(.2)", source)
        self.assertIn("- copy_bytes - 512 * 1024 ** 2 >= FLOOR", source)
        self.assertIn("count == initial_final_count", source)
        self.assertIn("count - initial_final_count <= 10", source)
        self.assertIn("current_source == old_source", source)
        self.assertIn("PINNED_HEAD, args.expected_head, '--', *BUSINESS", source)
        self.assertIn("empty business path enumeration is invalid", source)
        self.assertIn("pinned['runtimeFingerprint'] == source_result['runtimeFingerprint']", source)
        self.assertLess(source.index('# Stop a failed/in-flight producer'), source.index("write('c20-efficiency-final-db-snapshot.json'"))

    def test_business_filter_keeps_real_inputs(self):
        self.assertTrue(launcher.business_input('server-version/backend/src/index.ts'))
        self.assertTrue(launcher.business_input('server-version/backend/package.json'))
        self.assertFalse(launcher.business_input('server-version/backend/src/__tests__/fixture.ts'))
        self.assertFalse(launcher.business_input('server-version/backend/src/example.test.ts'))
        self.assertFalse(launcher.business_input('server-version/backend/src/example.spec.ts'))

    def test_frozen_plan_constants_and_required_observer(self):
        self.assertEqual(len(launcher.PINNED_PLAN), 64)
        self.assertEqual(len(launcher.PINNED_RUNTIME), 64)
        self.assertEqual(len(launcher.PINNED_DUMP), 64)
        self.assertIn('c20-efficiency-observer.mjs', launcher.SUPPORT)
        self.assertIn('c20-materials-client.mjs', launcher.SUPPORT)
        self.assertIn('loopback-only.cjs', launcher.SUPPORT)


if __name__ == '__main__':
    unittest.main()
