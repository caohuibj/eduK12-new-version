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

    def test_after_requires_exact_bounded_contract(self):
        contract = {'schemaVersion': 1, 'phase': 'after', 'beforeRuntimeSha256': launcher.PINNED_BEFORE_RUNTIME,
                    'runtimeFingerprintSha256': 'a' * 64,
                    'businessChanges': {next(iter(launcher.AFTER_BUSINESS_PATHS)): {'beforeSha256': 'b' * 64, 'afterSha256': 'c' * 64}}}
        launcher.validate_phase('after', '1' * 40, contract)
        for change in [{'beforeRuntimeSha256': 'd' * 64}, {'businessChanges': {}},
                       {'businessChanges': {'server-version/backend/prisma/schema.prisma': {'beforeSha256': 'b' * 64, 'afterSha256': 'c' * 64}}},
                       {'runtimeFingerprintSha256': 'missing'}]:
            with self.assertRaises(AssertionError):
                launcher.validate_phase('after', '1' * 40, {**contract, **change})
        with self.assertRaises(AssertionError):
            launcher.validate_phase('before', '1' * 40, contract)
        source = (BASE / 'c20-efficiency-http.py').read_text()
        self.assertIn("args.scenario == 'consumers'", source)
        self.assertIn("'comparison instrumentation changed'", source)
        self.assertIn("'--baseline', baseline_binding", source)
        self.assertIn("row['sqlCount'] <= 26", source)
        self.assertIn("max(row['sqlCount']", source)

    def test_before_instrumentation_rejects_tampered_frozen_inputs(self):
        path = 'server-version/scripts/recovery/c20-efficiency-consumers.mjs'
        inputs = [{'path': path, 'mode': 420, 'sha256': 'a' * 64}]
        digest = launcher.digest(inputs)
        receipt = {'sourceInputsSha256': digest, 'scenarios': {'consumers': {'producerSha256': 'a' * 64}}}
        frozen = {'sourceInputs': inputs, 'sourceInputsSha256': digest}
        self.assertEqual(launcher.validate_before_instrumentation(receipt, frozen)[path], 'a' * 64)
        for changed in [{'sourceInputs': [{**inputs[0], 'sha256': 'b' * 64}]}, {'sourceInputsSha256': 'b' * 64}]:
            with self.assertRaises(AssertionError):
                launcher.validate_before_instrumentation(receipt, {**frozen, **changed})
        with self.assertRaises(AssertionError):
            launcher.validate_before_instrumentation({**receipt, 'scenarios': {'consumers': {'producerSha256': 'b' * 64}}}, frozen)

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
